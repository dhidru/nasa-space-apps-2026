import { describe, expect, it } from "vitest";
import { makeRegion, type SiteRecord } from "./data";

const site = (id: string, robustness?: number, slope?: number, walkable?: number): SiteRecord => ({
  site_id: id, x_m: 0, y_m: 0, lat_deg: -89, lon_deg: 0, terrain_height_m: 0,
  ...(robustness === undefined ? {} : { timing_robustness_fraction: robustness }),
  ...(slope === undefined ? {} : { landing_slope_deg: slope }),
  ...(walkable === undefined ? {} : { eva_walkable_fraction: walkable }),
});
const horizons = (n: number) => ({ nSites: n, nAzimuths: 4, scale: 0.01, values: new Int16Array(n * 4) });
const region = (sites: SiteRecord[]) =>
  makeRegion({ region_id: "t", grid_spacing_m: 200, observer_height_m: 2, sites }, horizons(sites.length));

describe("Timing Robustness from sites.json", () => {
  it("is read per site, in sites.json order", () => {
    expect(Array.from(region([site("a", 0.25), site("b", 1)]).timingRobustness!)).toEqual([0.25, 1]);
  });
  it("is null when the pipeline hasn't computed it for every site", () => {
    expect(region([site("a", 0.25), site("b")]).timingRobustness).toBeNull();
  });
});

describe("Landing Slope from sites.json", () => {
  it("is read per site, in sites.json order", () => {
    expect(Array.from(region([site("a", 1, 12.5), site("b", 1, 3.25)]).landingSlopeDeg!)).toEqual([12.5, 3.25]);
  });
  it("is null when the pipeline hasn't computed it for every site", () => {
    expect(region([site("a", 1, 12.5), site("b", 1)]).landingSlopeDeg).toBeNull();
  });
});

describe("EVA Walkable Share from sites.json", () => {
  it("is read per site, in sites.json order", () => {
    expect(Array.from(region([site("a", 1, 5, 0.875), site("b", 1, 5, 1)]).evaWalkableFraction!)).toEqual([0.875, 1]);
  });
  it("is null when the pipeline hasn't computed it for every site", () => {
    expect(region([site("a", 1, 5, 0.875), site("b", 1, 5)]).evaWalkableFraction).toBeNull();
  });
});
