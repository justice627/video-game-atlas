import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { readTables } from './lib/tables.ts';
import { buildAtlas, validate } from './lib/dataset.ts';

const tables = readTables();
const errs = validate(tables);
if (errs.length) {
  console.error(`Data has ${errs.length} problem(s). Row numbers match data/*.csv lines and atlas.xlsx rows:\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
const snap = JSON.parse(readFileSync(new URL('../data/wikidata-snapshot.json', import.meta.url), 'utf8')) as { fetched: string };
const atlas = buildAtlas(tables, snap.fetched);
mkdirSync(new URL('../public', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/atlas.json', import.meta.url), JSON.stringify(atlas));
const by = (s: string) => tables.games.filter((g) => g.status === s).length;
console.log(`atlas.json: ${atlas.games.length} games on the map (${by('include')} include, ${by('review')} review); ${by('exclude')} excluded`);
