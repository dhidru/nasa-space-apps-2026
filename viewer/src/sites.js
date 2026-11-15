// SPDX-License-Identifier: MIT
// Built-in sites: NASA's nine Artemis III candidate regions (from the team's regions.json). Plus spots the viewer
// saves in this browser.

import { sizeKm } from "./regions.js";

export const regionSites = (regions) => regions.map((r) => ({ ...r, size: sizeKm(r), region: true }));

const KEY = "lunar-site-viewer.saved-sites";

export function loadSaved() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon)) : [];
  } catch { return []; }
}

export function saveSaved(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable: keep in memory */ }
}
