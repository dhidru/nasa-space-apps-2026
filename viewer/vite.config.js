import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// BASE_PATH is the URL prefix the site is served under: "/" locally, "/<repo>/viewer/" on GitHub Pages.
// The ranking code is shared with the team's web app (../web/src/science), so the dev server may read the repo root.
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  server: { fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  build: {
    chunkSizeWarningLimit: 2000,
    target: "es2020",
  },
});
