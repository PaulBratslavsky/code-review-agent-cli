#!/usr/bin/env npx tsx
import { Command } from "commander";
import { runAgent } from "./agent.js";
import { checkApiKey, parseTools, validatePermissionMode, handleError, confirmBypass } from "./utils/validation.js";

const DEFAULT_PROMPT =
  "Explore all the files in the current directory. List them and provide a brief summary of what this project is about. Then review all source files for bugs, security issues, and code quality.";

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
  .action(run);

async function run(prompt: string | undefined, opts: Record<string, string>): Promise<void> {
  checkApiKey();
  try {
    const tools = parseTools(opts.tools);
    validatePermissionMode(opts.permissionMode);

    if (opts.permissionMode === "bypassPermissions") {
      await confirmBypass(opts.cwd ?? process.cwd());
    }

    await runAgent(prompt ?? DEFAULT_PROMPT, {
      model: opts.model,
      tools,
      permissionMode: opts.permissionMode,
      maxTurns: opts.maxTurns ? Number(opts.maxTurns) : undefined,
      fix: Boolean(opts.fix || opts.fixRecursive),
      fixRecursive: Boolean(opts.fixRecursive),
      maxPasses: opts.maxPasses ? Number(opts.maxPasses) : undefined,
      cwd: opts.cwd,
      bypassConfirmed: opts.permissionMode === "bypassPermissions",
    });
  } catch (error) {
    handleError(error);
  }
}

program.parse(process.argv);
