import { writeFileSync, mkdirSync } from 'node:fs';
import { buildAtlas, validate } from './lib/dataset.ts';

const { atlas, report } = buildAtlas();
for (const d of report.dropped) console.warn(`dropped ${d.qid} ${d.title}: ${d.reason}`);
const errs = validate(atlas);
if (errs.length) {
  console.error(`Dataset invalid:\n  ${errs.join('\n  ')}`);
  process.exit(1);
}
mkdirSync(new URL('../public', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/atlas.json', import.meta.url), JSON.stringify(atlas));
const w = atlas.games.filter((g) => g.source === 'wikidata').length;
console.log(`atlas.json: ${atlas.games.length} games (${w} Wikidata + ${atlas.games.length - w} curated)`);
