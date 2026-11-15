// SPDX-License-Identifier: MIT
// Copies the team pipeline's output (../data/processed/site-data) into public/site-data so Vite serves it in
// dev and ships it in the build. The repo copy stays the single source; public/site-data is git-ignored.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "..", "data", "processed", "site-data");
const dst = join(root, "public", "site-data");
if (!existsSync(join(src, "regions.json"))) throw new Error(`No team site data at ${src}`);
rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true });
console.log(`[site-data] copied ${src} -> public/site-data`);
