// Adds games from data/wikidata-snapshot.json that are not yet in the tables, with status "review".
// Never edits or deletes existing rows: once a game is in the tables, the tables own it.
// Usage: npm run fetch:wikidata && npm run sync:wikidata
import { readFileSync } from 'node:fs';
import { readTables, writeTables } from './lib/tables.ts';
import { periodToSpan, type PeriodInput } from './lib/periods.ts';

/** Wikidata P31 classes whose coordinates are only a rough centroid. */
const COARSE_TYPES = new Set([
  'Q6256', 'Q3624078', 'Q3024240', 'Q5107', 'Q48349', 'Q3336843', 'Q35657', 'Q107390',
  'Q82794', 'Q1620908', 'Q7275', 'Q10864048', 'Q2418896', 'Q855697', 'Q15642541', 'Q1250464',
]);
interface SnapGame {
  qid: string; title: string; year?: number; enwiki?: string;
  places: { qid: string; label: string; lat: number; lon: number; types: string[] }[];
  periods: (PeriodInput & { qid: string })[];
}

const snap = JSON.parse(readFileSync(new URL('../data/wikidata-snapshot.json', import.meta.url), 'utf8')) as { fetched: string; games: SnapGame[] };
const t = readTables();
const known = new Set(t.games.map((g) => g.qid ?? g.id));
let added = 0;
for (const g of snap.games) {
  if (known.has(g.qid)) continue;
  const undated: string[] = [];
  for (const p of g.periods) {
    const s = periodToSpan(p);
    if (s) t.periods.push({ game_id: g.qid, label: p.label, from: s.from, to: s.to, period_qid: p.qid, note: 'Wikidata' });
    else undated.push(p.label);
  }
  t.games.push({
    id: g.qid, status: 'review', title: g.title, source: 'wikidata', qid: g.qid, release_year: g.year, wikipedia: g.enwiki,
    flags: `new-from-wikidata-${snap.fetched}${undated.length ? ' undated-period' : ''}`,
    notes: undated.length ? `Wikidata periods without dates: ${undated.join(', ')}` : undefined,
  });
  for (const p of g.places) t.placements.push({
    game_id: g.qid, place: p.label, place_qid: p.qid, lat: p.lat, lon: p.lon, kind: 'setting',
    coarse: p.types.some((x) => COARSE_TYPES.has(x)) ? 'yes' : 'no', source_url: `https://www.wikidata.org/wiki/${p.qid}`,
  });
  added++;
}
const gone = t.games.filter((g) => g.source === 'wikidata' && !snap.games.some((s) => s.qid === g.qid));
writeTables(t);
console.log(`Added ${added} new game(s) as status=review.`);
if (gone.length) console.log(`${gone.length} Wikidata game(s) in the tables are no longer in the snapshot (left untouched): ${gone.map((g) => g.id).join(', ')}`);
