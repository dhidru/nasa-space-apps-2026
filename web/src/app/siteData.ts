/** Static site-data files the pages read directly (data-contract §5). */
import { dataRootFromPage } from "../science/fetchSiteData";

export interface RegionInfo {
  id: string;
  display_name: string;
  center: { lat_deg: number; lon_deg: number; x_m: number; y_m: number };
  has_site_data: boolean;
  outline: string;
  basemap: string;
}

export interface RegionsDoc {
  source: { name: string; url: string };
  regions: RegionInfo[];
}

export interface BasemapDoc {
  image: string;
  extent_m: [number, number, number, number];
  pixel_size_m: number;
  source: string;
}

export interface OutlineDoc {
  features: { geometry: { type: "Polygon"; coordinates: number[][][] }; properties: { region_id: string } }[];
}

export interface SitesGrid {
  grid_spacing_m: number;
  sites: { site_id: string; x_m: number; y_m: number; lat_deg: number; lon_deg: number; terrain_height_m: number }[];
}

export function dataUrl(path: string): string {
  return new URL(path, dataRootFromPage()).href;
}

const cache = new Map<string, Promise<unknown>>();

/** Fetches and parses a JSON file under data/, once per path. */
export function getJson<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(path, fetch(dataUrl(path)).then((r) => {
      if (!r.ok) throw new Error(`could not load ${path} (HTTP ${r.status})`);
      return r.json();
    }));
  }
  return cache.get(path) as Promise<T>;
}

/** The basemap's image URL, resolved next to its basemap.json. */
export function basemapImageUrl(basemapPath: string, doc: BasemapDoc): string {
  return dataUrl(basemapPath.replace(/[^/]+$/, doc.image));
}
