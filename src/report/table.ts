import type { Finding, Report, Status } from "../types";
import { palette, stripAnsi } from "./color";

const LABEL: Record<Status, string> = { pass: "PASS", info: "INFO", warn: "WARN", fail: "FAIL" };
/** Details blocks wrap at this width even on very wide terminals, for readability. */
const MAX_PROSE_WIDTH = 120;
const MIN_WIDTH = 40;

const visible = (s: string) => stripAnsi(s).length;

function pad(s: string, width: number): string {
  return s + " ".repeat(Math.max(0, width - visible(s)));
}

export function truncate(s: string, n: number): string {
  if (n <= 0) return "";
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + "…" : s;
}

/** Shorten `name@version` by eliding the name, so the version (the useful part) survives. */
export function truncatePackage(s: string, n: number): string {
  if (s.length <= n) return s;
  const at = s.lastIndexOf("@");
  if (at > 0) {
    const ver = s.slice(at);
    if (ver.length + 4 <= n) return s.slice(0, n - ver.length - 1) + "…" + ver;
  }
  return truncate(s, n);
}

/** Greedy word wrap with a hanging indent. Words longer than the line (URLs) are kept whole. */
export function wrap(text: string, width: number, first: string, rest = " ".repeat(first.length)): string[] {
  const out: string[] = [];
  let line = first;
  let empty = true;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!empty && visible(line) + 1 + word.length > width) {
      out.push(line);
      line = rest + word;
    } else {
      line += (empty ? "" : " ") + word;
    }
    empty = false;
  }
  out.push(line);
  return out;
}

function terminalWidth(explicit?: number): number {
  const envCols = Number(process.env.COLUMNS) || undefined;
  const tty = process.stdout.isTTY && process.stdout.columns ? process.stdout.columns : undefined;
  return Math.max(MIN_WIDTH, explicit ?? envCols ?? tty ?? 160);
}

type Column = "status" | "rule" | "package" | "finding" | "evidence";

interface Layout {
  columns: Column[];
  pkgCap?: number;
  minFinding: number;
  minEvidence?: number;
}

/**
 * Pick the richest table layout that fits `width`. Degrades in steps:
 * full -> shorter package names -> drop EVIDENCE -> drop PACKAGE -> stacked rows.
 * Nothing is lost: every non-passing row has a full, wrapped details block below the table.
 */
function chooseLayout(width: number, ruleW: number, pkgW: number): Layout | "stacked" {
  const candidates: Layout[] = [
    { columns: ["status", "rule", "package", "finding", "evidence"], minFinding: 28, minEvidence: 24 },
    { columns: ["status", "rule", "package", "finding", "evidence"], pkgCap: 26, minFinding: 20, minEvidence: 18 },
    { columns: ["status", "rule", "package", "finding"], minFinding: 24 },
    { columns: ["status", "rule", "package", "finding"], pkgCap: 26, minFinding: 20 },
    { columns: ["status", "rule", "finding"], minFinding: 16 },
  ];
  for (const c of candidates) {
    const pkg = c.columns.includes("package") ? Math.min(pkgW, c.pkgCap ?? pkgW) + 2 : 0;
    const fixed = 2 + 6 + 2 + ruleW + 2 + pkg;
    const flexible = width - fixed - (c.minEvidence ? 2 : 0);
    if (flexible >= c.minFinding + (c.minEvidence ?? 0)) return c;
  }
  return "stacked";
}

export function renderTable(report: Report, opts: { color?: boolean; verbose?: boolean; width?: number } = {}): string {
  const width = terminalWidth(opts.width);
  const proseWidth = Math.min(width, MAX_PROSE_WIDTH);
  const c = palette(!!opts.color);
  const paint: Record<Status, (s: string) => string> = { pass: c.green, info: c.cyan, warn: c.yellow, fail: c.red };
  const out: string[] = [];

  const title = `🩺 ${report.tool.name} v${report.tool.version}`;
  const meta = `${report.mode} mode  ·  ${report.rulesLoaded} rules  ·  ${report.manifests.length} package.json`;
  if (title.length + 5 + meta.length <= width) out.push(c.bold(title) + c.dim(`  ·  ${meta}`));
  else out.push(c.bold(title), ...wrap(meta.replace(/ {2}· {2}/g, " · "), width, "   ").map(c.dim));
  const root = report.root.length + 9 > width ? "…" + report.root.slice(report.root.length - (width - 10)) : report.root;
  out.push(c.dim(`   root: ${root}`));
  out.push("");

  if (report.findings.length === 0) {
    out.push(...wrap("No known Solana/oracle SDKs found in any package.json, and no code-level rules matched.", width, "").map(c.dim));
    return out.join("\n") + "\n";
  }

  const pkgText = (f: Finding) => (f.package ? `${f.package}${f.version ? "@" + f.version : ""}` : "(source code)");
  const ruleW = Math.max(4, ...report.findings.map((f) => f.ruleId.length));
  const pkgW = Math.max(7, ...report.findings.map((f) => pkgText(f).length));
  const layout = chooseLayout(width, ruleW, pkgW);
  const manifests = [...new Set(report.findings.map((f) => f.manifest))];
  const group = (emit: (f: Finding) => void) => {
    for (const m of manifests) {
      if (manifests.length > 1) out.push("  " + c.bold(truncate(`📦 ${m}`, width - 2)));
      for (const f of report.findings) if (f.manifest === m) emit(f);
    }
  };

  if (layout === "stacked") {
    group((f) => {
      out.push(`  ${paint[f.status](LABEL[f.status])}  ${c.bold(truncate(f.ruleId, width - 8))}`);
      out.push(`        ${truncate(f.title, width - 8)}`);
      if (f.package) out.push(c.dim(`        ${truncatePackage(pkgText(f), width - 8)}`));
    });
  } else {
    const has = (col: Column) => layout.columns.includes(col);
    const pkgCol = Math.min(pkgW, layout.pkgCap ?? pkgW);
    const fixed = 2 + 6 + 2 + ruleW + 2 + (has("package") ? pkgCol + 2 : 0);
    const flexible = width - fixed - (has("evidence") ? 2 : 0);
    const titleNatural = Math.max(7, ...report.findings.map((f) => f.title.length));
    const evNatural = Math.max(8, ...report.findings.map((f) => probeCell(f).length));
    const evShare = has("evidence") ? Math.max(layout.minEvidence ?? 0, Math.min(evNatural, Math.floor(flexible * 0.5))) : 0;
    const titleW = Math.min(titleNatural, flexible - evShare);
    const evW = flexible - titleW;
    const cells = (f: Finding): string[] => {
      const row = [paint[f.status](LABEL[f.status]), f.ruleId];
      if (has("package")) row.push(f.package ? truncatePackage(pkgText(f), pkgCol) : c.dim(truncate("(source code)", pkgCol)));
      row.push(truncate(f.title, titleW));
      if (has("evidence")) {
        const ev = probeCell(f);
        row.push(ev ? truncate(ev, evW) : c.dim(f.ruleId === "-" ? "" : "static rule"));
      }
      return row;
    };
    const header = ["STATUS", "RULE", ...(has("package") ? ["PACKAGE"] : []), "FINDING", ...(has("evidence") ? ["EVIDENCE"] : [])].map((h) => c.bold(h));
    const rows = new Map(report.findings.map((f) => [f, cells(f)]));
    const all = [header, ...rows.values()];
    const widths = header.map((_, i) => Math.max(...all.map((r) => visible(r[i]))));
    const line = (r: string[]) => "  " + r.map((cell, i) => (i === r.length - 1 ? cell : pad(cell, widths[i]))).join("  ");
    out.push(line(header));
    out.push("  " + c.dim(widths.map((w) => "─".repeat(w)).join("  ")));
    group((f) => out.push(line(rows.get(f)!)));
    const hidden = (["package", "evidence"] as Column[]).filter((col) => !has(col));
    if (hidden.length) out.push(c.dim(`  (narrow terminal: ${hidden.join(" + ")} column${hidden.length > 1 ? "s" : ""} hidden - full details below)`));
  }
  out.push("");

  const details = report.findings.filter((f) => f.status !== "pass" || opts.verbose);
  for (const f of details) {
    if (f.ruleId === "-") continue;
    const blockHead = `${paint[f.status](LABEL[f.status])} ${c.bold(f.ruleId)}`;
    if (visible(blockHead) + 4 + f.manifest.length <= width) out.push(`${blockHead} ${c.dim("in " + f.manifest)}`);
    else out.push(blockHead, c.dim(`  in ${f.manifest}`));
    if (f.package) out.push(c.dim(`  ${pkgText(f)}`));
    out.push(...wrap(f.title, proseWidth, "  "));
    out.push(...wrap(f.summary, proseWidth, "  ").map(c.dim));
    if (f.probe.source !== "none") {
      const tag = f.probe.source === "live" ? c.cyan("live") : c.yellow("cached");
      out.push(...wrap(f.probe.target ?? "", width, `  ${c.bold("probe")}  [${tag}] `, "         "));
      const ms = f.probe.ms !== undefined ? ` (${f.probe.ms}ms)` : "";
      const lines = wrap(`${f.probe.detail ?? ""}${ms}`, proseWidth, "         → ", "           ");
      out.push(...lines);
    }
    const shown = f.locations.slice(0, 5);
    for (const l of shown) {
      const head = `  ${c.bold("at")}     ${l.file}:${l.line}${l.mitigated ? c.green(" (mitigated)") : ""}`;
      const room = width - visible(head) - 2;
      if (room >= 20) out.push(`${head}  ${c.dim(truncate(l.snippet, Math.min(room, 100)))}`);
      else out.push(head, c.dim(`         ${truncate(l.snippet, Math.max(10, width - 9))}`));
    }
    if (f.locations.length > shown.length) out.push(c.dim(`         … and ${f.locations.length - shown.length} more`));
    if (f.note) out.push(...wrap(f.note, proseWidth, `  ${c.bold("note")}   `, "         "));
    if (f.fix) out.push(...wrap(f.fix, proseWidth, `  ${c.bold("fix")}    `, "         "));
    for (const d of f.docs) out.push(`  ${c.bold("docs")}   ${d}`);
    out.push("");
  }

  const s = report.summary;
  out.push(
    `${c.bold("Summary:")} ${c.red(`${s.fail} fail`)}, ${c.yellow(`${s.warn} warn`)}, ${c.cyan(`${s.info} info`)}, ${c.green(`${s.pass} pass`)}`,
  );
  return out.join("\n") + "\n";
}

/** Plain-text evidence cell ("" when there is nothing to show). */
function probeCell(f: Finding): string {
  if (f.status === "pass" && f.note && f.probe.source === "none" && f.locations.length) return `mitigated at ${f.locations.length} call site${f.locations.length > 1 ? "s" : ""}`;
  if (f.probe.source === "none") return f.locations.length ? `${f.locations.length} call site${f.locations.length > 1 ? "s" : ""}` : "";
  return `${f.probe.source === "live" ? "live" : "cached"}: ${compactDetail(f.probe.detail ?? "")}`;
}

/** Table cells show just the outcome ("HTTP 401 ..."); the full probe detail is in the details block. */
export function compactDetail(detail: string): string {
  let d = detail;
  const fallback = d.lastIndexOf("using cached: ");
  if (fallback >= 0) d = d.slice(fallback + "using cached: ".length);
  d = d.replace(/\s*\(verified [^)]*\)\s*$/, "");
  const arrow = d.lastIndexOf("->");
  if (arrow >= 0 && arrow < d.length - 2) d = d.slice(arrow + 2).trim();
  return d;
}
