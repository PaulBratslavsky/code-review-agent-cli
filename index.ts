#!/usr/bin/env npx tsx
import { Command } from "commander";
import { runAgent } from "./agent.js";

const DEFAULT_PROMPT =
  "Explore all the files in the current directory. List them and provide a brief summary of what this project is about. Then review all source files for bugs, security issues, and code quality.";

const VALID_TOOLS = new Set(["Read", "Edit", "Glob", "Grep", "Write", "Bash", "Skill"]);
const VALID_PERMISSION_MODES = new Set(["default", "acceptEdits", "bypassPermissions"]);

function checkApiKey(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("\x1b[31mError: ANTHROPIC_API_KEY is not set.\x1b[0m\n");
    console.error("Set it in your shell profile (persists across sessions):");
    console.error("  echo 'export ANTHROPIC_API_KEY=your-api-key' >> ~/.zshrc");
    console.error("  source ~/.zshrc\n");
    console.error("Or pass it inline for a single run:");
    console.error("  ANTHROPIC_API_KEY=your-api-key code-review-agent \"Review this codebase\"\n");
    console.error("Get your API key at: https://platform.claude.com/");
    process.exit(1);
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
    "Read,Edit,Glob,Grep,Write,Bash,Skill"
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
  .option("--max-passes <n>", "Max review passes for --fix-recursive", (val: string) => {
    const parsed = Number.parseInt(val, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error("--max-passes must be a positive integer");
    }
    return parsed;
  })
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
        console.warn("\x1b[33m⚠ WARNING: Running in bypassPermissions mode. Files may be modified without confirmation.\x1b[0m");
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
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error("\x1b[31mError:\x1b[0m", error.message);
        if (process.env.DEBUG) {
          console.error(error.stack);
        }
      } else {
        console.error("\x1b[31mError:\x1b[0m", String(error));
      }
      process.exit(1);
    }
  });

program.parse(process.argv);
