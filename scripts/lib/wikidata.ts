// Small Wikidata helpers for research tooling (not used by the site build).
const UA = { 'User-Agent': 'video-game-atlas/0.2 (personal project; https://github.com/justice627/video-game-atlas)' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { ...UA, Accept: 'application/json' } });
    const body = await res.text();
    if (res.ok && body.startsWith('{')) return JSON.parse(body);
    if (attempt >= 4) throw new Error(`${res.status} from ${url}: ${body.slice(0, 120)}`);
    await sleep(2000 * 2 ** attempt);
  }
}

export interface SearchHit { qid: string; label: string; description?: string }
export async function searchEntities(text: string, limit = 5): Promise<SearchHit[]> {
  const u = `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=${limit}&search=${encodeURIComponent(text)}`;
  const j = (await getJson(u)) as { search: { id: string; label: string; description?: string }[] };
  return j.search.map((s) => ({ qid: s.id, label: s.label, description: s.description }));
}

export interface PlaceRecord { qid: string; label: string; lat?: number; lon?: number; description?: string; instanceOf: string[] }
/** Label, description, Earth coordinates (P625) and instance-of labels for each QID. */
export async function placeRecords(qids: string[]): Promise<PlaceRecord[]> {
  const q = `SELECT ?p ?pLabel ?pDescription ?lat ?lon (GROUP_CONCAT(DISTINCT ?tL; separator="; ") AS ?types) WHERE {
    VALUES ?p { ${qids.map((x) => `wd:${x}`).join(' ')} }
    OPTIONAL { ?p p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ; wikibase:geoGlobe wd:Q2 ] }
    OPTIONAL { ?p wdt:P31 ?t . ?t rdfs:label ?tL FILTER(lang(?tL) = "en") }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } GROUP BY ?p ?pLabel ?pDescription ?lat ?lon`;
  const j = (await getJson('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q))) as {
    results: { bindings: Record<string, { value: string }>[] };
  };
  const seen = new Map<string, PlaceRecord>();
  for (const b of j.results.bindings) {
    const qid = b.p.value.split('/').pop()!;
    if (seen.has(qid)) continue; // items with several coordinates: keep the first (preferred rank first in WDQS output is not guaranteed; check by hand)
    seen.set(qid, {
      qid, label: b.pLabel?.value ?? qid, description: b.pDescription?.value,
      lat: b.lat ? Number(b.lat.value) : undefined, lon: b.lon ? Number(b.lon.value) : undefined,
      instanceOf: b.types?.value ? b.types.value.split('; ') : [],
    });
  }
  return qids.map((x) => seen.get(x) ?? { qid: x, label: '(not found)', instanceOf: [] });
}
