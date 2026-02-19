import { query, type PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import {
  showMessage,
  isValidMessage,
  extractLastText,
  collectEdits,
  getStatusFromOutput,
  loadSystemPrompt,
  loadSkills,
  validatePrompt,
  getFixInstructions,
  FIX_PROMPT_PREFIX,
  type QueryResult,
  type AgentOptions,
} from "./utils/index.js";

export type { AgentOptions } from "./utils/index.js";

const VALID_MODELS = new Set(["claude-sonnet-4-5-20250929", "claude-opus-4-6", "claude-opus-4"]);
const VALID_PERMISSION_MODES = new Set<PermissionMode>(["default", "acceptEdits", "bypassPermissions"]);
const DEFAULT_MAX_PASSES = 5;

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

async function executeQuery(prompt: string, options: Record<string, unknown>): Promise<QueryResult> {
  let lastText = "";
  let editCount = 0;
  const editedFiles = new Set<string>();

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
