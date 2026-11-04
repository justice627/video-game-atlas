// Canonical game data: three CSV tables in data/, joined on game_id.
// They are the source of truth (diffable in git, shaped like future database tables).
// data/atlas.xlsx is an editing view generated from them; see scripts/data-*.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsv, toCsv } from './csv.ts';

export const ROLES = ['setting', 'level', 'arena', 'inspiration', 'strategy'] as const;
export const PLACE_TYPES = ['landmark', 'city', 'region', 'country'] as const;
export const TIME_TYPES = ['fixed', 'era', 'sandbox', 'undated'] as const;
export const CONFIDENCE = ['high', 'medium', 'low'] as const;
export const STATUSES = ['draft', 'verified', 'excluded'] as const;

export interface SeriesRow { id: string; name: string; wikidata?: string; note?: string }
export interface GameRow { id: string; title: string; series_id?: string; wikidata?: string; release_year?: number; wikipedia?: string; note?: string }
export interface PlaceRow {
  id: string; name: string; type: string; parent?: string; wikidata?: string; geonames?: string;
  lat?: number; lon?: number; bbox?: string; note?: string;
}
export interface LinkRow {
  game_id: string; place_id: string; role: string; fictional_name?: string; name_in_game?: string;
  time_type: string; from?: number; to?: number; era_id?: string; sources?: string;
  confidence?: string; status: string; flags?: string; note?: string;
}
export interface EraRow { id: string; name: string; from: number; to: number; source?: string; note?: string }
export interface CandidateRow {
  id: string; title: string; wikidata?: string; release_year?: number; wikipedia?: string;
  lead_source?: string; lead_places?: string; lead_periods?: string; flags?: string; note?: string;
}
export interface Tables { series: SeriesRow[]; games: GameRow[]; places: PlaceRow[]; links: LinkRow[]; eras: EraRow[]; candidates: CandidateRow[] }

export interface Col { key: string; width: number; help: string; list?: readonly string[]; numeric?: boolean }
export interface TableDef { name: string; file: string; key: keyof Tables; cols: Col[] }

// Column meanings follow docs/data-rules.md.
export const TABLES: TableDef[] = [
  { name: 'Series', file: 'series.csv', key: 'series', cols: [
    { key: 'id', width: 20, help: 'Unique id, lowercase-with-dashes.' },
    { key: 'name', width: 30, help: 'Display name of the series or franchise.' },
    { key: 'wikidata', width: 12, help: 'Wikidata item of the series (the P179 "part of the series" value).' },
    { key: 'note', width: 40, help: 'Free text.' },
  ] },
  { name: 'Games', file: 'games.csv', key: 'games', cols: [
    { key: 'id', width: 24, help: 'Unique id, lowercase-with-dashes. Do not change once links use it.' },
    { key: 'title', width: 40, help: 'Display title.' },
    { key: 'series_id', width: 18, help: 'Series id from the Series sheet; at most one (rules section 5).' },
    { key: 'wikidata', width: 12, help: 'Wikidata item of the game (Q...).' },
    { key: 'release_year', width: 8, help: 'First release year.', numeric: true },
    { key: 'wikipedia', width: 40, help: 'English Wikipedia URL.' },
    { key: 'note', width: 40, help: 'Free text.' },
  ] },
  { name: 'Places', file: 'places.csv', key: 'places', cols: [
    { key: 'id', width: 24, help: 'Unique id, lowercase-with-dashes. One row per real place.' },
    { key: 'name', width: 28, help: 'Common English name of the place today.' },
    { key: 'type', width: 10, help: 'Most specific type that fits.', list: PLACE_TYPES },
    { key: 'parent', width: 20, help: 'Id of the containing place (landmark -> city -> country).' },
    { key: 'wikidata', width: 12, help: 'Wikidata item. Coordinates must come from this record (or GeoNames).' },
    { key: 'geonames', width: 10, help: 'GeoNames id, if used instead of or alongside Wikidata.' },
    { key: 'lat', width: 12, help: 'Latitude from the record. Leave empty if the record has none: the parent location is used, marked approximate.', numeric: true },
    { key: 'lon', width: 12, help: 'Longitude from the record.', numeric: true },
    { key: 'bbox', width: 18, help: 'Regions drawn as an area: west,south,east,north.' },
    { key: 'note', width: 40, help: 'Free text.' },
  ] },
  { name: 'Links', file: 'links.csv', key: 'links', cols: [
    { key: 'game_id', width: 22, help: 'Game id from the Games sheet.' },
    { key: 'place_id', width: 22, help: 'Place id from the Places sheet.' },
    { key: 'role', width: 11, help: 'How the game uses the place (rules section 3).', list: ROLES },
    { key: 'fictional_name', width: 16, help: 'Required for role inspiration: the fictional place, e.g. Vice City.' },
    { key: 'name_in_game', width: 22, help: 'Level, mission or track name, or the name the game uses for the place (old venue name, historical city name).' },
    { key: 'time_type', width: 10, help: 'Rules section 4.', list: TIME_TYPES },
    { key: 'from', width: 8, help: 'First year (fixed, or sandbox with known dates). Negative = BCE.', numeric: true },
    { key: 'to', width: 8, help: 'Last year.', numeric: true },
    { key: 'era_id', width: 14, help: 'For time_type era (or sandbox): id from the Eras sheet.' },
    { key: 'sources', width: 50, help: 'One or more URLs, separated by spaces, supporting place, role and time.' },
    { key: 'confidence', width: 10, help: 'Of the best source (rules section 6).', list: CONFIDENCE },
    { key: 'status', width: 9, help: 'Only verified links appear on the map.', list: STATUSES },
    { key: 'flags', width: 14, help: 'Space separated, e.g. needs-time.' },
    { key: 'note', width: 50, help: 'Quote from the source, reasoning, or the reason for excluded.' },
  ] },
  { name: 'Eras', file: 'eras.csv', key: 'eras', cols: [
    { key: 'id', width: 18, help: 'Unique id.' },
    { key: 'name', width: 24, help: 'Period name.' },
    { key: 'from', width: 10, help: 'First year. Negative = BCE.', numeric: true },
    { key: 'to', width: 10, help: 'Last year.', numeric: true },
    { key: 'source', width: 40, help: 'Required. PeriodO where it has the period.' },
    { key: 'note', width: 30, help: 'Free text.' },
  ] },
  { name: 'Candidates', file: 'candidates.csv', key: 'candidates', cols: [
    { key: 'id', width: 14, help: 'Old v0.1 id. Candidates are leads, not data: research one into Games/Links, then delete its row.' },
    { key: 'title', width: 36, help: 'Title.' },
    { key: 'wikidata', width: 12, help: 'Wikidata item, if any.' },
    { key: 'release_year', width: 8, help: 'Release year.', numeric: true },
    { key: 'wikipedia', width: 36, help: 'Wikipedia URL.' },
    { key: 'lead_source', width: 14, help: 'Where the leads came from. Not a source for links.' },
    { key: 'lead_places', width: 50, help: 'Unverified places from Wikidata or v0.1.' },
    { key: 'lead_periods', width: 36, help: 'Unverified periods from Wikidata or v0.1.' },
    { key: 'flags', width: 30, help: 'Problems found in the v0.1 review.' },
    { key: 'note', width: 30, help: 'Free text.' },
  ] },
];

const DATA = new URL('../../data/', import.meta.url);

/** Converts raw cell values (string or number) to the column's type; blanks become undefined. */
export function coerce(def: TableDef, raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of def.cols) {
    let v = raw[c.key];
    if (typeof v === 'string') v = v.replace(/\r\n?/g, '\n').trim();
    if (v === '' || v === undefined || v === null) continue;
    out[c.key] = c.numeric ? Number(v) : String(v);
  }
  return out;
}

export function readTables(dir = DATA): Tables {
  const t = {} as Record<keyof Tables, unknown[]>;
  for (const def of TABLES) {
    const [header, ...rows] = parseCsv(readFileSync(new URL(def.file, dir), 'utf8'));
    const missing = def.cols.filter((c) => !header.includes(c.key)).map((c) => c.key);
    if (missing.length) throw new Error(`${def.file}: missing columns ${missing.join(', ')}`);
    // _row is the 1-based line in the CSV (and the row in the workbook), used in error messages.
    t[def.key] = rows.map((r, i) => ({ ...coerce(def, Object.fromEntries(header.map((h, j) => [h, r[j]]))), _row: i + 2 }))
      .filter((r) => Object.keys(r).length > 1);
  }
  return t as unknown as Tables;
}

export function writeTables(t: Tables, dir = DATA) {
  for (const def of TABLES) {
    writeFileSync(new URL(def.file, dir), toCsv(def.cols.map((c) => c.key), t[def.key] as unknown as Record<string, unknown>[]));
  }
}
