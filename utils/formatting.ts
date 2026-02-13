export function truncate(value: string, max: number): string {
  if (!Number.isInteger(max) || max < 3) {
    throw new Error("max must be an integer >= 3 to accommodate ellipsis");
  }
  const chars = Array.from(value);
  if (chars.length <= max) return value;
  return chars.slice(0, max - 3).join("") + "...";
}

export function stripAnsiCodes(text: string): string {
  return text.replaceAll(/\x1b\[[0-9;]*m/g, "");
}

// Sanitize for single-line display: removes control chars, ANSI codes, and converts whitespace to spaces
function sanitize(str: unknown): string {
  return String(str)
    .replaceAll(/[\x00-\x08\x0B-\x1F\x7F-\x9F]/g, "")
    .replaceAll(/\x1b\[[0-9;]*m/g, "")
    .replaceAll(/[\r\n\t]/g, " ")
    .trim();
}

export function cleanMarkdownRemnants(text: string): string {
  return text
    .replaceAll(/\*\*(.+?)\*\*/g, "\x1b[1m$1\x1b[22m")  // **bold**
    .replaceAll(/\*(.+?)\*/g, "\x1b[3m$1\x1b[23m")       // *italic*
    .replaceAll(/`([^`]+)`/g, "\x1b[36m$1\x1b[39m");      // `code`
}

type ToolFormatter = (input: Record<string, unknown>) => string;

const toolFormatters: Record<string, ToolFormatter> = {
  Bash: (input) => `Bash > ${sanitize(input.command)}`,
  Read: (input) => `Read > ${sanitize(input.file_path)}`,
  Write: (input) => `Write > ${sanitize(input.file_path)}`,
  Edit: (input) => `Edit > ${sanitize(input.file_path)}`,
  Glob: (input) => `Glob > ${sanitize(input.pattern)}${input.path ? ` in ${sanitize(input.path)}` : ""}`,
  Grep: (input) => `Grep > "${sanitize(input.pattern)}"${input.path ? ` in ${sanitize(input.path)}` : ""}`,
  WebSearch: (input) => `WebSearch > "${sanitize(input.query)}"`,
  WebFetch: (input) => `WebFetch > ${sanitize(input.url)}`,
};

const DEFAULT_TERMINAL_WIDTH = 100;
const TOOL_DISPLAY_PADDING = 20;

export function formatToolCall(name: string, input: Record<string, unknown>): string {
  const formatter = toolFormatters[name];
  if (formatter) return formatter(input);
  const columns = process.stdout.columns ?? DEFAULT_TERMINAL_WIDTH;
  const maxWidth = Math.max(20, columns - TOOL_DISPLAY_PADDING);
  return `${name} > ${truncate(JSON.stringify(input), maxWidth)}`;
}
