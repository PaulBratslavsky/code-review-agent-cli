#!/usr/bin/env npx tsx
import { createInterface } from "node:readline";
import { Command } from "commander";
import { runAgent } from "./agent.js";

const DEFAULT_PROMPT =
  "Explore all the files in the current directory. List them and provide a brief summary of what this project is about. Then review all source files for bugs, security issues, and code quality.";

const VALID_TOOLS = new Set(["Read", "Edit", "Glob", "Grep", "Write", "Bash"]);
const VALID_PERMISSION_MODES = new Set(["default", "acceptEdits", "bypassPermissions"]);

function checkApiKey(): void {
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

const program = new Command();

program
  .name("code-review-agent")
  .description("Code review and audit agent powered by Claude")
  .version("1.0.0")
  .argument("[prompt]", "The prompt to send to the agent")
  .option("-m, --model <model>", "Model to use", "claude-sonnet-4-5-20250929")
  .option(
    "-t, --tools <tools>",
    "Comma-separated allowed tools",
    "Read,Edit,Glob,Grep,Write,Bash"
  )
  .option(
    "-p, --permission-mode <mode>",
    "Permission mode: default, acceptEdits, bypassPermissions",
    "acceptEdits"
  )
  .option("--max-turns <n>", "Max turns", (val: string) => {
    const parsed = Number.parseInt(val, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error("--max-turns must be a positive integer");
    }
    return parsed;
  })
  .option("--fix", "Apply recommended fixes to source files")
  .option("--fix-recursive", "Review, fix, and re-review until no critical issues remain")
  .option("--max-passes <n>", "Max review passes for --fix-recursive (default: 5)", (val: string) => {
    const parsed = Number.parseInt(val, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error("--max-passes must be a positive integer");
    }
    return parsed;
  }, 5)
  .option("--cwd <dir>", "Working directory")
  .action(async (prompt: string | undefined, opts) => {
    checkApiKey();
    try {
      const tools = opts.tools.split(",").map((t: string) => t.trim());
      const invalidTools = tools.filter((t: string) => !VALID_TOOLS.has(t));
      if (invalidTools.length > 0) {
        throw new Error(`Invalid tools: ${invalidTools.join(", ")}`);
      }

      if (!VALID_PERMISSION_MODES.has(opts.permissionMode)) {
        throw new Error(`Invalid permission mode: ${opts.permissionMode}. Must be one of: ${Array.from(VALID_PERMISSION_MODES).join(", ")}`);
      }

      if (opts.permissionMode === "bypassPermissions") {
        if (process.env.CONFIRM_BYPASS_PERMISSIONS !== "1") {
          throw new Error(
            "bypassPermissions mode requires CONFIRM_BYPASS_PERMISSIONS=1 environment variable. " +
            "Example: CONFIRM_BYPASS_PERMISSIONS=1 code-review-agent --fix -p bypassPermissions \"Review this\""
          );
        }
        if (!process.stdin.isTTY) {
          throw new Error("bypassPermissions mode requires an interactive terminal (no piped input).");
        }
        const cwd = opts.cwd ?? process.cwd();
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

      await runAgent(prompt ?? DEFAULT_PROMPT, {
        model: opts.model,
        tools,
        permissionMode: opts.permissionMode,
        maxTurns: opts.maxTurns,
        fix: Boolean(opts.fix || opts.fixRecursive),
        fixRecursive: Boolean(opts.fixRecursive),
        maxPasses: opts.maxPasses,
        cwd: opts.cwd,
        bypassConfirmed: opts.permissionMode === "bypassPermissions",
      });
    } catch (error) {
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
  });

program.parse(process.argv);
