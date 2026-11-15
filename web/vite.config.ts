import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { siteData, thirdPartyNotices } from "./scripts/vite-plugins.ts";

// The pipeline's output (data-contract §4) is served as-is under /data/ (ADR 0001).
const siteDataDir = fileURLToPath(new URL("../data/processed/site-data", import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [react(), siteData(siteDataDir), thirdPartyNotices()],
  // OpenLayers alone is ~500 kB minified; one bundle is fine for this app.
  build: { chunkSizeWarningLimit: 1500 },
  test: { include: ["src/**/*.test.ts"], testTimeout: 120_000 },
});
