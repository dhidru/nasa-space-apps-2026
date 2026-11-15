/** App state in the URL hash, so links work on a static host: #/region/<id>?t=20270301T0000Z&site=r041c026 */
import { compactUtc, parseUtc, snapLandingTime } from "../science/time";

export const DEFAULT_LANDING = parseUtc("2027-03-01T00:00:00Z");

export type Route = { page: "home" } | { page: "region"; regionId: string; landing: number; siteId?: string };

function parseCompact(s: string | null): number | undefined {
  const m = s && /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})Z$/.exec(s);
  return m ? snapLandingTime(parseUtc(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`)) : undefined;
}

export function parseRoute(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "region" && parts[1]) {
    const q = new URLSearchParams(query);
    return { page: "region", regionId: parts[1], landing: parseCompact(q.get("t")) ?? DEFAULT_LANDING, siteId: q.get("site") ?? undefined };
  }
  return { page: "home" };
}

export function formatRoute(r: Route): string {
  if (r.page === "home") return "#/";
  const q = new URLSearchParams({ t: compactUtc(r.landing) });
  if (r.siteId) q.set("site", r.siteId);
  return `#/region/${r.regionId}?${q}`;
}
