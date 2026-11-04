export type Row = Record<string, string | undefined>;

export async function sparql(query: string): Promise<Row[]> {
  const url = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(query);
  const res = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'video-game-atlas/0.1 (personal project; https://github.com/justice627/video-game-atlas)',
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
