// SPDX-License-Identifier: MIT
// Lists the licence of every package that ends up in the deployed site (production dependencies),
// and flags anything that is not MIT or Apache-2.0 so you can review it.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = new Set(["MIT", "Apache-2.0"]);
const paths = execSync("npm ls --omit=dev --all --parseable", { encoding: "utf8" }).trim().split("\n").slice(1);
const rows = new Map();
for (const p of paths) {
  try {
    const pkg = JSON.parse(readFileSync(join(p, "package.json"), "utf8"));
    const lic = typeof pkg.license === "string" ? pkg.license : pkg.license?.type ?? (pkg.licenses || []).map((l) => l.type).join(" OR ") ?? "UNKNOWN";
    rows.set(`${pkg.name}@${pkg.version}`, lic || "UNKNOWN");
  } catch { /* not a package dir */ }
}
let flagged = 0;
for (const [name, lic] of [...rows].sort()) {
  const ok = lic.split(/\s+OR\s+|[()]/).some((l) => ALLOWED.has(l.trim()));
  if (!ok) flagged++;
  console.log(`${ok ? "  ok " : "  !! "} ${lic.padEnd(28)} ${name}`);
}
console.log(`\n${rows.size} production packages, ${flagged} not MIT/Apache-2.0 (see THIRD_PARTY_NOTICES.md).`);
