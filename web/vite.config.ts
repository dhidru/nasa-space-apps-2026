import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { siteData, thirdPartyNotices } from "./scripts/vite-plugins.ts";

// The pipeline's output (data-contract §4) is served as-is under /data/ (ADR 0001).
const siteDataDir = fileURLToPath(new URL("../data/processed/site-data", import.meta.url));

export default defineConfig({
  // Relative paths and #/ routes, so the site works under the GitHub Pages subpath without extra config.
  base: "./",
  plugins: [siteData(siteDataDir), thirdPartyNotices()],
  // three.js is ~600 kB minified; one bundle is fine for this app.
  build: { chunkSizeWarningLimit: 1500, target: "es2022" },
  test: { include: ["src/**/*.test.ts"], testTimeout: 120_000 },
});
