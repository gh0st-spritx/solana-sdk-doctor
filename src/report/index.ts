import type { Report } from "../types";
import { renderMarkdown } from "./markdown";
import { renderTable } from "./table";

export type Format = "table" | "json" | "markdown";

export function render(report: Report, format: Format, opts: { color?: boolean; verbose?: boolean } = {}): string {
  switch (format) {
    case "json":
      return JSON.stringify(report, null, 2) + "\n";
    case "markdown":
      return renderMarkdown(report);
    default:
      return renderTable(report, opts);
  }
}

export { renderMarkdown, renderTable };
