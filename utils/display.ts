import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import {
  cleanMarkdownRemnants,
  formatToolCall,
  stripAnsiCodes,
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

async function handleContentBlock(block: unknown): Promise<void> {
  if (typeof block !== "object" || block === null) return;
  const b = block as Record<string, unknown>;

  if (b.type === "thinking" && typeof b.thinking === "string") {
    console.log("\n\x1b[2m💭 Thinking:\x1b[0m");
    let thinking = b.thinking;
    if (thinking.length > 1000) {
      // Safely truncate at character boundary to avoid splitting multi-byte UTF-8 sequences
      let truncateAt = 997;
      while (truncateAt > 0 && (thinking.charCodeAt(truncateAt) & 0xC0) === 0x80) {
        truncateAt--;
      }
      thinking = thinking.slice(0, truncateAt) + "...";
    }
    console.log(`\x1b[2m${thinking}\x1b[0m\n`);
    return;
  }

  if (b.type === "tool_use" && typeof b.name === "string") {
    const input = typeof b.input === "object" && b.input !== null
      ? (b.input as Record<string, unknown>)
      : {};
    console.log(`\n\x1b[36m🔧 ${formatToolCall(b.name, input)}\x1b[0m`);
    return;
  }

  if (typeof b.text === "string") {
    try {
      const rendered = await marked.parse(b.text);
      process.stdout.write(cleanMarkdownRemnants(rendered));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`\x1b[33m⚠ Markdown rendering failed: ${errorMsg}\x1b[0m`);
      if (process.env.DEBUG && error instanceof Error) {
        console.error(error.stack);
      }
      // Fallback: output raw text with ANSI codes stripped
      process.stdout.write(stripAnsiCodes(String(b.text)));
    }
  }
}

function handleToolResult(message: Record<string, unknown>): void {
  if (typeof message.tool_use_result !== "object" || message.tool_use_result === null) return;
  const result = message.tool_use_result as Record<string, unknown>;
  if ("stderr" in result && typeof result.stderr === "string" && result.stderr.trim()) {
    console.log(`\x1b[31m   ${result.stderr.trim()}\x1b[0m`);
  }
}

function handleToolProgress(message: ToolProgressMessage): void {
  console.log(`\x1b[33m⏳ ${message.tool_name} (${message.elapsed_time_seconds}s)\x1b[0m`);
}

function handleResult(message: ResultMessage): void {
  console.log("\n\x1b[32m✅ Done\x1b[0m");
  console.log(`   Turns: ${message.num_turns}`);
  console.log(`   Duration: ${(message.duration_ms / 1000).toFixed(1)}s`);
  console.log(`   Cost: $${message.total_cost_usd.toFixed(4)}`);
  if (message.is_error) {
    console.log(`\x1b[31m   Error: ${message.errors?.join(", ")}\x1b[0m`);
  }
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
