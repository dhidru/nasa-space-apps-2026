import { describe, expect, it } from "vitest";
import { decodeHorizons, horizonsRow } from "./horizons";
import { FIXTURE_SITES, LANDING_FILE, REGION, readBytes, readJson } from "./testing/fixtures";

describe("decodeHorizons", () => {
  it("rebuilds every fixture site's Horizon from horizons.bin.gz", async () => {
    const dir = `regions/${REGION}/`;
    const sidecar = await readJson(dir + "horizons.json");
    const horizons = await decodeHorizons(await readBytes(dir + sidecar.file), sidecar);
    const sites = (await readJson(dir + "sites.json")).sites.map((s: any) => s.site_id);
    expect(horizons.nSites).toBe(sites.length);
    for (const id of FIXTURE_SITES) {
      const detail = await readJson(`${dir}results/site-detail/${LANDING_FILE}/${id}.json`);
      const row = horizonsRow(horizons, sites.indexOf(id));
      expect(row.length).toBe(1440);
      // Both sides are hundredths of a degree (data-contract §6.1), so they agree to floating-point noise.
      detail.horizon.elevation_deg.forEach((v: number, k: number) => expect(Math.abs(row[k] - v)).toBeLessThan(1e-9));
    }
  });
});
