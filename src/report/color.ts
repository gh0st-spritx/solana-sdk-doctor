export interface Palette {
  red: (s: string) => string;
  yellow: (s: string) => string;
  green: (s: string) => string;
  cyan: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
}

const wrap = (open: number, close: number) => (s: string) => `\u001b[${open}m${s}\u001b[${close}m`;
const id = (s: string) => s;

export function palette(enabled: boolean): Palette {
  if (!enabled) return { red: id, yellow: id, green: id, cyan: id, dim: id, bold: id };
  return { red: wrap(31, 39), yellow: wrap(33, 39), green: wrap(32, 39), cyan: wrap(36, 39), dim: wrap(2, 22), bold: wrap(1, 22) };
}

export function colorSupported(stream: NodeJS.WriteStream = process.stdout): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") return true;
  return !!stream.isTTY;
}

export const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");
