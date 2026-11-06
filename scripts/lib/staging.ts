// Research writes to data/staging/<game-id>/ only; this merges one game's staging tables into the
// real ones under fixed rules (docs/plans/pipeline.md, section 3.2):
// - rows must belong to that game; links arrive as draft and never higher;
// - a verified link is never changed: the difference becomes a change-to-verified proposal;
// - an auto-verified link that research changes goes back to draft (it has to pass the gate again);
// - excluded links are left alone; places are reused by id or Wikidata id, never silently changed;
// - the result must validate, or nothing is merged.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { parseCsv } from './csv.ts';
import { validate } from './dataset.ts';
import { TABLES, coerce, type LinkRow, type Tables } from './tables.ts';

export const STAGED = ['series', 'games', 'places', 'eras', 'links', 'chronology'] as const;
type Staged = (typeof STAGED)[number];
export interface Blocked { url: string; what_to_find: string }
export interface Proposal { link: string; proposed: string; claim: string }
export interface MergeResult {
  ok: boolean; errors: string[]; notes: string[];
  tables: Tables; proposals: Proposal[]; blocked: Blocked[]; linkIds: string[];
}

/** Fields compared when research re-states an existing link. */
const LINK_FIELDS: (keyof LinkRow)[] = ['place_id', 'role', 'depiction', 'fictional_name', 'name_in_game', 'time_type', 'from', 'to', 'era_id', 'sources', 'quote', 'accessed', 'confidence', 'flags', 'note'];
const q = (v: unknown) => (v === undefined ? '""' : /[\s"]/.test(String(v)) ? `"${String(v).replace(/(["\\])/g, '\\$1')}"` : String(v));

export function readStaging(dir: URL): { rows: Partial<Record<Staged, Record<string, unknown>[]>>; blocked: Blocked[] } {
  const rows: Partial<Record<Staged, Record<string, unknown>[]>> = {};
  for (const key of STAGED) {
    const def = TABLES.find((d) => d.key === key)!;
    const f = new URL(def.file, dir);
    if (!existsSync(f)) continue;
    const [h, ...rs] = parseCsv(readFileSync(f, 'utf8'));
    rows[key] = rs.filter((r) => r.some(Boolean)).map((r, i) => ({ ...coerce(def, Object.fromEntries(h.map((k, j) => [k, r[j]]))), _row: i + 2, _staged: def.file }));
  }
  const b = new URL('blocked.csv', dir);
  const blocked = existsSync(b) ? (([h, ...rs]) => rs.filter((r) => r.some(Boolean)).map((r) => ({ url: r[h.indexOf('url')] ?? '', what_to_find: r[h.indexOf('what_to_find')] ?? '' })))(parseCsv(readFileSync(b, 'utf8'))) : [];
  return { rows, blocked };
}

export function stagedGames(root: URL): string[] {
  const d = new URL('data/staging/', root);
  return existsSync(d) ? readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];
}

export function mergeStaging(base: Tables, game: string, staged: ReturnType<typeof readStaging>): MergeResult {
  const t = structuredClone(base);
  const errors: string[] = [], notes: string[] = [], proposals: Proposal[] = [], linkIds: string[] = [];
  const at = (r: Record<string, unknown>) => `staging/${game}/${r._staged} row ${r._row}`;
  // Merged rows keep a row label pointing at the staging file, so validation errors name it.
  const strip = <T>(r: Record<string, unknown>) => { const { _row, _staged, ...rest } = r; return { ...rest, _row: `${_row} of staging/${game}/${_staged}` } as T; };
  const placeAlias = new Map<string, string>();

  for (const s of staged.rows.series ?? []) {
    const r = strip<Tables['series'][number]>(s);
    if (!t.series.some((x) => x.id === r.id)) t.series.push(r);
  }
  for (const g of staged.rows.games ?? []) {
    const r = strip<Tables['games'][number]>(g);
    if (r.id !== game) { errors.push(`${at(g)}: game "${r.id}" is not ${game}; a run may only add its own game`); continue; }
    const old = t.games.find((x) => x.id === r.id);
    if (!old) t.games.push(r);
    else for (const [k, v] of Object.entries(r)) if ((old as unknown as Record<string, unknown>)[k] === undefined) (old as unknown as Record<string, unknown>)[k] = v; // fills gaps only
  }
  if (!t.games.some((x) => x.id === game)) errors.push(`staging/${game}: no games.csv row for ${game}`);
  for (const p of staged.rows.places ?? []) {
    const r = strip<Tables['places'][number]>(p);
    const byId = t.places.find((x) => x.id === r.id);
    const byQid = r.wikidata ? t.places.find((x) => x.wikidata === r.wikidata) : undefined;
    if (byId) {
      if (byId.wikidata && r.wikidata && byId.wikidata !== r.wikidata) errors.push(`${at(p)}: place id "${r.id}" already exists as ${byId.wikidata}, not ${r.wikidata}; pick another id`);
      continue; // existing places are reference data: never changed by a run
    }
    if (byQid) { placeAlias.set(r.id, byQid.id); notes.push(`${at(p)}: place ${r.wikidata} already exists as "${byQid.id}"; links use that`); continue; }
    t.places.push(r);
  }
  for (const e of staged.rows.eras ?? []) { const r = strip<Tables['eras'][number]>(e); if (!t.eras.some((x) => x.id === r.id)) t.eras.push(r); }

  for (const s of staged.rows.links ?? []) {
    const r = strip<LinkRow>(s);
    if (r.game_id !== game) { errors.push(`${at(s)}: link for game "${r.game_id}" in ${game}'s staging; a run may only touch its own game`); continue; }
    r.place_id = placeAlias.get(r.place_id) ?? r.place_id;
    if (r.status && r.status !== 'draft') { errors.push(`${at(s)}: status "${r.status}"; research only writes draft (the gate decides the rest)`); continue; }
    r.status = 'draft';
    if (!r.id) { const base = `${r.game_id}/${r.place_id}`; let id = base, n = 1; while (t.links.some((x) => x.id === id) || linkIds.includes(id)) id = `${base}/${++n}`; r.id = id; }
    const old = t.links.find((x) => x.id === r.id);
    if (old && (old.game_id !== r.game_id)) { errors.push(`${at(s)}: link id ${r.id} belongs to ${old.game_id}`); continue; }
    if (old?.status === 'verified') {
      const diff = LINK_FIELDS.filter((k) => String(old[k] ?? '') !== String(r[k] ?? ''));
      if (diff.length) proposals.push({ link: r.id, proposed: diff.map((k) => `${k}=${q(r[k])}`).join(' '), claim: `Research proposes: ${diff.map((k) => `${k} ${q(old[k])} → ${q(r[k])}`).join('; ')}` });
      continue;
    }
    if (old?.status === 'excluded') { notes.push(`${at(s)}: ${r.id} is excluded; left alone`); continue; }
    if (old) Object.assign(old, r); else t.links.push(r);
    linkIds.push(r.id);
  }
  for (const c of staged.rows.chronology ?? []) {
    const r = strip<Tables['chronology'][number]>(c);
    if (!t.chronology.some((x) => x.from === r.from && x.to === r.to && x.relation === r.relation)) t.chronology.push(r);
  }

  if (!errors.length) {
    const before = new Set(validate(base));
    for (const e of validate(t)) if (!before.has(e)) errors.push(e);
  }
  return { ok: !errors.length, errors, notes, tables: t, proposals, blocked: staged.blocked, linkIds };
}
