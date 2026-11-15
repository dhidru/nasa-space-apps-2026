// SPDX-License-Identifier: MIT
// Built-in sites: NASA's nine Artemis IV candidate regions (from the team's regions.json).

import { sizeKm } from "./regions.js";

export const regionSites = (regions) => regions.map((r) => ({ ...r, size: sizeKm(r), region: true }));
