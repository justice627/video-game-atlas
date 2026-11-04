// Builds public/atlas.json from the canonical tables and validates them.
import type { Atlas, Game, Kind, Placement, Span } from '../../src/types.ts';
import { KINDS } from '../../src/types.ts';
import { STATUSES, type Tables } from './tables.ts';

type Row = { _row?: number };
const at = (sheet: string, r: Row) => `${sheet} row ${r._row ?? '?'}`;
const isInt = (n: unknown) => typeof n === 'number' && Number.isInteger(n);

export function parseBbox(s: string): [number, number, number, number] | null {
  const n = s.split(',').map((x) => Number(x.trim()));
  return n.length === 4 && n.every(Number.isFinite) && n[0] < n[2] && n[1] < n[3] ? (n as [number, number, number, number]) : null;
}

/** Problems that make the data unusable. Empty means valid. */
export function validate(t: Tables): string[] {
  const errs: string[] = [];
  const ids = new Map<string, string>();
  for (const g of t.games as (Tables['games'][number] & Row)[]) {
    if (!g.id) { errs.push(`${at('Games', g)}: id is empty`); continue; }
    if (ids.has(g.id)) errs.push(`${at('Games', g)}: id ${g.id} also used on ${ids.get(g.id)}`);
    ids.set(g.id, at('Games', g));
    if (!STATUSES.includes(g.status)) errs.push(`${at('Games', g)}: status "${g.status ?? ''}" must be one of ${STATUSES.join(', ')}`);
    if (!g.title) errs.push(`${at('Games', g)}: title is empty`);
    if (g.source !== 'wikidata' && g.source !== 'curated') errs.push(`${at('Games', g)}: source must be wikidata or curated`);
    if (g.release_year !== undefined && !isInt(g.release_year)) errs.push(`${at('Games', g)}: release_year must be a whole number`);
  }
  const live = new Set(t.games.filter((g) => g.status !== 'exclude').map((g) => g.id));
  const hasPeriod = new Set<string>(), hasPlace = new Set<string>(), placeNeedsPeriod = new Set<string>();

  for (const p of t.periods as (Tables['periods'][number] & Row)[]) {
    if (!ids.has(p.game_id)) errs.push(`${at('Periods', p)}: game_id "${p.game_id ?? ''}" is not on the Games sheet`);
    if (!isInt(p.from) || !isInt(p.to)) errs.push(`${at('Periods', p)}: from and to must be whole years`);
    else if (p.from > p.to) errs.push(`${at('Periods', p)}: from (${p.from}) is after to (${p.to})`);
    hasPeriod.add(p.game_id);
  }
  for (const p of t.placements as (Tables['placements'][number] & Row)[]) {
    const w = at('Placements', p);
    if (!ids.has(p.game_id)) errs.push(`${w}: game_id "${p.game_id ?? ''}" is not on the Games sheet`);
    if (!p.place) errs.push(`${w}: place is empty`);
    if (!(typeof p.lat === 'number' && p.lat >= -90 && p.lat <= 90)) errs.push(`${w}: lat must be between -90 and 90`);
    if (!(typeof p.lon === 'number' && p.lon >= -180 && p.lon <= 180)) errs.push(`${w}: lon must be between -180 and 180`);
    if (!KINDS.includes(p.kind as Kind)) errs.push(`${w}: kind "${p.kind ?? ''}" must be one of ${KINDS.join(', ')}`);
    if (p.coarse !== 'yes' && p.coarse !== 'no') errs.push(`${w}: coarse must be yes or no`);
    if (p.kind === 'inspiration' && !p.fictional_name) errs.push(`${w}: kind inspiration needs a fictional_name`);
    if (p.bbox && !parseBbox(p.bbox)) errs.push(`${w}: bbox must be west,south,east,north with west<east and south<north`);
    const own = p.from !== undefined || p.to !== undefined;
    if (own && (!isInt(p.from) || !isInt(p.to) || p.from! > p.to!)) errs.push(`${w}: from/to must both be whole years, from not after to`);
    if (!own) placeNeedsPeriod.add(p.game_id);
    hasPlace.add(p.game_id);
  }
  for (const id of live) {
    if (!hasPlace.has(id)) errs.push(`${ids.get(id)}: game ${id} has no placements (add one or set status to exclude)`);
    if (placeNeedsPeriod.has(id) && !hasPeriod.has(id)) errs.push(`${ids.get(id)}: game ${id} has placements without years and no periods`);
  }
  return errs;
}

/** Assumes validate() returned no errors. Excluded games are left out. */
export function buildAtlas(t: Tables, wikidataFetched: string): Atlas {
  const periods = new Map<string, Span[]>();
  for (const p of t.periods) periods.set(p.game_id, [...(periods.get(p.game_id) ?? []), { from: p.from, to: p.to, ...(p.label ? { label: p.label } : {}) }]);
  const places = new Map<string, Placement[]>();
  for (const p of t.placements) {
    const pl: Placement = {
      place: p.place, lat: p.lat, lon: p.lon, kind: p.kind as Kind, coarse: p.coarse === 'yes',
      ...(p.place_qid ? { qid: p.place_qid } : {}),
      ...(p.fictional_name ? { fictionalName: p.fictional_name } : {}),
      ...(p.level_name ? { levelName: p.level_name } : {}),
      ...(p.bbox ? { bbox: parseBbox(p.bbox)! } : {}),
      ...(p.from !== undefined ? { spans: [{ from: p.from, to: p.to! }] } : {}),
    };
    places.set(p.game_id, [...(places.get(p.game_id) ?? []), pl]);
  }
  const games: Game[] = t.games.filter((g) => g.status !== 'exclude').map((g) => ({
    id: g.id, title: g.title, source: g.source, spans: periods.get(g.id) ?? [], placements: places.get(g.id) ?? [],
    ...(g.qid ? { qid: g.qid } : {}), ...(g.release_year ? { year: g.release_year } : {}),
    ...(g.wikipedia ? { wikipedia: g.wikipedia } : {}),
  }));
  games.sort((a, b) => a.title.localeCompare(b.title));
  return { built: new Date().toISOString().slice(0, 10), wikidataFetched, games };
}
