import { describe, expect, it } from "vitest";
import type { RankingEntry } from "../science/results";
import { slopeLabel, topWithinSlope, walkableLabel } from "./slope";

// Four sites on a line, best first: a and b are 1 km apart (closer than the 2 km top-10 separation).
const ids = ["a", "b", "c", "d"];
const place = (slopes: number[] | null) => ({
  siteIndex: new Map(ids.map((id, i) => [id, i])),
  xM: Float64Array.from([0, 1000, 3000, 6000]),
  yM: new Float64Array(4),
  landingSlopeDeg: slopes && Float64Array.from(slopes),
});
const ranked = ids.map((site_id, i) => ({ site_id, rank: i + 1 }) as RankingEntry);
const top = (slopes: number[] | null, limit: number | null) => topWithinSlope(ranked, place(slopes), limit).map((e) => e.site_id);

describe("the top 10 within a slope limit", () => {
  const slopes = [12, 5, 9.99, 8];
  it("without a limit is the usual 2 km-separated top 10", () => {
    expect(top(slopes, null)).toEqual(["a", "c", "d"]);
  });
  it("skips steep sites, so a site they used to block can take their place", () => {
    expect(top(slopes, 10)).toEqual(["b", "c", "d"]);
  });
  it("needs the slope to be under the limit, not at it", () => {
    expect(top(slopes, 8)).toEqual(["b"]);
  });
  it("ignores the limit when the region has no Landing Slopes", () => {
    expect(top(null, 10)).toEqual(["a", "c", "d"]);
  });
});

describe("slopeLabel", () => {
  it("rounds down to 0.1 deg, so a site under the limit never shows the limit itself", () => {
    expect(slopeLabel(9.99)).toBe("9.9°");
    expect(slopeLabel(12)).toBe("12.0°");
    expect(slopeLabel(0.04)).toBe("0.0°");
  });
  it("shows a dash when the value wasn't computed", () => {
    expect(slopeLabel(undefined)).toBe("—");
  });
});

describe("walkableLabel", () => {
  it("is a percentage rounded down, so a site with any steep ground never reads 100 %", () => {
    expect(walkableLabel(1)).toBe("100 %");
    expect(walkableLabel(0.9999)).toBe("99 %");
    expect(walkableLabel(0.614)).toBe("61 %");
    expect(walkableLabel(0)).toBe("0 %");
  });
  it("says \"< 1 %\" rather than \"0 %\" when a little ground is walkable", () => {
    expect(walkableLabel(0.004)).toBe("< 1 %");
  });
  it("shows a dash when the value wasn't computed", () => {
    expect(walkableLabel(undefined)).toBe("—");
  });
});
