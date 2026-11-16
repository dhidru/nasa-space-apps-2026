import { beforeAll, describe, expect, it } from "vitest";
import { loadPositions, loadRegion, type Positions, type Region } from "./data";
import { bestLandingOnDay, computeNoFullStayDays, hourlySpan } from "./fullstay";
import { computeLandingWindows, computeRanking, loadSpanPositions } from "./results";
import { FIXTURE_SITES, readBytes, REGION } from "./testing/fixtures";
import { clearance, track } from "./geometry";
import { landingWindows } from "./scoring";
import { DAY_MS, HOUR_MS, N_SAMPLES, parseUtc, SPAN_END, SPAN_START, STEP_MS } from "./time";

describe("computeNoFullStayDays", () => {
  let region: Region;
  let span: Positions;
  let days: number[];
  beforeAll(async () => {
    region = await loadRegion(readBytes, REGION);
    span = await loadSpanPositions(readBytes);
    days = computeNoFullStayDays(region, span);
  }, 120_000);

  const anyFull = async (landing: number) => {
    const doc = computeRanking(region, await loadPositions(readBytes, landing, N_SAMPLES), landing);
    return doc.sites.some((s) => s.coverage === "full");
  };

  it("lists whole UTC days inside the span", () => {
    for (const d of days) {
      expect((d - SPAN_START) % DAY_MS).toBe(0);
      expect(d >= SPAN_START && d < SPAN_END).toBe(true);
    }
  });

  it("keeps the day of each fixture site's best Landing Window, whose ranking has Full Coverage", async () => {
    for (const site of FIXTURE_SITES.slice(0, 3)) {
      const best = computeLandingWindows(region, span, site).windows[0];
      if (!best) continue;
      const t = parseUtc(best.best_landing_time_utc);
      expect(await anyFull(t)).toBe(true);
      expect(days).not.toContain(t - ((t - SPAN_START) % DAY_MS));
    }
  }, 120_000);

  it("finds no Full Coverage site in the ranking at several times of a crossed-out day", async () => {
    const sample = [days[0], days[Math.floor(days.length / 2)], days[days.length - 1]].filter((d) => d !== undefined);
    for (const d of sample) for (const h of [0, 7, 13, 23.5]) expect(await anyFull(d + h * HOUR_MS)).toBe(false);
  }, 120_000);

  it("matches a brute-force check of every 10-minute Landing Time on a 150-site subset", () => {
    const sub = { ...region, siteIds: region.siteIds.slice(0, 150) };   // track() indexes by site, so this is the first 150
    const ok = new Set<number>();
    for (let i = 0; i < sub.siteIds.length; i++) {
      const s = clearance(track(sub, i, span, "sun")), e = clearance(track(sub, i, span, "earth"));
      const w = s.map((v, k) => Math.min(v, e[k]));
      for (const r of landingWindows(w, N_SAMPLES, 1, 0).runs) if (r.full)
        for (let j = r.start; j < r.end; j++) ok.add(SPAN_START + Math.floor((j * STEP_MS) / DAY_MS) * DAY_MS);
    }
    const expected: number[] = [];
    for (let d = SPAN_START; d < SPAN_END; d += DAY_MS) if (!ok.has(d)) expected.push(d);
    expect(ok.size).toBeGreaterThan(0);                       // the subset has days that work and days that do not
    expect(expected.length).toBeGreaterThan(0);
    expect(computeNoFullStayDays(sub, span)).toEqual(expected);
  }, 120_000);
});

describe("bestLandingOnDay", () => {
  let region: Region;
  let span: Positions;
  beforeAll(async () => {
    region = await loadRegion(readBytes, REGION);
    span = await loadSpanPositions(readBytes);
  }, 120_000);

  it("finds an hour on a working day whose ranking has Full Coverage", async () => {
    const day = parseUtc("2026-11-20T00:00:00Z"); // the mons-mouton Featured Landing Time's day
    const best = bestLandingOnDay(region, hourlySpan(span), day)!;
    expect(best.sites).toBeGreaterThan(0);
    expect(best.landing >= day && best.landing < day + DAY_MS).toBe(true);
    expect((best.landing - SPAN_START) % HOUR_MS).toBe(0);
    const doc = computeRanking(region, await loadPositions(readBytes, best.landing, N_SAMPLES), best.landing);
    expect(doc.sites.some((s) => s.coverage === "full")).toBe(true);
  }, 120_000);

  it("is null outside the Supported Span", () => {
    expect(bestLandingOnDay(region, hourlySpan(span), SPAN_END)).toBeNull();
  });
});
