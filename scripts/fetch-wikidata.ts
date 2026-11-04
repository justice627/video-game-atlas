// Fetches every Wikidata video game that has BOTH a narrative location (P840) with
// Earth coordinates (P625) and a "set in period" (P2408). Output is a frozen snapshot;
// the build never hits the network. Re-run manually to refresh.
import { writeFileSync } from 'node:fs';
import { sparql, qid } from './lib/sparql.ts';

const GAME = '?g wdt:P31/wdt:P279* wd:Q7889 .';

const placesQuery = `
SELECT ?g ?gLabel ?enwiki (MIN(YEAR(?pub)) AS ?year) ?loc ?locLabel ?lat ?lon
       (GROUP_CONCAT(DISTINCT ?type; separator=" ") AS ?types)
WHERE {
  ${GAME}
  ?g wdt:P2408 ?anyPeriod ; wdt:P840 ?loc .
  ?loc p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ; wikibase:geoGlobe wd:Q2 ] .
  OPTIONAL { ?loc wdt:P31 ?type }
  OPTIONAL { ?g wdt:P577 ?pub }
  OPTIONAL { ?enwiki schema:about ?g ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}
GROUP BY ?g ?gLabel ?enwiki ?loc ?locLabel ?lat ?lon`;

const periodsQuery = `
SELECT DISTINCT ?g ?p ?pLabel ?pt ?ptp ?ps ?psp ?pe ?pep
WHERE {
  ${GAME}
  ?g wdt:P2408 ?p ; wdt:P840/wdt:P625 ?anyCoord .
  OPTIONAL { ?p p:P585/psv:P585 [ wikibase:timeValue ?pt ; wikibase:timePrecision ?ptp ] }
  OPTIONAL { ?p p:P580/psv:P580 [ wikibase:timeValue ?ps ; wikibase:timePrecision ?psp ] }
  OPTIONAL { ?p p:P582/psv:P582 [ wikibase:timeValue ?pe ; wikibase:timePrecision ?pep ] }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}`;

export interface SnapshotPlace { qid: string; label: string; lat: number; lon: number; types: string[] }
export interface SnapshotPeriod {
  qid: string; label: string;
  point?: [string, number]; start?: [string, number]; end?: [string, number]; // [timeValue, precision]
}
export interface SnapshotGame {
  qid: string; title: string; year?: number; enwiki?: string;
  places: SnapshotPlace[]; periods: SnapshotPeriod[];
}

const [placeRows, periodRows] = [await sparql(placesQuery), await sparql(periodsQuery)];
const games = new Map<string, SnapshotGame>();

for (const r of placeRows) {
  const id = qid(r.g)!;
  const g = games.get(id) ?? { qid: id, title: r.gLabel!, places: [], periods: [] };
  if (r.year) g.year = Number(r.year);
  if (r.enwiki) g.enwiki = r.enwiki;
  const locId = qid(r.loc)!;
  if (!g.places.some((p) => p.qid === locId)) {
    g.places.push({
      qid: locId, label: r.locLabel!, lat: Number(r.lat), lon: Number(r.lon),
      types: (r.types ?? '').split(' ').filter(Boolean).map((t) => qid(t)!).sort(),
    });
  }
  games.set(id, g);
}

for (const r of periodRows) {
  const g = games.get(qid(r.g)!);
  if (!g) continue;
  const pid = qid(r.p)!;
  if (g.periods.some((p) => p.qid === pid)) continue; // keep first value per period item
  const per: SnapshotPeriod = { qid: pid, label: r.pLabel! };
  if (r.pt) per.point = [r.pt, Number(r.ptp)];
  if (r.ps) per.start = [r.ps, Number(r.psp)];
  if (r.pe) per.end = [r.pe, Number(r.pep)];
  g.periods.push(per);
}

const list = [...games.values()]
  .filter((g) => g.periods.length && g.places.length)
  .map((g) => ({ ...g, places: g.places.sort((a, b) => a.qid.localeCompare(b.qid)), periods: g.periods.sort((a, b) => a.qid.localeCompare(b.qid)) }))
  .sort((a, b) => Number(a.qid.slice(1)) - Number(b.qid.slice(1)));

writeFileSync(
  new URL('../data/wikidata-snapshot.json', import.meta.url),
  JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), source: 'https://query.wikidata.org (CC0)', games: list }, null, 1) + '\n',
);
console.log(`snapshot: ${list.length} games, ${list.reduce((n, g) => n + g.places.length, 0)} places`);
