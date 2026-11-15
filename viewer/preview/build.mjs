import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
const out = await build({ entryPoints: [new URL("./entry.js", import.meta.url).pathname], bundle: true, minify: true, format: "iife", write: false, legalComments: "eof" });
const [file, tex, extentJson] = process.argv.slice(2);
const heights = JSON.parse(readFileSync(new URL("./heights.json", import.meta.url)));
const ext = JSON.parse(readFileSync(extentJson)).extent_m;
const data = { heights, texture: { src: "data:image/png;base64," + readFileSync(tex).toString("base64"), extent: ext } };
const html = readFileSync(new URL("./template.html", import.meta.url), "utf8")
  .replace("__DATA__", () => JSON.stringify(data)).replace("__JS__", () => out.outputFiles[0].text.replace(/<\/script/g, "<\\/script"));
writeFileSync(file, html);
console.log(file, (html.length / 1e6).toFixed(2), "MB");
