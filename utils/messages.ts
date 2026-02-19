import { stripAnsiCodes } from "./formatting.js";

export interface QueryResult {
  lastText: string;
  editCount: number;
  editedFiles: string[];
}

export function isValidMessage(message: unknown): message is Record<string, unknown> {
  return !!message && typeof message === "object" && !Array.isArray(message);
}

/** Returns the last text block from an assistant message, or null if none found. */
export function extractLastText(msg: Record<string, unknown>): string | null {
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

function isFileModificationBlock(block: unknown): block is Record<string, unknown> {
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

export function collectEdits(msg: Record<string, unknown>, editedFiles: Set<string>): number {
  if (msg.type !== "assistant") return 0;
  const assistant = msg as { message?: { content?: unknown[] } };
  const content = assistant.message?.content;
  if (!Array.isArray(content)) return 0;

  let count = 0;
  for (const block of content) {
    if (isFileModificationBlock(block)) {
      count++;
      const filePath = getEditFilePath(block);
      if (filePath) editedFiles.add(filePath);
    }
  }
  return count;
}

export function getStatusFromOutput(text: string): "all_clear" | "critical_remaining" | "unknown" {
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
