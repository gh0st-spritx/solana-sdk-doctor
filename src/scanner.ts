import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import semver from "semver";
import type { DetectedPackage } from "./types";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".turbo", "coverage", "target", ".anchor", ".cache", "vendor",
]);
export const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|vue|svelte|md|mdx)$/i;
const MAX_FILE_BYTES = 1_000_000;
const MAX_FILES = 20_000;

export interface SourceFile {
  /** path relative to scan root, posix separators */
  path: string;
  abs: string;
  content: string;
}

export interface Manifest {
  /** relative path of package.json */
  path: string;
  dir: string;
  packages: DetectedPackage[];
  sources: SourceFile[];
}

const toPosix = (p: string) => p.split(sep).join("/");

function walk(root: string, onFile: (abs: string) => void): void {
  let count = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) stack.push(join(dir, e.name));
      } else if (e.isFile()) {
        if (++count > MAX_FILES) return;
        onFile(join(dir, e.name));
      }
    }
  }
}

function readJson(file: string): any | undefined {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/** Resolve the concrete version: installed node_modules > package-lock > lowest version allowed by the range. */
export function resolveVersion(
  manifestDir: string,
  name: string,
  range: string,
  lock?: any,
): Pick<DetectedPackage, "version" | "versionSource"> {
  const installed = readJson(join(manifestDir, "node_modules", name, "package.json"));
  if (installed?.version && semver.valid(installed.version)) return { version: installed.version, versionSource: "node_modules" };
  const locked = lock?.packages?.[`node_modules/${name}`]?.version ?? lock?.dependencies?.[name]?.version;
  if (locked && semver.valid(locked)) return { version: locked, versionSource: "lockfile" };
  try {
    const min = semver.validRange(range) ? semver.minVersion(range) : null;
    if (min) return { version: min.version, versionSource: "range" };
  } catch {
    /* fallthrough */
  }
  return { version: undefined, versionSource: "unknown" };
}

export function scan(root: string): Manifest[] {
  const manifestPaths: string[] = [];
  const sourcePaths: string[] = [];
  walk(root, (abs) => {
    const base = abs.slice(abs.lastIndexOf(sep) + 1);
    if (base === "package.json") manifestPaths.push(abs);
    else if (SOURCE_EXT.test(base)) sourcePaths.push(abs);
  });
  // Deepest manifests first so each source file is owned by its nearest package.json.
  manifestPaths.sort((a, b) => b.length - a.length);

  const manifests: Manifest[] = manifestPaths.map((abs) => {
    const dir = dirname(abs);
    const pkg = readJson(abs) ?? {};
    const lockFile = join(dir, "package-lock.json");
    const lock = existsSync(lockFile) ? readJson(lockFile) : undefined;
    const packages: DetectedPackage[] = [];
    for (const [field, dev] of [["dependencies", false], ["devDependencies", true], ["peerDependencies", false], ["optionalDependencies", false]] as const) {
      for (const [name, range] of Object.entries<string>(pkg[field] ?? {})) {
        if (packages.some((p) => p.name === name)) continue;
        packages.push({ manifest: toPosix(relative(root, abs)) || "package.json", name, range, dev, ...resolveVersion(dir, name, range, lock) });
      }
    }
    return { path: toPosix(relative(root, abs)) || "package.json", dir, packages, sources: [] };
  });

  for (const abs of sourcePaths) {
    const owner = manifests.find((m) => abs.startsWith(m.dir + sep));
    if (!owner) continue;
    try {
      if (statSync(abs).size > MAX_FILE_BYTES) continue;
      owner.sources.push({ path: toPosix(relative(root, abs)), abs, content: readFileSync(abs, "utf8") });
    } catch {
      /* unreadable file */
    }
  }
  // Report manifests shallow-first for stable, readable output.
  return manifests.sort((a, b) => a.path.split("/").length - b.path.split("/").length || a.path.localeCompare(b.path));
}
