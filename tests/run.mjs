/* Tiny zero-dependency runner. `node tests/run.mjs` runs every suite in its own
 * process (so a crash in one cannot hide the rest) and prints one line per file.
 * No framework on purpose: these are plain asserts over plain modules. */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const files = readdirSync(HERE)
  .filter((f) => f.endsWith(".test.mjs"))
  .filter((f) => !only.length || only.some((o) => f.includes(o)))
  .sort();

let failed = 0;
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(HERE, f)], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const ms = Date.now() - t0;
  const out = (r.stdout || "").trim();
  const lines = out ? out.split("\n") : [];
  const bad = r.status !== 0;
  if (bad) failed++;
  const summary = lines.find((l) => /·|\d+ groups|FAIL|PASS/.test(l) && !l.trim().startsWith("ok")) || lines[lines.length - 1] || "";
  console.log(`${bad ? "FAIL" : "ok  "}  ${f.padEnd(24)} ${summary.trim().slice(0, 78)}${ms > 1500 ? ` (${ms}ms)` : ""}`);
  if (bad) {
    for (const l of lines.filter((x) => x.trim().startsWith("FAIL")).slice(0, 12)) console.log("      " + l.trim());
    if (r.stderr) console.log("      " + r.stderr.split("\n").slice(0, 6).join("\n      "));
  }
}
console.log(`\n${files.length - failed}/${files.length} suites passed`);
process.exit(failed ? 1 : 0);
