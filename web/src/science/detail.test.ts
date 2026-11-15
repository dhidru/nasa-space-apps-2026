import { beforeAll, describe, it } from "vitest";
import { loadPositions, loadRegion, type Region } from "./data";
import { computeRanking, computeSiteDetail, type RankingDoc } from "./results";
import { N_SAMPLES, parseUtc } from "./time";
import { expectClose } from "./testing/compare";
import { FIXTURE_SITES, LANDING, LANDING_FILE, REGION, readBytes, readJson } from "./testing/fixtures";

describe("computeSiteDetail against the Python fixtures", () => {
  let region: Region;
  let positions: Awaited<ReturnType<typeof loadPositions>>;
  let ranking: RankingDoc;
  const t = parseUtc(LANDING);
  beforeAll(async () => {
    region = await loadRegion(readBytes, REGION);
    positions = await loadPositions(readBytes, t, N_SAMPLES);
    ranking = computeRanking(region, positions, t);
  });

  it.each(FIXTURE_SITES)("matches %s: Horizon, Sun/Earth series and stats", async (id) => {
    const want = await readJson(`regions/${REGION}/results/site-detail/${LANDING_FILE}/${id}.json`);
    const entry = ranking.sites.find((s) => s.site_id === id)!;
    expectClose(computeSiteDetail(region, positions, t, id, entry), want, id);
  });
});
