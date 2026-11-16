// Test-only adapter: reads the committed pipeline output from disk (data-contract §4).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const SITE_DATA = fileURLToPath(new URL("../../../../data/processed/site-data/", import.meta.url));
export const REGION = "mons-mouton";
export const LANDING = "2027-03-01T00:00:00Z";
export const LANDING_FILE = "20270301T0000Z";

export async function readBytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(SITE_DATA + path));
}

export async function readJson<T = any>(path: string): Promise<T> {
  return JSON.parse(await readFile(SITE_DATA + path, "utf-8")) as T;
}

/** Site ids of the committed site-detail and Landing Windows fixtures (the top 10). */
export const FIXTURE_SITES = ["r000c000", "r021c000", "r029c006", "r037c000", "r039c020",
  "r044c031", "r044c042", "r053c060", "r067c067", "r077c071"];

/**
 * The agreement we can check, by field-name suffix. Fixtures round angles to 3 decimals, so 0.001°.
 * Fractions are rounded to 4 decimals and one sample is 1/1,009 ≈ 0.001 of a stay, so 0.0001 still
 * catches a one-sample difference in Line of Sight; hours are rounded to 2 (one sample is 0.167 h).
 */
export function tolerance(path: string): number {
  if (path.endsWith("_fraction")) return 1e-4 + 1e-9;
  if (path.endsWith("_h")) return 1e-2 + 1e-9;
  return 1e-3 + 1e-9;
}
