import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "..", "prompts");
const SKILLS_DIR = resolve(__dirname, "..", "skills");

const MAX_PROMPT_LENGTH = (() => {
  if (!process.env.MAX_PROMPT_LENGTH) return 50000;
  const parsed = Number.parseInt(process.env.MAX_PROMPT_LENGTH, 10);
  if (Number.isNaN(parsed) || parsed < 1) return 50000;
  return Math.min(parsed, 100000);
})();

let cachedSystemPrompt: string | null = null;

export async function loadSystemPrompt(): Promise<string> {
  if (cachedSystemPrompt !== null) return cachedSystemPrompt;
  const promptPath = resolve(PROMPTS_DIR, "system.md");
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

export async function loadSkills(): Promise<string> {
  if (cachedSkills !== null) return cachedSkills;
  let entries: string[];
  try {
    entries = await readdir(SKILLS_DIR);
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
    mdFiles.map(file => readFile(join(SKILLS_DIR, file), "utf-8"))
  );
  const parts = contents.map(c => c.trim());
  cachedSkills = "\n\n" + parts.join("\n\n");
  return cachedSkills;
}

export function validatePrompt(prompt: string): void {
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

export const FIX_PROMPT_PREFIX =
  "IMPORTANT: You are in fix mode. You MUST apply fixes using the Edit tool — do not just report issues. " +
  "For each bug or issue you find, immediately call the Edit tool to fix it in the source file. " +
  "Do NOT ask the user if they want fixes applied — apply them directly.\n\n";

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

export function getFixInstructions(opts: AgentOptions): string {
  if (opts.fixRecursive) return FIX_RECURSIVE_INSTRUCTIONS;
  if (opts.fix) return FIX_MODE_INSTRUCTIONS;
  return "";
}
