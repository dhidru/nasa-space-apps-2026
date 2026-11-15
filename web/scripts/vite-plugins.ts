// Build plugins: serve the pipeline's site data, and write third-party notices.
import { execSync } from "node:child_process";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";

const DATA_PREFIX = "/data/";

/** The browser builds results/ itself (ADR 0001), so the golden fixtures are not published. */
function published(rel: string): boolean {
  return !rel.split(/[\\/]/).includes("results");
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Serves `dir` under /data/ in dev and copies it into dist/data/ on build (data-contract §4). */
export function siteData(dir: string): Plugin {
  return {
    name: "site-data",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? "").split("?")[0]);
        const at = url.indexOf(DATA_PREFIX);
        if (at < 0) return next();
        const rel = url.slice(at + DATA_PREFIX.length);
        const file = join(dir, rel);
        if (rel.includes("..") || !published(rel) || !existsSync(file) || statSync(file).isDirectory()) return next();
        // Send .gz as plain bytes, like GitHub Pages; the browser unpacks it (data-contract §6.1).
        res.setHeader("Content-Type", file.endsWith(".json") || file.endsWith(".geojson") ? "application/json" : "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const file of walk(dir)) {
        const rel = relative(dir, file).split(sep).join("/");
        if (published(rel) && !rel.endsWith(".gitkeep")) {
          this.emitFile({ type: "asset", fileName: "data/" + rel, source: readFileSync(file) });
        }
      }
    },
  };
}

/** Writes THIRD-PARTY-NOTICES.txt with the license text of every runtime npm package (BSD/MIT notice terms). */
export function thirdPartyNotices(): Plugin {
  return {
    name: "third-party-notices",
    apply: "build",
    generateBundle() {
      const out = execSync("npm ls --omit=dev --all --parseable", { encoding: "utf-8" });
      const dirs = [...new Set(out.split(/\r?\n/).filter((d) => d.includes("node_modules")))].sort();
      const parts = ["Third-party software bundled in this site. Each package's license follows.\n"];
      for (const d of dirs) {
        const pkg = JSON.parse(readFileSync(join(d, "package.json"), "utf-8"));
        const lic = readdirSync(d).find((f) => /^(licen[cs]e|copying|notice)/i.test(f));
        const text = lic ? readFileSync(join(d, lic), "utf-8").trim() : `License: ${pkg.license} (no license file in the package)`;
        parts.push(`${"=".repeat(78)}\n${pkg.name}@${pkg.version} (${pkg.license})\n${"=".repeat(78)}\n${text}\n`);
      }
      this.emitFile({ type: "asset", fileName: "THIRD-PARTY-NOTICES.txt", source: parts.join("\n") });
    },
  };
}
