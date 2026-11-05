// Rewrites tests/golden/*.json from the current data and rules. Review the diff: every change is a change in built output.
import { writeFileSync } from 'node:fs';
import { readTables } from './lib/tables.ts';
import { GOLDEN, goldenOutput } from '../tests/golden.ts';

const t = readTables();
for (const name of Object.keys(GOLDEN)) {
  const out = goldenOutput(t, name);
  if (!out.length) throw new Error(`golden ${name}: no games built`);
  writeFileSync(new URL(`../tests/golden/${name}.json`, import.meta.url), JSON.stringify(out, null, 2) + '\n');
  console.log(`tests/golden/${name}.json: ${out.length} game(s), ${out.reduce((n, g) => n + g.links.length, 0)} link(s)`);
}
