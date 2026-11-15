import { defineConfig } from "vite";

// BASE_PATH is the URL prefix the site is served under: "/" locally, "/<repo>/" on GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  build: {
    chunkSizeWarningLimit: 2000,
    target: "es2020",
  },
});
