// Validates the tables against docs/data-rules.md and builds public/atlas.json from verified links.
import type { Atlas, Game, Link, PlaceType, Role, TimeType, Confidence } from '../../src/types.ts';
import { CONFIDENCE, PLACE_TYPES, ROLES, STATUSES, TIME_TYPES, type PlaceRow, type Tables } from './tables.ts';

type Row = { _row?: number };
const at = (sheet: string, r: Row) => `${sheet} row ${r._row ?? '?'}`;
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const flagsOf = (s?: string) => (s ?? '').split(/\s+/).filter(Boolean);
const urls = (s?: string) => (s ?? '').split(/\s+/).filter(Boolean);
const has = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);

export function parseBbox(s: string): [number, number, number, number] | null {
  const n = s.split(',').map((x) => Number(x.trim()));
  return n.length === 4 && n.every(Number.isFinite) && n[0] < n[2] && n[1] < n[3] ? (n as [number, number, number, number]) : null;
}

/** Where a place is drawn: its own coordinates, else its bbox centre, else the nearest ancestor's. */
export function locate(placeId: string, places: Map<string, PlaceRow>): { lat: number; lon: number; inherited: boolean } | null {
  const seen = new Set<string>();
  let p = places.get(placeId), inherited = false;
  while (p && !seen.has(p.id)) {
    seen.add(p.id);
    if (typeof p.lat === 'number' && typeof p.lon === 'number') return { lat: p.lat, lon: p.lon, inherited };
    const b = p.bbox ? parseBbox(p.bbox) : null;
    if (b) return { lat: (b[1] + b[3]) / 2, lon: (b[0] + b[2]) / 2, inherited };
    p = p.parent ? places.get(p.parent) : undefined;
    inherited = true;
  }
  return null;
}

/** Problems with the data. Empty means valid. */
export function validate(t: Tables): string[] {
  const errs: string[] = [];
  const unique = <T extends { id: string } & Row>(sheet: string, rows: T[]) => {
    const m = new Map<string, T>();
    for (const r of rows) {
      if (!r.id) errs.push(`${at(sheet, r)}: id is empty`);
      else if (m.has(r.id)) errs.push(`${at(sheet, r)}: id "${r.id}" already used on ${at(sheet, m.get(r.id)!)}`);
      else m.set(r.id, r);
    }
    return m;
  };
  const games = unique('Games', t.games as (Tables['games'][number] & Row)[]);
  const places = unique('Places', t.places as (PlaceRow & Row)[]);
  const eras = unique('Eras', t.eras as (Tables['eras'][number] & Row)[]);

  for (const g of t.games as (Tables['games'][number] & Row)[]) {
    if (!g.title) errs.push(`${at('Games', g)}: title is empty`);
    if (g.release_year !== undefined && !isInt(g.release_year)) errs.push(`${at('Games', g)}: release_year must be a whole number`);
    if (g.wikidata && !/^Q\d+$/.test(g.wikidata)) errs.push(`${at('Games', g)}: wikidata must look like Q123`);
  }
  for (const p of t.places as (PlaceRow & Row)[]) {
    const w = at('Places', p);
    if (!p.name) errs.push(`${w}: name is empty`);
    if (!has(PLACE_TYPES, p.type)) errs.push(`${w}: type "${p.type ?? ''}" must be one of ${PLACE_TYPES.join(', ')}`);
    if (!p.wikidata && !p.geonames) errs.push(`${w}: needs a wikidata or geonames id (coordinates must come from a record)`);
    if (p.wikidata && !/^Q\d+$/.test(p.wikidata)) errs.push(`${w}: wikidata must look like Q123`);
    if (p.parent && !places.has(p.parent)) errs.push(`${w}: parent "${p.parent}" is not on the Places sheet`);
    const hasLat = p.lat !== undefined, hasLon = p.lon !== undefined;
    if (hasLat !== hasLon) errs.push(`${w}: give both lat and lon, or neither`);
    if (hasLat && !(p.lat! >= -90 && p.lat! <= 90)) errs.push(`${w}: lat must be between -90 and 90`);
    if (hasLon && !(p.lon! >= -180 && p.lon! <= 180)) errs.push(`${w}: lon must be between -180 and 180`);
    if (p.bbox && !parseBbox(p.bbox)) errs.push(`${w}: bbox must be west,south,east,north with west<east and south<north`);
    if (places.has(p.id) && !locate(p.id, places)) errs.push(`${w}: no coordinates, bbox or parent with coordinates, so it cannot be drawn`);
  }
  for (const e of t.eras as (Tables['eras'][number] & Row)[]) {
    if (!isInt(e.from) || !isInt(e.to) || e.from > e.to) errs.push(`${at('Eras', e)}: from/to must be whole years, from not after to`);
    if (!e.source) errs.push(`${at('Eras', e)}: source is required`);
  }
  for (const l of t.links as (Tables['links'][number] & Row)[]) {
    const w = at('Links', l);
    const flags = flagsOf(l.flags);
    const years = l.from !== undefined || l.to !== undefined;
    const yearsOk = isInt(l.from) && isInt(l.to) && l.from <= l.to;
    if (!games.has(l.game_id)) errs.push(`${w}: game_id "${l.game_id ?? ''}" is not on the Games sheet`);
    if (!places.has(l.place_id)) errs.push(`${w}: place_id "${l.place_id ?? ''}" is not on the Places sheet`);
    if (!has(ROLES, l.role)) errs.push(`${w}: role "${l.role ?? ''}" must be one of ${ROLES.join(', ')}`);
    if (l.role === 'inspiration' && !l.fictional_name) errs.push(`${w}: role inspiration needs a fictional_name`);
    if (!has(STATUSES, l.status)) errs.push(`${w}: status "${l.status ?? ''}" must be one of ${STATUSES.join(', ')}`);
    if (l.status === 'excluded' && !l.note) errs.push(`${w}: excluded links need the reason in note`);
    if (l.status === 'excluded') continue; // kept for the record; nothing else to check
    if (!urls(l.sources).length) errs.push(`${w}: at least one source URL is required`);
    for (const u of urls(l.sources)) if (!/^https?:\/\//.test(u)) errs.push(`${w}: source "${u}" is not a URL`);
    if (!has(CONFIDENCE, l.confidence)) errs.push(`${w}: confidence "${l.confidence ?? ''}" must be one of ${CONFIDENCE.join(', ')}`);
    if (l.era_id && !eras.has(l.era_id)) errs.push(`${w}: era_id "${l.era_id}" is not on the Eras sheet`);
    if (years && !yearsOk) errs.push(`${w}: from/to must both be whole years, from not after to`);
    switch (l.time_type) {
      case 'fixed': if (!yearsOk) errs.push(`${w}: time_type fixed needs from and to`); break;
      case 'era': if (!l.era_id) errs.push(`${w}: time_type era needs an era_id`); if (years) errs.push(`${w}: time_type era takes its years from the era; leave from/to empty`); break;
      case 'sandbox': if (!yearsOk && !l.era_id && !flags.includes('needs-time')) errs.push(`${w}: time_type sandbox needs from/to, an era_id, or the needs-time flag`); break;
      case 'undated': if (years || l.era_id) errs.push(`${w}: time_type undated takes no years or era`); if (!flags.includes('needs-time')) errs.push(`${w}: undated links must carry the needs-time flag`); break;
      default: errs.push(`${w}: time_type "${l.time_type ?? ''}" must be one of ${TIME_TYPES.join(', ')}`);
    }
  }
  return errs;
}

/** Verified links only, grouped by game. Assumes validate() returned no errors. */
export function buildAtlas(t: Tables): Atlas {
  const places = new Map(t.places.map((p) => [p.id, p]));
  const eras = new Map(t.eras.map((e) => [e.id, e]));
  const byGame = new Map<string, Link[]>();
  for (const l of t.links) {
    if (l.status !== 'verified') continue;
    const p = places.get(l.place_id)!;
    const loc = locate(p.id, places)!;
    const era = l.era_id ? eras.get(l.era_id) : undefined;
    const span = l.from !== undefined ? { from: l.from, to: l.to! } : era ? { from: era.from, to: era.to, label: era.name } : undefined;
    const link: Link = {
      place: p.name, placeType: p.type as PlaceType, lat: loc.lat, lon: loc.lon,
      approxPlace: loc.inherited || p.type === 'country' || p.type === 'region',
      role: l.role as Role, timeType: l.time_type as TimeType,
      sources: urls(l.sources), confidence: l.confidence as Confidence, flags: flagsOf(l.flags),
      ...(p.wikidata ? { placeWikidata: p.wikidata } : {}),
      ...(p.bbox ? { bbox: parseBbox(p.bbox)! } : {}),
      ...(l.fictional_name ? { fictionalName: l.fictional_name } : {}),
      ...(l.name_in_game ? { nameInGame: l.name_in_game } : {}),
      ...(span ? { span } : {}),
      ...(l.note ? { note: l.note } : {}),
    };
    byGame.set(l.game_id, [...(byGame.get(l.game_id) ?? []), link]);
  }
  const games: Game[] = t.games.filter((g) => byGame.has(g.id)).map((g) => ({
    id: g.id, title: g.title, links: byGame.get(g.id)!,
    ...(g.wikidata ? { wikidata: g.wikidata } : {}), ...(g.release_year ? { year: g.release_year } : {}),
    ...(g.wikipedia ? { wikipedia: g.wikipedia } : {}),
  }));
  games.sort((a, b) => a.title.localeCompare(b.title));
  return { built: new Date().toISOString().slice(0, 10), games };
}
