// The region map's site grid (src/ui/polar.js) must put every site where the pipeline did (sites.json), or the
// coverage colours land a cell off and leave an uncoloured strip inside the border (Haworth's did, by one column).
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module without types
import { setSiteLattice, siteGrid } from "../ui/polar.js";

const ROOT = fileURLToPath(new URL("../../../data/processed/site-data/", import.meta.url));
const read = (p: string) => JSON.parse(readFileSync(ROOT + p, "utf8"));
const regions: { id: string; outline: string }[] = existsSync(ROOT + "regions.json") ? read("regions.json").regions : [];
const withSites = regions.filter((r) => existsSync(`${ROOT}regions/${r.id}/sites.json`));
type Site = { site_id: string; x_m: number; y_m: number };

describe.skipIf(!withSites.length)("siteGrid follows the published sites", () => {
  it.each(withSites.map((r) => [r.id, r] as const))("%s", (id, r) => {
    const ring: number[][] = read(r.outline).features[0].geometry.coordinates[0].map(([x, y]: number[]) => [x, y]);
    ring.pop(); // closing vertex, as loadRegions drops it
    const sites: Site[] = read(`regions/${id}/sites.json`).sites;
    const grid = siteGrid({ id, xy: ring }); // made before the sites load, like the map's
    setSiteLattice(id, sites.map((s) => s.site_id), sites.map((s) => s.x_m), sites.map((s) => s.y_m));
    grid.refresh();
    expect(grid.count).toBe(sites.length);
    const e = grid.extent;
    for (const s of sites) {
      const cell = grid.byId(s.site_id);
      expect(cell, s.site_id).not.toBeNull();
      expect([cell.x, cell.y]).toEqual([s.x_m, s.y_m]);
      expect(grid.cellAt(s.x_m, s.y_m)?.id).toBe(s.site_id);
      // every coloured cell sits inside the drawn border
      expect(s.x_m - 100 >= e.xmin && s.x_m + 100 <= e.xmax && s.y_m - 100 >= e.ymin && s.y_m + 100 <= e.ymax).toBe(true);
    }
    // and the border is no bigger than the sites: each edge has a site cell touching it
    expect(sites.some((s) => s.x_m - 100 === e.xmin) && sites.some((s) => s.x_m + 100 === e.xmax)).toBe(true);
    expect(sites.some((s) => s.y_m - 100 === e.ymin) && sites.some((s) => s.y_m + 100 === e.ymax)).toBe(true);
  });
});
