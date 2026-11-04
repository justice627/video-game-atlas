// Canonical game data: three CSV tables in data/, joined on game_id.
// They are the source of truth (diffable in git, shaped like future database tables).
// data/atlas.xlsx is an editing view generated from them; see scripts/data-*.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { KINDS } from '../../src/types.ts';
import { parseCsv, toCsv } from './csv.ts';

export const STATUSES = ['include', 'review', 'exclude'] as const;
export type Status = (typeof STATUSES)[number];

export interface GameRow {
  id: string; status: Status; title: string; source: 'wikidata' | 'curated'; qid?: string;
  release_year?: number; wikipedia?: string; flags?: string; notes?: string;
}
export interface PeriodRow { game_id: string; label?: string; from: number; to: number; period_qid?: string; note?: string }
export interface PlacementRow {
  game_id: string; place: string; place_qid?: string; lat: number; lon: number; kind: string;
  coarse: 'yes' | 'no'; fictional_name?: string; level_name?: string; bbox?: string;
  from?: number; to?: number; source_url?: string; note?: string;
}
export interface Tables { games: GameRow[]; periods: PeriodRow[]; placements: PlacementRow[] }

export interface Col { key: string; width: number; help: string; list?: readonly string[]; numeric?: boolean }
export interface TableDef { name: 'Games' | 'Periods' | 'Placements'; file: string; key: keyof Tables; cols: Col[] }

export const TABLES: TableDef[] = [
  { name: 'Games', file: 'games.csv', key: 'games', cols: [
    { key: 'id', width: 22, help: 'Unique id. Wikidata games use their QID; curated games use c-<slug>. Do not change once set.' },
    { key: 'status', width: 10, help: 'include = on the map; review = on the map, still to check; exclude = kept for the record, left off the map.', list: STATUSES },
    { key: 'title', width: 42, help: 'Display title.' },
    { key: 'source', width: 10, help: 'Where the row came from.', list: ['wikidata', 'curated'] },
    { key: 'qid', width: 12, help: 'Wikidata item id of the game, if any.' },
    { key: 'release_year', width: 8, help: 'First release year.', numeric: true },
    { key: 'wikipedia', width: 40, help: 'Full English Wikipedia URL.' },
    { key: 'flags', width: 40, help: 'Audit flags from the review, space separated. Clear them once handled.' },
    { key: 'notes', width: 60, help: 'Free text: what was checked, sources, doubts.' },
  ] },
  { name: 'Periods', file: 'periods.csv', key: 'periods', cols: [
    { key: 'game_id', width: 22, help: 'Game id from the Games sheet.' },
    { key: 'label', width: 28, help: 'Name of the period, e.g. "Kamakura period" or "1986".' },
    { key: 'from', width: 14, help: 'First year, integer. Negative = BCE (-49 is 49 BCE).', numeric: true },
    { key: 'to', width: 14, help: 'Last year, integer, not before from.', numeric: true },
    { key: 'period_qid', width: 12, help: 'Wikidata item of the period, if any.' },
    { key: 'note', width: 50, help: 'Source or reasoning for the dates.' },
  ] },
  { name: 'Placements', file: 'placements.csv', key: 'placements', cols: [
    { key: 'game_id', width: 22, help: 'Game id from the Games sheet.' },
    { key: 'place', width: 30, help: 'Real-world place name.' },
    { key: 'place_qid', width: 12, help: 'Wikidata item of the place, if any.' },
    { key: 'lat', width: 10, help: 'Latitude, decimal degrees.', numeric: true },
    { key: 'lon', width: 10, help: 'Longitude, decimal degrees.', numeric: true },
    { key: 'kind', width: 13, help: 'How the game uses the place.', list: KINDS },
    { key: 'coarse', width: 8, help: 'yes = country/region-level pin, only a rough centroid.', list: ['yes', 'no'] },
    { key: 'fictional_name', width: 20, help: 'For kind=inspiration: the fictional place, e.g. Vice City.' },
    { key: 'level_name', width: 26, help: 'Level, mission, track or map name.' },
    { key: 'bbox', width: 18, help: 'Strategy maps only: west,south,east,north in degrees.' },
    { key: 'from', width: 8, help: 'Only if this place has its own years; otherwise the game periods apply.', numeric: true },
    { key: 'to', width: 8, help: 'See from.', numeric: true },
    { key: 'source_url', width: 40, help: 'Where the place or coordinates come from.' },
    { key: 'note', width: 40, help: 'Free text.' },
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
