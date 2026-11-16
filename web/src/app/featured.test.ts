import { describe, expect, it } from "vitest";
import { loadPositions, loadRegion } from "../science/data";
import { computeRanking } from "../science/results";
import { readBytes, REGION } from "../science/testing/fixtures";
import { N_SAMPLES } from "../science/time";
import { featuredLanding } from "./featured";

describe("featuredLanding", () => {
  it("is undefined for a region without one", () => {
    expect(featuredLanding("mons-mouton-plateau")).toBeUndefined();
  });

  it("gives a Landing Time whose top 10 all have Full Coverage", async () => {
    const t = featuredLanding(REGION)!;
    const doc = computeRanking(await loadRegion(readBytes, REGION), await loadPositions(readBytes, t, N_SAMPLES), t);
    const top = doc.sites.filter((s) => s.top);
    expect(top.length).toBe(10);
    expect(top.every((s) => s.coverage === "full")).toBe(true);
  }, 120_000);
});
