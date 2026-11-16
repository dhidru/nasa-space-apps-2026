import { beforeAll, describe, expect, it } from "vitest";
import { loadRegion, type Positions, type Region } from "./data";
import { anySunlit, computeDarkDays } from "./darkness";
import { loadSpanPositions } from "./results";
import { REGION, readBytes } from "./testing/fixtures";
import { DAY_MS, SPAN_END, SPAN_START } from "./time";

describe("computeDarkDays", () => {
  let region: Region;
  let span: Positions;
  beforeAll(async () => {
    region = await loadRegion(readBytes, REGION);
    span = await loadSpanPositions(readBytes);
  });

  it("lists whole UTC days inside the span, each with no sunlit site", () => {
    const dark = computeDarkDays(region, span);
    for (const d of dark) {
      expect((d - SPAN_START) % DAY_MS).toBe(0);
      expect(d >= SPAN_START && d < SPAN_END).toBe(true);
      expect(anySunlit(region, span, (d - SPAN_START) / 600000, 144)).toBe(false);
    }
  });

  it("finds sunlight on a day whose landing ranking has Full Coverage (2027-03-01)", () => {
    const from = (Date.UTC(2027, 2, 1) - SPAN_START) / 600000;
    expect(anySunlit(region, span, from, 144)).toBe(true);
  });
});
