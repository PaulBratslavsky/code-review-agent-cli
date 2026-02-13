export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  // Safely truncate at character boundary to avoid splitting multi-byte UTF-8 sequences
  let truncateAt = max;
  while (truncateAt > 0 && (value.charCodeAt(truncateAt) & 0xC0) === 0x80) {
    truncateAt--;
  }
  return value.slice(0, truncateAt) + "...";
}

export function stripAnsiCodes(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function sanitize(str: unknown): string {
  return String(str)
    .replace(/[\x00-\x08\x0B-\x1F\x7F-\x9F]/g, "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/[\r\n\t]/g, " ")
    .trim();
}

export function cleanMarkdownRemnants(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "\x1b[1m$1\x1b[22m")  // **bold**
    .replace(/\*(.+?)\*/g, "\x1b[3m$1\x1b[23m")       // *italic*
    .replace(/`([^`]+)`/g, "\x1b[36m$1\x1b[39m");      // `code`
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
  const maxWidth = (process.stdout.columns ?? DEFAULT_TERMINAL_WIDTH) - TOOL_DISPLAY_PADDING;
  return `${name} > ${truncate(JSON.stringify(input), maxWidth)}`;
}
