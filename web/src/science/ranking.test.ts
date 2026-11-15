import { beforeAll, describe, expect, it } from "vitest";
import { loadRegion, loadPositions, makeRegion, type Region } from "./data";
import { computeRanking } from "./results";
import { N_SAMPLES, parseUtc } from "./time";
import { expectClose } from "./testing/compare";
import { LANDING, LANDING_FILE, REGION, readBytes, readJson } from "./testing/fixtures";

describe("computeRanking against the Python fixture", () => {
  let region: Region;
  let ours: any;
  let python: any;
  beforeAll(async () => {
    const read = (p: string) => readBytes(p);
    region = await loadRegion(read, REGION);
    const t = parseUtc(LANDING);
    ours = computeRanking(region, await loadPositions(read, t, N_SAMPLES), t);
    python = await readJson(`regions/${REGION}/results/ranking/${LANDING_FILE}.json`);
  });

  it("matches the header", () => {
    const { sites: _a, ...head } = ours;
    const { sites: _b, ...want } = python;
    expectClose(head, want);
  });

  it("matches every site's stats, coverage and worst-case Clearance to 0.001°", () => {
    const byId = new Map(ours.sites.map((s: any) => [s.site_id, s]));
    expect(byId.size).toBe(python.sites.length);
    for (const want of python.sites) {
      const { rank: _r, top: _t, ...got } = byId.get(want.site_id) as any;
      const { rank: _r2, top: _t2, ...exp } = want;
      expectClose(got, exp, want.site_id);
    }
  });

  it("ranks the sites in the same order with the same top 10", () => {
    expect(ours.sites.map((s: any) => s.site_id)).toEqual(python.sites.map((s: any) => s.site_id));
    expect(ours.sites.filter((s: any) => s.top).map((s: any) => s.site_id))
      .toEqual(python.sites.filter((s: any) => s.top).map((s: any) => s.site_id));
  });
});

describe("computeRanking ordering rules (worked example)", () => {
  // Observers at the south pole (lon 0) on flat ground. There, local north is +x and east is +y.
  // Earth sits far out along +y (azimuth 90°, Horizon column 360) at about −0.26° elevation (the
  // observer is 1,737 km off its line). The Sun sits far out along +x (azimuth 0°, column 0) for the
  // first 505 samples and along −x (azimuth 180°, column 720) for the last 504, at about 0°.
  // So with a Horizon of h toward a body, its Clearance is about −h (Earth: −0.26 − h).
  const horizonsDeg = [-5, -20, -10, 89, -30, -10, -10];
  const xM = [0, 10_000, 11_000, 30_000, 50_000, 70_000, 90_000];
  const SUN_NORTH_SAMPLES = 505;
  function region() {
    const n = horizonsDeg.length;
    const values = new Int16Array(n * 1440);
    horizonsDeg.forEach((h, i) => values.fill(h * 100, i * 1440, (i + 1) * 1440));
    const band = (site: number, centre: number, deg: number) => {
      for (let d = -40; d <= 40; d++) values[site * 1440 + ((centre + d + 1440) % 1440)] = deg * 100;
    };
    band(4, 360, 89); // s4: Earth blocked, Sun clear: Partial, weaker body 0 %
    band(5, 0, -15); // s5: like s2 toward Earth (same worst case) but more Clearance toward the northern Sun
    band(6, 720, 89); // s6: Sun blocked while it is in the south: Partial, Sun ~50 %, Earth 100 %
    return makeRegion({
      region_id: "test", grid_spacing_m: 200, observer_height_m: 0,
      sites: horizonsDeg.map((_, i) => ({ site_id: `s${i}`, x_m: xM[i], y_m: 0, lat_deg: -90, lon_deg: 0, terrain_height_m: 0 })),
    }, { nSites: n, nAzimuths: 1440, scale: 0.01, values });
  }
  function positions(t: number) {
    const sun = new Float64Array(N_SAMPLES * 3), earth = new Float64Array(N_SAMPLES * 3);
    for (let k = 0; k < N_SAMPLES; k++) {
      sun[k * 3] = k < SUN_NORTH_SAMPLES ? 1.5e8 : -1.5e8;
      earth[k * 3 + 1] = 3.8e5;
    }
    return { start: t, n: N_SAMPLES, sun, earth };
  }

  it("orders Full by worst-case Clearance then mean Clearance, then Partial by the weaker body", () => {
    const t = parseUtc(LANDING);
    const doc = computeRanking(region(), positions(t), t);
    const site = (id: string) => doc.sites.find((s) => s.site_id === id)!;
    // Full, by worst case (Earth's Clearance here): s1 (h −20), then s5 and s2 (both h −10 toward
    // Earth, an exact tie), then s0 (h −5). The tie goes to s5: its Sun Clearance is ~15° for half the
    // stay, so its mean Clearance is higher. Partial, by the weaker body's Line of Sight: s6 (Sun
    // ~50 %) beats s3 and s4 (0 % each), and that tie keeps site order.
    expect(doc.sites.map((s) => s.site_id)).toEqual(["s1", "s5", "s2", "s0", "s6", "s3", "s4"]);
    expect(doc.sites.map((s) => s.coverage)).toEqual(["full", "full", "full", "full", "partial", "partial", "partial"]);
    expect(site("s5").worst_case_min_clearance_deg).toBe(site("s2").worst_case_min_clearance_deg);
    expect(site("s5").sun.mean_clearance_deg).toBeGreaterThan(site("s2").sun.mean_clearance_deg);
    expect(site("s6").sun.los_fraction).toBe(Number((SUN_NORTH_SAMPLES / N_SAMPLES).toFixed(4)));
    expect([site("s4").sun.los_fraction, site("s4").earth.los_fraction]).toEqual([1, 0]);
  });

  it("keeps the top 10 at least 2 km apart", () => {
    const t = parseUtc(LANDING);
    const doc = computeRanking(region(), positions(t), t);
    // s2 lies 1 km from s1, which ranks higher, so s2 is left out.
    expect(doc.sites.filter((s) => s.top).map((s) => s.site_id)).toEqual(["s1", "s5", "s0", "s6", "s3", "s4"]);
  });
});
