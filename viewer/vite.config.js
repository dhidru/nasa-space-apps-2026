import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
// The team web app's build plugins: serve data/processed/site-data under <base>/data/ (results/ left out) and
// write THIRD-PARTY-NOTICES.txt for the shipped npm packages.
import { siteData, thirdPartyNotices } from "../web/scripts/vite-plugins.ts";

const siteDataDir = fileURLToPath(new URL("../data/processed/site-data", import.meta.url));

// BASE_PATH is the URL prefix the site is served under: "/" locally, "/<repo>/" on GitHub Pages.
// Data and science are shared with the team web app (../web/src), so the dev server may read the repo root.
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [siteData(siteDataDir), thirdPartyNotices()],
  server: { fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  build: {
    chunkSizeWarningLimit: 2000,
    target: "es2020",
  },
});
