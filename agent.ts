import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { query, type PermissionMode, type SettingSource } from "@anthropic-ai/claude-agent-sdk";
import { showMessage } from "./utils/display.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const VALID_MODELS = new Set(["claude-sonnet-4-5-20250929", "claude-opus-4-6", "claude-opus-4"]);
const VALID_PERMISSION_MODES = new Set<PermissionMode>(["default", "acceptEdits", "bypassPermissions"]);
const MAX_PROMPT_LENGTH = (() => {
  if (!process.env.MAX_PROMPT_LENGTH) return 50000;
  const parsed = Number.parseInt(process.env.MAX_PROMPT_LENGTH, 10);
  return Number.isNaN(parsed) ? 50000 : Math.min(parsed, 100000);
})();

async function loadSystemPrompt(): Promise<string> {
  const promptPath = resolve(__dirname, "prompts/system.md");
  try {
    return await readFile(promptPath, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to load system prompt from ${promptPath}. Ensure prompts/system.md exists. ${error instanceof Error ? error.message : String(error)}`
    );
  }
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

function buildPromptAppend(systemPromptText: string, opts: AgentOptions): string {
  if (opts.fixRecursive) return systemPromptText + FIX_RECURSIVE_INSTRUCTIONS;
  if (opts.fix) return systemPromptText + FIX_MODE_INSTRUCTIONS;
  return systemPromptText;
}

function resolveOptions(opts: AgentOptions, systemPromptText: string) {
  const model = opts.model ?? "claude-sonnet-4-5-20250929";
  if (!VALID_MODELS.has(model)) {
    throw new Error(`Invalid model: ${model}`);
  }

  const permissionMode = (opts.permissionMode ?? "acceptEdits") as PermissionMode;
  if (!VALID_PERMISSION_MODES.has(permissionMode)) {
    throw new Error(`Invalid permission mode: ${permissionMode}`);
  }

  return {
    model,
    allowedTools: opts.tools ?? ["Read", "Edit", "Glob", "Grep", "Write", "Bash", "Skill"],
    permissionMode,
    // Only loads project-level settings — run on trusted projects only
    settingSources: ["project"] as SettingSource[],
    systemPrompt: {
      type: "preset" as const,
      preset: "claude_code" as const,
      append: buildPromptAppend(systemPromptText, opts),
    },
    ...(opts.maxTurns && { maxTurns: opts.maxTurns }),
    ...(opts.cwd && { cwd: opts.cwd }),
  };
}

function extractLastText(msg: Record<string, unknown>): string | null {
  if (msg.type !== "assistant") return null;
  const assistant = msg as { message?: { content?: unknown[] } };
  const content = assistant.message?.content;
  if (!Array.isArray(content)) return null;

  let text: string | null = null;
  for (const block of content) {
    if (typeof block === "object" && block !== null && "text" in block) {
      text = String((block as Record<string, unknown>).text);
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
}

function countEdits(msg: Record<string, unknown>): number {
  if (msg.type !== "assistant") return 0;
  const assistant = msg as { message?: { content?: unknown[] } };
  const content = assistant.message?.content;
  if (!Array.isArray(content)) return 0;

  let count = 0;
  for (const block of content) {
    if (typeof block === "object" && block !== null && "name" in block) {
      const name = (block as Record<string, unknown>).name;
      if (name === "Edit" || name === "Write") count++;
    }
  }
  return count;
}

async function executeQuery(prompt: string, options: Record<string, unknown>): Promise<QueryResult> {
  let lastText = "";
  let editCount = 0;

  for await (const message of query({ prompt, options })) {
    if (!isValidMessage(message)) continue;
    if (typeof message.type !== "string") continue;

    editCount += countEdits(message);
    await showMessage(message);
    lastText = extractLastText(message) ?? lastText;
  }

  return { lastText, editCount };
}

function getStatusFromOutput(text: string): "all_clear" | "critical_remaining" | "unknown" {
  if (!text || text.trim().length === 0) return "unknown";
  const lastLine = text.trim().split("\n").pop()?.trim() ?? "";
  if (/^ALL_CLEAR$/.test(lastLine)) return "all_clear";
  if (/^CRITICAL_REMAINING:\s*\d+$/.test(lastLine)) return "critical_remaining";
  return "unknown";
}

async function runRecursive(prompt: string, options: Record<string, unknown>, maxPasses: number): Promise<void> {
  const RE_REVIEW_PROMPT =
    FIX_PROMPT_PREFIX +
    "Re-review all source files that were just modified. Check if the fixes introduced new issues. Fix any remaining Critical or Warning issues.";

  console.log(`\n\x1b[35m━━━ Pass 1/${maxPasses} ━━━\x1b[0m\n`);
  let result = await executeQuery(FIX_PROMPT_PREFIX + prompt, options);
  console.log(`\n\x1b[36m━━━ Pass 1 complete: ${result.editCount} file edit(s) applied ━━━\x1b[0m`);

  for (let pass = 2; pass <= maxPasses; pass++) {
    if (result.editCount === 0) {
      console.log("\x1b[33m⚠ No edits were made — stopping early.\x1b[0m\n");
      return;
    }

    const status = getStatusFromOutput(result.lastText);
    if (status === "all_clear") {
      console.log("\n\x1b[32m━━━ All critical issues resolved ━━━\x1b[0m\n");
      return;
    }

    console.log(`\n\x1b[35m━━━ Pass ${pass}/${maxPasses} ━━━\x1b[0m\n`);
    result = await executeQuery(RE_REVIEW_PROMPT, options);
    console.log(`\n\x1b[36m━━━ Pass ${pass} complete: ${result.editCount} file edit(s) applied ━━━\x1b[0m`);
  }

  const finalStatus = getStatusFromOutput(result.lastText);
  if (finalStatus === "all_clear") {
    console.log("\n\x1b[32m━━━ All critical issues resolved ━━━\x1b[0m\n");
  } else {
    console.log(`\n\x1b[33m━━━ Reached max passes (${maxPasses}). Some critical issues may remain. ━━━\x1b[0m\n`);
  }
}

function wrapQueryError(error: unknown): never {
  if (error instanceof Error) {
    const wrapped = new Error(`Agent query failed: ${error.message}`);
    if (error.stack) {
      wrapped.stack = `${wrapped.stack}\nCaused by: ${error.stack}`;
    }
    throw wrapped;
  }
  throw new Error(`Agent query failed: ${String(error)}`);
}

export async function runAgent(prompt: string, opts: AgentOptions = {}): Promise<void> {
  validatePrompt(prompt);
  const systemPromptText = await loadSystemPrompt();
  const options = resolveOptions(opts, systemPromptText);

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
    wrapQueryError(error);
  }
}
