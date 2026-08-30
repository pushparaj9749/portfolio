/* Shared test harness. Deliberately small: one group() per behaviour, plain
 * node:assert inside, and a summary line the runner can pick up. */
export function suite(label) {
  const results = [];
  let failures = 0;
  return {
    group(name, fn) {
      try {
        fn();
        results.push(`  ok    ${name}`);
      } catch (err) {
        failures++;
        const detail = String(err && err.message ? err.message : err)
          .split("\n")
          .slice(0, 8)
          .join("\n        ");
        results.push(`  FAIL  ${name}\n        ${detail}`);
      }
    },
    done() {
      for (const line of results) console.log(line);
      const n = results.length;
      console.log(failures ? `\n${label}: ${failures}/${n} FAILED` : `\n${label}: ${n} groups PASS`);
      process.exitCode = failures ? 1 : 0;
      return failures;
    },
  };
}

/** Parse a `--token: #value;` block out of CSS text, resolving `var(--x, #hex)`
 *  fallbacks so an indirected token still has a colour to measure. */
export function tokensFromCss(css, selector) {
  const blocks = [];
  const re = new RegExp(String(selector).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}", "g");
  let m;
  while ((m = re.exec(css))) blocks.push(m[1]);
  const out = {};
  for (const body of blocks) {
    for (const line of body.split(";")) {
      const d = /\s*(--[\w-]+)\s*:\s*([^;]+)/.exec(line);
      if (!d) continue;
      let value = d[2].trim();
      const indirect = /var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/.exec(value);
      if (indirect) value = out[indirect[1]] || indirect[2];
      out[d[1]] = value;
    }
  }
  return out;
}
