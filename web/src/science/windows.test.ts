import { beforeAll, describe, it } from "vitest";
import { loadRegion, type Positions, type Region } from "./data";
import { computeLandingWindows, loadSpanPositions } from "./results";
import { expectClose } from "./testing/compare";
import { FIXTURE_SITES, REGION, readBytes, readJson } from "./testing/fixtures";

describe("computeLandingWindows against the Python fixtures", () => {
  let region: Region;
  let span: Positions;
  beforeAll(async () => {
    region = await loadRegion(readBytes, REGION);
    span = await loadSpanPositions(readBytes);
  });

  it.each(FIXTURE_SITES)("matches %s: strip runs and top-10 windows over the Supported Span", async (id) => {
    const want = await readJson(`regions/${REGION}/results/landing-windows/${id}.json`);
    expectClose(computeLandingWindows(region, span, id), want, id);
  });
});
