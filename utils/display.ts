import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import {
  cleanMarkdownRemnants,
  formatToolCall,
} from "./formatting.js";

interface ToolProgressMessage {
  type: "tool_progress";
  tool_name: string;
  elapsed_time_seconds: number;
}

interface ResultMessage {
  type: "result";
  subtype: string;
  is_error: boolean;
  num_turns: number;
  duration_ms: number;
  total_cost_usd: number;
  errors?: string[];
}

marked.use(markedTerminal({ showSectionPrefix: false }));

const MAX_DIFF_LINES = 30;

function showEditDiff(input: Record<string, unknown>): void {
  const filePath = typeof input.file_path === "string" ? input.file_path : "unknown";
  const oldStr = typeof input.old_string === "string" ? input.old_string : null;
  const newStr = typeof input.new_string === "string" ? input.new_string : null;

  if (oldStr === null || newStr === null) return;

  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const totalLines = oldLines.length + newLines.length;

  // Show short file path (last 2 segments)
  const pathSegments = filePath.split("/");
  const shortPath = pathSegments.length >= 2 ? pathSegments.slice(-2).join("/") : filePath;

  console.log(`\x1b[2m  ┌─ ${shortPath}\x1b[0m`);

  const truncated = totalLines > MAX_DIFF_LINES;
  const maxOld = truncated ? Math.floor(MAX_DIFF_LINES / 2) : oldLines.length;
  const maxNew = truncated ? Math.floor(MAX_DIFF_LINES / 2) : newLines.length;

  for (let i = 0; i < Math.min(oldLines.length, maxOld); i++) {
    console.log(`\x1b[31m  - ${oldLines[i]}\x1b[0m`);
  }
  for (let i = 0; i < Math.min(newLines.length, maxNew); i++) {
    console.log(`\x1b[32m  + ${newLines[i]}\x1b[0m`);
  }

  if (truncated) {
    console.log(`\x1b[2m  ... ${totalLines - MAX_DIFF_LINES} more lines\x1b[0m`);
  }
  console.log(`\x1b[2m  └─\x1b[0m`);
}

async function handleContentBlock(block: unknown): Promise<void> {
  if (typeof block !== "object" || block === null) return;
  const b = block as Record<string, unknown>;

  if (b.type === "thinking" && typeof b.thinking === "string") {
    console.log("\n\x1b[2m💭 Thinking:\x1b[0m");
    let thinking = b.thinking;
    if (thinking.length > 1000) {
      thinking = thinking.slice(0, 997) + "...";
    }
    console.log(`\x1b[2m${thinking}\x1b[0m\n`);
    return;
  }

  if (b.type === "tool_use" && typeof b.name === "string") {
    const input = (typeof b.input === "object" && b.input !== null)
      ? (b.input as Record<string, unknown>)
      : {};
    console.log(`\n\x1b[36m🔧 ${formatToolCall(b.name, input)}\x1b[0m`);
    if (b.name === "Edit") {
      showEditDiff(input);
    }
    return;
  }

  if (typeof b.text === "string") {
    const textContent = b.text;
    try {
      const rendered = await marked.parse(textContent);
      process.stdout.write(cleanMarkdownRemnants(rendered));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`\x1b[33m⚠ Markdown rendering failed: ${errorMsg}\x1b[0m`);
      console.error("\x1b[2m  (Set DEBUG=1 for stack trace)\x1b[0m");
      if (process.env.DEBUG && error instanceof Error) {
        console.error(error.stack);
      }
      // Fallback: strip ANSI/control chars and output as plain text
      try {
        const sanitized = textContent
          .replaceAll(/\x1b\[[0-9;]*m/g, "")
          .replaceAll(/[\x00-\x08\x0B-\x1F\x7F-\x9F]/g, "");
        process.stdout.write(sanitized + "\n");
      } catch (fallbackError) {
        console.error("\x1b[31m✖ Failed to output text\x1b[0m");
        if (process.env.DEBUG) {
          console.error("Fallback error:", fallbackError);
        }
      }
    }
  }
}

function handleToolResult(message: Record<string, unknown>): void {
  if (typeof message.tool_use_result !== "object" || message.tool_use_result === null) return;
  const result = message.tool_use_result as Record<string, unknown>;
  if ("stderr" in result && typeof result.stderr === "string") {
    const stderrTrimmed = result.stderr.trim();
    if (stderrTrimmed.length > 0) {
      console.log(`\x1b[31m   ${stderrTrimmed}\x1b[0m`);
    }
  }
}

function handleToolProgress(message: ToolProgressMessage): void {
  console.log(`\x1b[33m⏳ ${message.tool_name} (${message.elapsed_time_seconds}s)\x1b[0m`);
}

function handleResult(message: ResultMessage): void {
  if (message.is_error) {
    const errorDetail = message.errors && message.errors.length > 0 ? message.errors.join(", ") : "unknown error";
    console.log(`\n\x1b[31m❌ Failed: ${errorDetail}\x1b[0m`);
  } else {
    console.log("\n\x1b[32m✅ Done\x1b[0m");
  }
  console.log(`   Turns: ${message.num_turns}`);
  console.log(`   Duration: ${(message.duration_ms / 1000).toFixed(1)}s`);
  console.log(`   Cost: $${message.total_cost_usd.toFixed(4)}`);

}

export async function showMessage(message: Record<string, unknown>): Promise<void> {
  const msgType = message.type;

  if (msgType === "assistant") {
    const msg = message as { message?: { content?: unknown[] } };
    if (msg.message?.content && Array.isArray(msg.message.content)) {
      for (const block of msg.message.content) {
        await handleContentBlock(block);
      }
    }
  } else if (msgType === "user") {
    if (message.tool_use_result) {
      handleToolResult(message);
    }
  } else if (msgType === "tool_progress") {
    handleToolProgress(message as unknown as ToolProgressMessage);
  } else if (msgType === "result") {
    handleResult(message as unknown as ResultMessage);
  }
}
