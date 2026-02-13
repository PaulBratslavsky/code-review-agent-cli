import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { query, type PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { showMessage } from "./utils/display.js";
import { stripAnsiCodes } from "./utils/formatting.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const VALID_MODELS = new Set(["claude-sonnet-4-5-20250929", "claude-opus-4-6", "claude-opus-4"]);
const VALID_PERMISSION_MODES = new Set<PermissionMode>(["default", "acceptEdits", "bypassPermissions"]);
const MAX_PROMPT_LENGTH = (() => {
  if (!process.env.MAX_PROMPT_LENGTH) return 50000;
  const parsed = Number.parseInt(process.env.MAX_PROMPT_LENGTH, 10);
  if (Number.isNaN(parsed) || parsed < 1) return 50000;
  return Math.min(parsed, 100000);
})();

let cachedSystemPrompt: string | null = null;

async function loadSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt !== null) return cachedSystemPrompt;
  const promptPath = resolve(__dirname, "prompts/system.md");
  try {
    cachedSystemPrompt = await readFile(promptPath, "utf-8");
    return cachedSystemPrompt;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const wrapped = new Error(
      `Failed to load system prompt from ${promptPath}. Ensure prompts/system.md exists.\nCause: ${errorMsg}`,
      error instanceof Error ? { cause: error } : undefined
    );
    if (error instanceof Error && error.stack) {
      wrapped.stack = `${wrapped.stack}\n\nCaused by:\n${error.stack}`;
    }
    throw wrapped;
  }
}

let cachedSkills: string | null = null;

async function loadSkills(): Promise<string> {
  if (cachedSkills !== null) return cachedSkills;
  const skillsDir = resolve(__dirname, "skills");
  let entries: string[];
  try {
    entries = await readdir(skillsDir);
  } catch (error) {
    const errCode = (error as NodeJS.ErrnoException).code;
    if (errCode === "ENOENT" || errCode === "ENOTDIR") {
      cachedSkills = "";
      return cachedSkills;
    }
    throw new Error(`Failed to read skills directory: ${error instanceof Error ? error.message : String(error)}`);
  }
  const mdFiles = entries.filter(f => f.endsWith(".md")).sort((a, b) => a.localeCompare(b));
  if (mdFiles.length === 0) {
    cachedSkills = "";
    return cachedSkills;
  }

  const contents = await Promise.all(
    mdFiles.map(file => readFile(join(skillsDir, file), "utf-8"))
  );
  const parts = contents.map(c => c.trim());
  cachedSkills = "\n\n" + parts.join("\n\n");
  return cachedSkills;
}

export interface AgentOptions {
  model?: string;
  tools?: string[];
  permissionMode?: string;
  maxTurns?: number;
  fix?: boolean;
  fixRecursive?: boolean;
  maxPasses?: number;
  cwd?: string;
  bypassConfirmed?: boolean;
}

function validatePrompt(prompt: string): void {
  if (!prompt || prompt.trim().length === 0) {
    throw new Error("Prompt cannot be empty");
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`);
  }
}

const FIX_MODE_INSTRUCTIONS = `

## Fix Mode

Fix mode is enabled. You MUST apply fixes, not just report them.

### Process
1. Review the code and identify Critical and Warning issues.
2. For EACH issue found, immediately use the Edit tool to fix it in the source file.
3. After all edits are applied, output a summary listing every file you changed and what you fixed.

### Rules
- Fix Critical and Warning issues. Skip Suggestions unless they are trivial.
- Make the smallest possible change for each fix — do not refactor surrounding code.
- You MUST call the Edit tool for each fix. Do not just describe the fix — apply it.
`;

const FIX_RECURSIVE_INSTRUCTIONS = `

## Recursive Fix Mode

Recursive fix mode is enabled. You MUST apply fixes, not just report them.

### Process
1. Review the code and identify Critical and Warning issues.
2. For EACH issue found, immediately use the Edit tool to fix it in the source file.
3. After all edits are applied, output a summary in this exact format:

### Fixes Applied
- **file.ts:LINE** — description of what was fixed

If no fixes were needed, write: "No fixes needed."

4. On your VERY LAST line of output (after everything else), write ONLY one of these two status markers on its own line:
  - CRITICAL_REMAINING: N  (where N is the count of Critical issues you could NOT fix)
  - ALL_CLEAR  (if zero Critical issues remain after your fixes)

### Rules
- You MUST call the Edit tool for each fix. Do not just describe the fix — apply it.
- Fix Critical and Warning issues. Skip Suggestions.
- Make the smallest possible change — do not refactor surrounding code.
- The status marker must be the VERY LAST line, with nothing after it.
`;

const DEFAULT_MAX_PASSES = 5;

const FIX_PROMPT_PREFIX =
  "IMPORTANT: You are in fix mode. You MUST apply fixes using the Edit tool — do not just report issues. " +
  "For each bug or issue you find, immediately call the Edit tool to fix it in the source file. " +
  "Do NOT ask the user if they want fixes applied — apply them directly.\n\n";

function getFixInstructions(opts: AgentOptions): string {
  if (opts.fixRecursive) return FIX_RECURSIVE_INSTRUCTIONS;
  if (opts.fix) return FIX_MODE_INSTRUCTIONS;
  return "";
}

function resolveOptions(opts: AgentOptions, promptAppend: string) {
  const model = opts.model ?? "claude-sonnet-4-5-20250929";
  if (!VALID_MODELS.has(model)) {
    throw new Error(`Invalid model: ${model}`);
  }

  const permissionMode = (opts.permissionMode ?? "acceptEdits") as PermissionMode;
  if (!VALID_PERMISSION_MODES.has(permissionMode)) {
    throw new Error(`Invalid permission mode: ${permissionMode}`);
  }

  if (permissionMode === "bypassPermissions" && !opts.bypassConfirmed) {
    throw new Error("bypassPermissions requires confirmation via the CLI");
  }

  return {
    model,
    allowedTools: opts.tools ?? ["Read", "Edit", "Glob", "Grep", "Write", "Bash"],
    permissionMode,
    systemPrompt: {
      type: "preset" as const,
      preset: "claude_code" as const,
      append: promptAppend,
    },
    ...(opts.maxTurns && { maxTurns: opts.maxTurns }),
    ...(opts.cwd && { cwd: opts.cwd }),
  };
}

// Returns the last text block from an assistant message, or null if none found.
function extractLastText(msg: Record<string, unknown>): string | null {
  if (msg.type !== "assistant") return null;
  const assistant = msg as { message?: { content?: unknown[] } };
  const content = assistant.message?.content;
  if (!Array.isArray(content)) return null;

  let text: string | null = null;
  for (const block of content) {
    if (typeof block === "object" && block !== null && "text" in block) {
      const textValue = (block as Record<string, unknown>).text;
      if (typeof textValue === "string") {
        text = textValue;
      }
    }
  }
  return text;
}

function isValidMessage(message: unknown): message is Record<string, unknown> {
  return !!message && typeof message === "object" && !Array.isArray(message);
}

interface QueryResult {
  lastText: string;
  editCount: number;
  editedFiles: string[];
}

function isEditBlock(block: unknown): block is Record<string, unknown> {
  if (typeof block !== "object" || block === null || !("name" in block)) return false;
  const name = (block as Record<string, unknown>).name;
  return name === "Edit" || name === "Write";
}

function getEditFilePath(block: Record<string, unknown>): string | null {
  if (typeof block.input !== "object" || block.input === null) return null;
  const input = block.input as Record<string, unknown>;
  const filePath = input.file_path;
  if (typeof filePath === "string" && filePath.length > 0) return filePath;
  return null;
}

function collectEdits(msg: Record<string, unknown>, editedFiles: Set<string>): number {
  if (msg.type !== "assistant") return 0;
  const assistant = msg as { message?: { content?: unknown[] } };
  const content = assistant.message?.content;
  if (!Array.isArray(content)) return 0;

  let count = 0;
  for (const block of content) {
    if (isEditBlock(block)) {
      count++;
      const filePath = getEditFilePath(block);
      if (filePath) editedFiles.add(filePath);
    }
  }
  return count;
}

async function executeQuery(prompt: string, options: Record<string, unknown>): Promise<QueryResult> {
  let lastText = "";
  let editCount = 0;
  const editedFiles = new Set<string>();

  // Validate prompt is not empty after sanitization
  // Strip control characters except tabs (\x09), newlines (\x0A), and carriage returns (\x0D)
  const sanitizedPrompt = prompt.replaceAll(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  if (sanitizedPrompt.trim().length === 0) {
    throw new Error("Prompt is empty after sanitization");
  }

  try {
    for await (const message of query({ prompt: sanitizedPrompt, options })) {
      if (!isValidMessage(message)) continue;
      if (typeof message.type !== "string") continue;

      editCount += collectEdits(message, editedFiles);
      await showMessage(message);
      lastText = extractLastText(message) ?? lastText;
    }
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`Query execution failed: ${String(error)}`);
  }

  return { lastText, editCount, editedFiles: Array.from(editedFiles) };
}

function getStatusFromOutput(text: string): "all_clear" | "critical_remaining" | "unknown" {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "unknown";
  const lines = trimmed.split("\n");
  const lastLine = lines.length > 0 ? stripAnsiCodes(lines[lines.length - 1].trim()).toUpperCase() : "";
  if (lastLine === "ALL_CLEAR") return "all_clear";

  const match = /^CRITICAL_REMAINING:\s*(\d+)$/i.exec(lastLine);
  if (match && match[1]) {
    const count = Number.parseInt(match[1], 10);
    if (!Number.isNaN(count) && count >= 0 && count < 1000000) {
      return count === 0 ? "all_clear" : "critical_remaining";
    }
  }
  return "unknown";
}

async function runRecursive(prompt: string, options: Record<string, unknown>, maxPasses: number): Promise<void> {
  if (!Number.isInteger(maxPasses) || maxPasses < 1 || maxPasses > 100) {
    throw new Error("maxPasses must be an integer between 1 and 100");
  }

  console.log(`\n\x1b[35m━━━ Pass 1/${maxPasses} ━━━\x1b[0m\n`);
  let result = await executeQuery(FIX_PROMPT_PREFIX + prompt, options);
  console.log(`\n\x1b[36m━━━ Pass 1 complete: ${result.editCount} file edit(s) applied ━━━\x1b[0m`);

  for (let pass = 2; pass <= maxPasses; pass++) {
    if (result.editCount === 0) {
      // No edits in the last pass — check if the agent confirmed all clear
      const status = getStatusFromOutput(result.lastText);
      if (status === "all_clear") {
        console.log("\n\x1b[32m━━━ All critical issues resolved ━━━\x1b[0m\n");
      } else {
        console.log("\x1b[33m⚠ No edits were made — stopping early.\x1b[0m\n");
      }
      return;
    }
    // Edits were made — always re-review to verify fixes didn't introduce new issues

    const fileList = result.editedFiles.length > 0
      ? `Re-review these modified files: ${result.editedFiles.join(", ")}.`
      : "Re-review all source files that were just modified.";
    const reReviewPrompt = fileList +
      " Check if the fixes introduced new issues. Fix any remaining Critical or Warning issues.";

    console.log(`\n\x1b[35m━━━ Pass ${pass}/${maxPasses} ━━━\x1b[0m\n`);
    result = await executeQuery(reReviewPrompt, options);
    console.log(`\n\x1b[36m━━━ Pass ${pass} complete: ${result.editCount} file edit(s) applied ━━━\x1b[0m`);
  }

  const finalStatus = getStatusFromOutput(result.lastText);
  if (finalStatus === "all_clear") {
    console.log("\n\x1b[32m━━━ All critical issues resolved ━━━\x1b[0m\n");
  } else {
    console.log(`\n\x1b[33m━━━ Reached max passes (${maxPasses}). Some critical issues may remain. ━━━\x1b[0m\n`);
  }
}

function wrapQueryError(error: unknown): Error {
  if (error instanceof Error) {
    const wrapped = new Error(`Agent query failed: ${error.message}`);
    if (error.stack) {
      wrapped.stack = `${wrapped.stack}\nCaused by: ${error.stack}`;
    }
    return wrapped;
  }
  return new Error(`Agent query failed: ${String(error)}`);
}

export async function runAgent(prompt: string, opts: AgentOptions = {}): Promise<void> {
  validatePrompt(prompt);
  await loadSystemPrompt(); // Validate that system prompt exists

  const skills = await loadSkills();
  const promptAppend = skills + getFixInstructions(opts);
  const options = resolveOptions(opts, promptAppend);

  try {
    if (opts.fixRecursive) {
      await runRecursive(prompt, options, opts.maxPasses ?? DEFAULT_MAX_PASSES);
    } else if (opts.fix) {
      const { editCount } = await executeQuery(FIX_PROMPT_PREFIX + prompt, options);
      console.log(`\n\x1b[36m━━━ ${editCount} file edit(s) applied ━━━\x1b[0m\n`);
    } else {
      await executeQuery(prompt, options);
    }
  } catch (error) {
    throw wrapQueryError(error);
  }
}
