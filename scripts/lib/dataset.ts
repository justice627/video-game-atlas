// Validates the tables against docs/data-rules.md and builds public/atlas.json from verified and auto-verified links.
import type { Atlas, Game, Link, PlaceType, Role, TimeType, Confidence } from '../../src/types.ts';
import { resolve, type Chronology } from './chronology.ts';
import { bankFor } from './sources.ts';
import { ACCESS, CONFIDENCE, DEPICTIONS, FLAGS, SOURCE_STATUS, TIERS, FREEZE_KINDS, PLACE_TYPES, QUOTE_SEP, ROLES, SHOWN, STATUSES, TIME_TYPES, type PlaceRow, type Tables } from './tables.ts';

type Row = { _row?: number };
const at = (sheet: string, r: Row) => `${sheet} row ${r._row ?? '?'}`;
const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const flagsOf = (s?: string) => (s ?? '').split(/\s+/).filter(Boolean);
const urls = (s?: string) => (s ?? '').split(/\s+/).filter(Boolean);
const has = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);
export const quotesOf = (s?: string) => (s ?? '').split(QUOTE_SEP).map((q) => q.trim());
const isoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s);
/** Flags that keep a link from auto-verifying (gate check 5); a human must decide. */
export const NEEDS_JUDGMENT = ['contested', 'real-world-model', 'needs-review'] as const;

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

const RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };
const fmt = (s: { lo: number; hi: number }) => `${Number.isFinite(s.lo) ? s.lo : '…'}–${Number.isFinite(s.hi) ? s.hi : '…'}`;
/** Exact years for a derived-time link left without years, when its chain is fully stated. */
function derivedYears(l: Tables['links'][number], chron: Chronology) {
  if (!flagsOf(l.flags).includes('derived-time') || !chron.reached(l.id)) return undefined;
  const s = chron.span(l.id);
  return s && Number.isFinite(s.lo) && Number.isFinite(s.hi) ? { from: s.lo, to: s.hi } : undefined;
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
  const series = unique('Series', t.series as (Tables['series'][number] & Row)[]);
  const games = unique('Games', t.games as (Tables['games'][number] & Row)[]);
  const places = unique('Places', t.places as (PlaceRow & Row)[]);
  const eras = unique('Eras', t.eras as (Tables['eras'][number] & Row)[]);

  for (const g of t.games as (Tables['games'][number] & Row)[]) {
    if (!g.title) errs.push(`${at('Games', g)}: title is empty`);
    if (g.release_year !== undefined && !isInt(g.release_year)) errs.push(`${at('Games', g)}: release_year must be a whole number`);
    if (g.wikidata && !/^Q\d+$/.test(g.wikidata)) errs.push(`${at('Games', g)}: wikidata must look like Q123`);
    if (g.series_id && !series.has(g.series_id)) errs.push(`${at('Games', g)}: series_id "${g.series_id}" is not on the Series sheet`);
  }
  for (const s of t.series as (Tables['series'][number] & Row)[]) {
    if (!s.name) errs.push(`${at('Series', s)}: name is empty`);
    if (s.wikidata && !/^Q\d+$/.test(s.wikidata)) errs.push(`${at('Series', s)}: wikidata must look like Q123`);
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
  const grandfathered = new Set(t.grandfathered.map((g) => g.link_id));
  const chron = resolve(t);
  errs.push(...chron.errors);
  const links = unique('Links', t.links as (Tables['links'][number] & Row)[]);
  for (const g of t.grandfathered as (Tables['grandfathered'][number] & Row)[]) {
    const l = links.get(g.link_id);
    if (!l) errs.push(`${at('Grandfathered', g)}: link "${g.link_id}" is not on the Links sheet`);
  }
  const bankSeen = new Set<string>();
  for (const b of t.sources as (Tables['sources'][number] & Row)[]) {
    const w = at('Sources', b);
    if (!b.domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(b.domain) || b.domain.startsWith('www.')) errs.push(`${w}: domain "${b.domain ?? ''}" must be a bare host like wikipedia.org`);
    else if (bankSeen.has(b.domain)) errs.push(`${w}: domain ${b.domain} is listed twice`);
    bankSeen.add(b.domain);
    if (!has(TIERS, b.tier)) errs.push(`${w}: tier "${b.tier ?? ''}" must be one of ${TIERS.join(', ')}`);
    if (!has(ACCESS, b.access)) errs.push(`${w}: access "${b.access ?? ''}" must be one of ${ACCESS.join(', ')}`);
    if (!has(SOURCE_STATUS, b.status)) errs.push(`${w}: status "${b.status ?? ''}" must be one of ${SOURCE_STATUS.join(', ')}`);
    if (b.access === 'mediawiki' && !b.api) errs.push(`${w}: mediawiki access needs the api path`);
  }
  for (const c of t.chronology as (Tables['chronology'][number] & Row)[])
    if (c.source && /^https?:\/\//.test(c.source) && !bankFor(c.source, t.sources)) errs.push(`${at('Chronology', c)}: source domain ${new URL(c.source).hostname} is not in the source bank`);
  for (const f of t.freeze as (Tables['freeze'][number] & Row)[]) {
    if (!has(FREEZE_KINDS, f.kind)) errs.push(`${at('Freeze', f)}: kind "${f.kind ?? ''}" must be one of ${FREEZE_KINDS.join(', ')}`);
    else if (f.kind === 'role' && !has(ROLES, f.value)) errs.push(`${at('Freeze', f)}: "${f.value}" is not a role`);
    else if (f.kind === 'series' && !series.has(f.value)) errs.push(`${at('Freeze', f)}: series "${f.value}" is not on the Series sheet`);
  }
  for (const q of t.queueIn as (Tables['queueIn'][number] & Row)[]) {
    if (!q.title) errs.push(`${at('Queue in', q)}: title is empty`);
    if (q.wikidata && !/^Q\d+$/.test(q.wikidata)) errs.push(`${at('Queue in', q)}: wikidata must look like Q123`);
    if (q.added && !isoDate(q.added)) errs.push(`${at('Queue in', q)}: added must be a date like 2026-11-05`);
  }
  for (const l of t.links as (Tables['links'][number] & Row)[]) {
    const w = at('Links', l);
    const flags = flagsOf(l.flags);
    for (const f of flags) if (!has(FLAGS, f)) errs.push(`${w}: flag "${f}" must be one of ${FLAGS.join(', ')}`);
    const years = l.from !== undefined || l.to !== undefined;
    const yearsOk = isInt(l.from) && isInt(l.to) && l.from <= l.to;
    if (!games.has(l.game_id)) errs.push(`${w}: game_id "${l.game_id ?? ''}" is not on the Games sheet`);
    if (!places.has(l.place_id)) errs.push(`${w}: place_id "${l.place_id ?? ''}" is not on the Places sheet`);
    if (!has(ROLES, l.role)) errs.push(`${w}: role "${l.role ?? ''}" must be one of ${ROLES.join(', ')}`);
    if (!has(DEPICTIONS, l.depiction)) errs.push(`${w}: depiction "${l.depiction ?? ''}" must be one of ${DEPICTIONS.join(', ')}`);
    if (l.depiction === 'fictionalized' && !l.fictional_name) errs.push(`${w}: depiction fictionalized needs a fictional_name`);
    if (l.depiction === 'real' && l.fictional_name) errs.push(`${w}: fictional_name is only for fictionalized places; use name_in_game for a level or an old name`);
    const pt = places.get(l.place_id)?.type;
    if (l.role === 'venue' && pt && pt !== 'landmark') errs.push(`${w}: a venue is a stadium, arena, circuit or track: place type landmark, not ${pt}`);
    if (l.role === 'strategy' && pt && pt !== 'region') errs.push(`${w}: a strategy map covers a region (or the world): place type region, not ${pt}`);
    if (!has(STATUSES, l.status)) errs.push(`${w}: status "${l.status ?? ''}" must be one of ${STATUSES.join(', ')}`);
    if (l.status === 'excluded' && !l.note) errs.push(`${w}: excluded links need the reason in note`);
    if (l.status === 'excluded') continue; // kept for the record; nothing else to check
    if (!urls(l.sources).length) errs.push(`${w}: at least one source URL is required`);
    for (const u of urls(l.sources)) {
      if (!/^https?:\/\//.test(u)) errs.push(`${w}: source "${u}" is not a URL`);
      else if (!bankFor(u, t.sources)) errs.push(`${w}: source domain ${new URL(u).hostname} is not in the source bank (data/sources.csv); add it with its tier first`);
    }
    if (!has(CONFIDENCE, l.confidence)) errs.push(`${w}: confidence "${l.confidence ?? ''}" must be one of ${CONFIDENCE.join(', ')}`);
    else {
      // Rules section 6: a link's confidence is that of its best source, so it can't exceed the best tier.
      const best = Math.max(-1, ...urls(l.sources).map((u) => { const b = /^https?:\/\//.test(u) ? bankFor(u, t.sources) : undefined; return b ? RANK[b.tier] ?? -1 : -1; }));
      if (best >= 0 && RANK[l.confidence!] > best) errs.push(`${w}: confidence ${l.confidence} is higher than its best source (${TIERS.find((x) => RANK[x] === best)}, per data/sources.csv)`);
    }
    // Quotes: one per source, same order, with the date they were checked (rules section 6).
    const nSources = urls(l.sources).length;
    if (l.quote !== undefined) {
      const qs = quotesOf(l.quote);
      if (qs.length !== nSources) errs.push(`${w}: ${qs.length} quote(s) for ${nSources} source(s); give one quote per source, separated by "${QUOTE_SEP.trim()}"`);
      if (qs.some((q) => !q)) errs.push(`${w}: a quote is empty`);
      if (!l.accessed) errs.push(`${w}: quote needs the accessed date`);
    }
    if (l.accessed !== undefined && !isoDate(l.accessed)) errs.push(`${w}: accessed must be a date like 2026-11-05`);
    else if (l.accessed && l.accessed > new Date().toISOString().slice(0, 10)) errs.push(`${w}: accessed is in the future`);
    if (l.accessed && l.quote === undefined) errs.push(`${w}: accessed is set but there is no quote`);
    if (l.status === 'auto-verified' && !l.quote) errs.push(`${w}: auto-verified links need a quote for every source`);
    if (l.status === 'verified' && !l.quote && !grandfathered.has(l.id)) errs.push(`${w}: verified links need a quote for every source (only links on the Grandfathered sheet are exempt)`);
    if (l.status === 'auto-verified') for (const f of NEEDS_JUDGMENT) if (flags.includes(f)) errs.push(`${w}: flag ${f} needs a human; status cannot be auto-verified`);
    // Rules sections 3 and 4.
    if (flags.includes('inferred-time') && l.confidence !== 'low') errs.push(`${w}: inferred-time links are low confidence (season rule, present-day rule, real-world model)`);
    if (flags.includes('real-world-model') && !flags.includes('inferred-time')) errs.push(`${w}: a real-world-model date is inferred; add the inferred-time flag`);
    // Chains (section 4): derived years must come from chronology rows and agree with them.
    const shown = has(SHOWN, l.status) || l.status === 'needs-human';
    if (flags.includes('derived-time') && shown && !grandfathered.has(l.id)) {
      if (!chron.reached(l.id)) errs.push(`${w}: derived-time links need a chronology row for the link or its game`);
      else if (!chron.span(l.id)) errs.push(`${w}: the chain reaching this link has no dated anchor, so it gives no year; make the link undated`);
    }
    const s = chron.reached(l.id) ? chron.span(l.id) : undefined;
    if (s && yearsOk && (l.from! < s.lo || l.to! > s.hi))
      errs.push(`${w}: years ${l.from}–${l.to} fall outside what the chain allows (${fmt(s)})`);
    const place = places.get(l.place_id);
    if (place?.type === 'country' && !l.note) errs.push(`${w}: country pins are a last resort; say in note that the source names nothing smaller`);
    if (l.era_id && !eras.has(l.era_id)) errs.push(`${w}: era_id "${l.era_id}" is not on the Eras sheet`);
    if (years && !yearsOk) errs.push(`${w}: from/to must both be whole years, from not after to`);
    switch (l.time_type) {
      case 'fixed': if (!yearsOk && !(years === false && derivedYears(l, chron))) errs.push(`${w}: time_type fixed needs from and to (or derived-time with a chain that gives exact years)`); break;
      case 'era': if (!l.era_id) errs.push(`${w}: time_type era needs an era_id`); if (years) errs.push(`${w}: time_type era takes its years from the era; leave from/to empty`); break;
      case 'sandbox': if (!yearsOk && !l.era_id && !flags.includes('needs-time')) errs.push(`${w}: time_type sandbox needs from/to, an era_id, or the needs-time flag`); break;
      case 'undated': if (years || l.era_id) errs.push(`${w}: time_type undated takes no years or era`); if (!flags.includes('needs-time')) errs.push(`${w}: undated links must carry the needs-time flag`); break;
      default: errs.push(`${w}: time_type "${l.time_type ?? ''}" must be one of ${TIME_TYPES.join(', ')}`);
    }
  }
  return errs;
}

/** Links shown on the map (verified and auto-verified), grouped by game. Assumes validate() returned no errors. */
export function buildAtlas(t: Tables): Atlas {
  const places = new Map(t.places.map((p) => [p.id, p]));
  const eras = new Map(t.eras.map((e) => [e.id, e]));
  const byGame = new Map<string, Link[]>();
  const chron = resolve(t);
  for (const l of t.links) {
    if (!has(SHOWN, l.status)) continue;
    const p = places.get(l.place_id)!;
    const loc = locate(p.id, places)!;
    const era = l.era_id ? eras.get(l.era_id) : undefined;
    const derived = l.from === undefined && l.time_type === 'fixed' ? derivedYears(l, chron) : undefined;
    const span = l.from !== undefined ? { from: l.from, to: l.to! } : derived ? derived : era ? { from: era.from, to: era.to, label: era.name } : undefined;
    const link: Link = {
      place: p.name, placeType: p.type as PlaceType, lat: loc.lat, lon: loc.lon,
      approxPlace: loc.inherited || p.type === 'country' || p.type === 'region',
      role: l.role as Role, ...(l.depiction === 'fictionalized' ? { fictionalized: true } : {}), timeType: l.time_type as TimeType,
      sources: urls(l.sources), confidence: l.confidence as Confidence, flags: flagsOf(l.flags),
      ...(p.wikidata ? { placeWikidata: p.wikidata } : {}),
      ...(p.bbox ? { bbox: parseBbox(p.bbox)! } : {}),
      ...(l.fictional_name ? { fictionalName: l.fictional_name } : {}),
      ...(l.name_in_game ? { nameInGame: l.name_in_game } : {}),
      ...(span ? { span } : {}),
      ...(l.note ? { note: l.note } : {}),
      ...(l.status === 'auto-verified' ? { auto: true } : {}),
    };
    byGame.set(l.game_id, [...(byGame.get(l.game_id) ?? []), link]);
  }
  const games: Game[] = t.games.filter((g) => byGame.has(g.id)).map((g) => ({
    id: g.id, title: g.title, links: byGame.get(g.id)!,
    ...(g.series_id ? { series: g.series_id } : {}),
    ...(g.wikidata ? { wikidata: g.wikidata } : {}), ...(g.release_year ? { year: g.release_year } : {}),
    ...(g.wikipedia ? { wikipedia: g.wikipedia } : {}),
  }));
  games.sort((a, b) => a.title.localeCompare(b.title));
  const used = new Set(games.map((g) => g.series).filter(Boolean));
  const series = t.series.filter((s) => used.has(s.id)).map((s) => ({ id: s.id, name: s.name, ...(s.wikidata ? { wikidata: s.wikidata } : {}) }));
  return { built: new Date().toISOString().slice(0, 10), series, games };
}
