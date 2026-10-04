import type { Fetcher } from "../src/probes";
import type { Manifest } from "../src/scanner";
import type { DetectedPackage } from "../src/types";

export type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** A fetch stub that records calls and answers from a route table (first matching substring wins). */
export function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fn: Fetcher = async (url, init) => {
    calls.push(url);
    for (const [needle, route] of Object.entries(routes)) if (url.includes(needle)) return route(url, init);
    throw new Error(`unexpected fetch ${url}`);
  };
  return { fetch: fn, calls };
}

export const text = (status: number, body = "") => () => new Response(body, { status });
export const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function manifest(path: string, deps: Record<string, string>, sources: Record<string, string> = {}): Manifest {
  const packages: DetectedPackage[] = Object.entries(deps).map(([name, version]) => ({
    manifest: path,
    name,
    range: `^${version}`,
    version,
    versionSource: "range",
    dev: false,
  }));
  return {
    path,
    dir: "/virtual/" + path,
    packages,
    sources: Object.entries(sources).map(([p, content]) => ({ path: p, abs: "/virtual/" + p, content })),
  };
}
