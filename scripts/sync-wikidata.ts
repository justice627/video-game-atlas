// Adds games from data/wikidata-snapshot.json to data/candidates.csv as research leads.
// Wikidata never writes Games, Places or Links: those are researched and verified by hand (docs/data-rules.md).
// Usage: npm run fetch:wikidata && npm run sync:wikidata
import { readFileSync } from 'node:fs';
import { readTables, writeTables } from './lib/tables.ts';
import { periodToSpan, type PeriodInput } from './lib/periods.ts';

interface SnapGame {
  qid: string; title: string; year?: number; enwiki?: string;
  places: { qid: string; label: string }[]; periods: (PeriodInput & { qid: string })[];
}
const snap = JSON.parse(readFileSync(new URL('../data/wikidata-snapshot.json', import.meta.url), 'utf8')) as { fetched: string; games: SnapGame[] };
const t = readTables();
const known = new Set([...t.games.map((g) => g.wikidata), ...t.candidates.map((c) => c.wikidata), ...t.candidates.map((c) => c.id)].filter(Boolean));
const yr = (n: number) => (n < 0 ? `${-n} BCE` : String(n));
let added = 0;
for (const g of snap.games) {
  if (known.has(g.qid)) continue;
  t.candidates.push({
    id: g.qid, title: g.title, wikidata: g.qid, release_year: g.year, wikipedia: g.enwiki, lead_source: 'wikidata',
    lead_places: g.places.map((p) => `${p.label} ${p.qid}`).join('; '),
    lead_periods: g.periods.map((p) => { const s = periodToSpan(p); return s ? `${p.label} (${s.from === s.to ? yr(s.from) : `${yr(s.from)}–${yr(s.to)}`})` : `${p.label} (undated)`; }).join('; '),
    flags: `new-from-wikidata-${snap.fetched}`,
  });
  added++;
}
t.candidates.sort((a, b) => a.title.localeCompare(b.title));
writeTables(t);
console.log(`Added ${added} candidate(s).`);
