// Discovery for research runs: games published in the last 18 months that Wikidata says are set
// in a real place with coordinates (P840 + P625). New ones become candidates (leads, not data).
import { sparql, qid, GAME } from './lib/sparql.ts';
import { readTables, writeTables } from './lib/tables.ts';

export async function discoverRecent(months = 18): Promise<number> {
  const since = new Date(Date.now() - months * 30.5 * 86400e3).toISOString().slice(0, 10);
  const rows = await sparql(`
SELECT ?g ?gLabel ?enwiki (MIN(YEAR(?pub)) AS ?year) (GROUP_CONCAT(DISTINCT CONCAT(?locLabel, " ", STRAFTER(STR(?loc), "entity/")); separator="; ") AS ?places)
WHERE {
  ${GAME}
  ?g wdt:P577 ?pub ; wdt:P840 ?loc .
  FILTER(?pub >= "${since}T00:00:00Z"^^xsd:dateTime && ?pub <= NOW())
  ?loc wdt:P625 ?coord .
  OPTIONAL { ?enwiki schema:about ?g ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". ?g rdfs:label ?gLabel . ?loc rdfs:label ?locLabel . }
}
GROUP BY ?g ?gLabel ?enwiki LIMIT 500`);
  const t = readTables();
  const known = new Set([...t.games.map((g) => g.wikidata), ...t.candidates.map((c) => c.wikidata), ...t.candidates.map((c) => c.id)].filter(Boolean));
  let added = 0;
  for (const r of rows) {
    const id = qid(r.g);
    if (!id || known.has(id) || !r.gLabel || /^Q\d+$/.test(r.gLabel)) continue;
    t.candidates.push({ id, title: r.gLabel, wikidata: id, release_year: r.year ? Number(r.year) : undefined, wikipedia: r.enwiki, lead_source: 'wikidata-recent', lead_places: r.places, flags: `new-recent-${new Date().toISOString().slice(0, 10)}` });
    known.add(id);
    added++;
  }
  t.candidates.sort((a, b) => a.title.localeCompare(b.title));
  writeTables(t);
  return added;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(`Added ${await discoverRecent()} recent candidate(s).`);
