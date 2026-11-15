/** Browser adapter: reads site-data files over HTTP from the published data/ folder (data-contract §4). */
import type { ReadBytes } from "./data";

/** The absolute URL of the published data/ folder, resolved against the page (not a worker script). */
export function dataRootFromPage(): string {
  return new URL(`${import.meta.env.BASE_URL}data/`, document.baseURI).href;
}

export function fetchSiteData(root: string): ReadBytes {
  return async (path) => {
    const res = await fetch(new URL(path, root));
    if (!res.ok) throw new Error(`could not load ${path} (HTTP ${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  };
}
