import { createInterface } from "node:readline";

export const VALID_TOOLS = new Set(["Read", "Edit", "Glob", "Grep", "Write", "Bash"]);
export const VALID_PERMISSION_MODES = new Set(["default", "acceptEdits", "bypassPermissions"]);

export function checkApiKey(): void {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.error("\x1b[31mError: ANTHROPIC_API_KEY is not set or empty.\x1b[0m\n");
    console.error("Set it in your shell profile (persists across sessions):");
    console.error("  echo 'export ANTHROPIC_API_KEY=your-api-key' >> ~/.zshrc");
    console.error("  source ~/.zshrc\n");
    console.error("Or pass it inline for a single run:");
    console.error("  ANTHROPIC_API_KEY=your-api-key code-review-agent \"Review this codebase\"\n");
    console.error("Get your API key at: https://platform.claude.com/");
    process.exit(1);
  }

  // Basic format validation
  const trimmed = apiKey.trim();
  if (trimmed.length < 40 || !/^sk-ant-[a-zA-Z0-9_-]{40,}$/.test(trimmed)) {
    console.error("\x1b[33m⚠ Warning: ANTHROPIC_API_KEY may have an invalid format.\x1b[0m");
    console.error("\x1b[33m  Expected format: sk-ant-...\x1b[0m\n");
  }
}

export function parseTools(raw: string): string[] {
  const tools = raw.split(",").map(t => t.trim());
  const invalid = tools.filter(t => !VALID_TOOLS.has(t));
  if (invalid.length > 0) {
    throw new Error(`Invalid tools: ${invalid.join(", ")}`);
  }
  return tools;
}

export function validatePermissionMode(mode: string): void {
  if (!VALID_PERMISSION_MODES.has(mode)) {
    throw new Error(`Invalid permission mode: ${mode}. Must be one of: ${Array.from(VALID_PERMISSION_MODES).join(", ")}`);
  }
}

export function handleError(error: unknown): never {
  const isValidation = error instanceof Error &&
    (error.message.includes("Invalid") || error.message.includes("must be"));
  if (error instanceof Error) {
    console.error("\x1b[31mError:\x1b[0m", error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
  } else {
    console.error("\x1b[31mError:\x1b[0m", String(error));
  }
  process.exit(isValidation ? 2 : 1);
}

export async function confirmBypass(cwd: string): Promise<void> {
  if (process.env.CONFIRM_BYPASS_PERMISSIONS !== "1") {
    throw new Error(
      "bypassPermissions mode requires CONFIRM_BYPASS_PERMISSIONS=1 environment variable. " +
      "Example: CONFIRM_BYPASS_PERMISSIONS=1 code-review-agent --fix -p bypassPermissions \"Review this\""
    );
  }
  if (!process.stdin.isTTY) {
    throw new Error("bypassPermissions mode requires an interactive terminal (no piped input).");
  }

  console.error("\x1b[33m⚠ WARNING: Running in bypassPermissions mode.\x1b[0m");
  console.error("\x1b[33m⚠ Files may be modified without confirmation.\x1b[0m");
  console.error(`\x1b[33m⚠ Working directory: ${cwd}\x1b[0m`);

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  let answer: string;
  try {
    answer = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        rl.close();
        reject(new Error("Timeout waiting for confirmation (30s)."));
      }, 30000);
      rl.question("\x1b[33m⚠ Type 'yes' to confirm: \x1b[0m", (ans) => {
        clearTimeout(timeout);
        resolve(ans);
      });
    });
  } finally {
    rl.close();
  }

  if (answer.trim().toLowerCase() !== "yes") {
    console.error("\x1b[31mAborted.\x1b[0m");
    process.exit(1);
  }
}
