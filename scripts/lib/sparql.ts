export type Row = Record<string, string | undefined>;

export async function sparql(query: string): Promise<Row[]> {
  const url = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(query);
  const res = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'video-game-atlas/0.1 (https://github.com/justice627/video-game-atlas)',
    },
  });
  if (!res.ok) throw new Error(`SPARQL ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    results: { bindings: Record<string, { value: string }>[] };
  };
  return json.results.bindings.map((b) =>
    Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])),
  );
}

export const qid = (uri?: string) => uri?.replace('http://www.wikidata.org/entity/', '');

// Direct instances of "video game" or "esports discipline" only. Following subclasses pulled in DLC,
// expansions, bundles, demos and unfinished projects; editions and mods also carry an extra type, excluded here.
export const NOT_GAMES = ['Q60997816' /* video game edition */, 'Q61456428' /* total conversion mod */, 'Q209163' /* expansion */,
  'Q1066707' /* DLC */, 'Q96240590' /* bundle */, 'Q16070115' /* compilation */, 'Q1755420' /* demo */,
  'Q64170508' /* unfinished project */, 'Q73548809' /* non-existent game */];
/** SPARQL pattern binding ?g to a standalone game. */
export const GAME = `VALUES ?gameType { wd:Q7889 wd:Q112144412 } ?g wdt:P31 ?gameType . FILTER NOT EXISTS { ?g wdt:P31 ?notGame . VALUES ?notGame { ${NOT_GAMES.map((q) => 'wd:' + q).join(' ')} } }`;
