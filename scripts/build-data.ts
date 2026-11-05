import { writeFileSync, mkdirSync } from 'node:fs';
import { readTables } from './lib/tables.ts';
import { buildAtlas, validate } from './lib/dataset.ts';

const tables = readTables();
const errs = validate(tables);
if (errs.length) {
  console.error(`Data has ${errs.length} problem(s). Row numbers match data/*.csv lines (and atlas.xlsx rows, if exported):\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
const atlas = buildAtlas(tables);
mkdirSync(new URL('../public', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/atlas.json', import.meta.url), JSON.stringify(atlas));
const n = (s: string) => tables.links.filter((l) => l.status === s).length;
console.log(`atlas.json: ${atlas.games.length} games, ${n('verified')} verified and ${n('auto-verified')} auto-verified links (${n('draft')} draft, ${n('needs-human')} needs-human, ${n('excluded')} excluded not shown); ${tables.candidates.length} candidates`);
