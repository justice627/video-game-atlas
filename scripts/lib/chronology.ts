// Years from chains of sourced relative statements (docs/data-rules.md, section 4).
// A chronology row says: `to` is `relation` `from`, `interval_years` apart if the source states it.
// Refs: a link id (game/place), a game id (that game's main story), or an anchor: year:1999, era:<era id>.
import type { Tables } from './tables.ts';

export const RELATIONS = ['after', 'before', 'during'] as const;
export type Span = { lo: number; hi: number }; // ±Infinity for an open end
export type Ref = { kind: 'year'; year: number } | { kind: 'era'; id: string } | { kind: 'link'; id: string } | { kind: 'game'; id: string };

export function parseRef(s: string): Ref | null {
  if (!s) return null;
  const y = /^year:(-?\d+)$/.exec(s);
  if (y) return { kind: 'year', year: Number(y[1]) };
  if (s.startsWith('year:')) return null;
  if (s.startsWith('era:')) return { kind: 'era', id: s.slice(4) };
  return s.includes('/') ? { kind: 'link', id: s } : { kind: 'game', id: s };
}

/** The span a relation gives `to`, from the span of `from`. */
export function step(from: Span, relation: string, interval?: number): Span {
  const n = interval ?? 0;
  if (relation === 'during') return { ...from };
  if (relation === 'after') return interval === undefined ? { lo: from.lo, hi: Infinity } : { lo: from.lo + n, hi: from.hi + n };
  /* before */ return interval === undefined ? { lo: -Infinity, hi: from.hi } : { lo: from.lo - n, hi: from.hi - n };
}

export interface Chronology {
  /** Computed span of a link or game; undefined when no chain reaches an anchor. */
  span(ref: string): Span | undefined;
  /** Whether any row has this link (or its game) as its target. */
  reached(linkId: string): boolean;
  errors: string[];
}

/** Resolves every chain. Errors name the chronology row. */
export function resolve(t: Tables): Chronology {
  const errors: string[] = [];
  const links = new Map(t.links.map((l) => [l.id, l]));
  const games = new Set(t.games.map((g) => g.id));
  const eras = new Map(t.eras.map((e) => [e.id, e]));
  const rowsTo = new Map<string, Tables['chronology']>();
  for (const r of t.chronology) rowsTo.set(r.to, [...(rowsTo.get(r.to) ?? []), r]);
  const memo = new Map<string, Span | undefined>();
  const visiting = new Set<string>();
  const where = (r: Tables['chronology'][number]) => `Chronology row ${(r as { _row?: number })._row ?? '?'}`;

  const span = (key: string): Span | undefined => {
    if (memo.has(key)) return memo.get(key);
    if (visiting.has(key)) { errors.push(`chronology: cycle through "${key}"`); return undefined; }
    visiting.add(key);
    let out: Span | undefined;
    const ref = parseRef(key);
    if (ref?.kind === 'year') out = { lo: ref.year, hi: ref.year };
    else if (ref?.kind === 'era') { const e = eras.get(ref.id); out = e ? { lo: e.from, hi: e.to } : undefined; }
    else {
      const rows = rowsTo.get(key) ?? [];
      if (rows.length) {
        for (const r of rows) {
          const from = span(r.from);
          if (!from) { out = undefined; break; } // one unanchored step leaves the target unanchored
          const s = step(from, r.relation, r.interval_years);
          out = out ? { lo: Math.max(out.lo, s.lo), hi: Math.min(out.hi, s.hi) } : s;
          if (out.lo > out.hi) { errors.push(`${where(r)}: chains into "${key}" disagree (no year satisfies all of them)`); out = undefined; break; }
        }
      } else if (ref?.kind === 'link') {
        const l = links.get(ref.id);
        // A dated link that no row targets is an anchor; a derived one inherits its game's chain.
        if (l && !(l.flags ?? '').split(/\s+/).includes('derived-time') && l.from !== undefined && l.to !== undefined) out = { lo: l.from, hi: l.to };
        else if (l?.era_id && eras.has(l.era_id)) out = { lo: eras.get(l.era_id)!.from, hi: eras.get(l.era_id)!.to };
        else if (l && rowsTo.has(l.game_id)) out = span(l.game_id);
      }
    }
    visiting.delete(key);
    memo.set(key, out);
    return out;
  };

  for (const r of t.chronology) {
    const w = where(r);
    const from = parseRef(r.from), to = parseRef(r.to);
    const exists = (ref: Ref | null, raw: string) => {
      if (!ref) return `"${raw ?? ''}" is not a link id, game id, year:N or era:id`;
      if (ref.kind === 'link' && !links.has(ref.id)) return `link "${ref.id}" is not on the Links sheet`;
      if (ref.kind === 'game' && !games.has(ref.id)) return `game "${ref.id}" is not on the Games sheet`;
      if (ref.kind === 'era' && !eras.has(ref.id)) return `era "${ref.id}" is not on the Eras sheet`;
      return '';
    };
    const ef = exists(from, r.from), et = exists(to, r.to);
    if (ef) errors.push(`${w}: from ${ef}`);
    if (et) errors.push(`${w}: to ${et}`);
    if (to && (to.kind === 'year' || to.kind === 'era')) errors.push(`${w}: to must be a link or a game; anchors only go in from`);
    if (r.from === r.to) errors.push(`${w}: from and to are the same`);
    if (!(RELATIONS as readonly string[]).includes(r.relation)) errors.push(`${w}: relation "${r.relation ?? ''}" must be one of ${RELATIONS.join(', ')}`);
    if (r.interval_years !== undefined && !(Number.isInteger(r.interval_years) && r.interval_years >= 0)) errors.push(`${w}: interval_years must be a whole number of years, or empty when the source states none`);
    if (r.relation === 'during' && r.interval_years !== undefined) errors.push(`${w}: during takes no interval`);
    if (!r.source || !/^https?:\/\//.test(r.source)) errors.push(`${w}: source must be one URL`);
    if (!r.quote) errors.push(`${w}: quote is required`);
    if (r.quote && from?.kind === 'year' && !r.quote.includes(String(from.year))) errors.push(`${w}: the quote must state the anchor year ${from.year}`);
    if (!r.accessed || !/^\d{4}-\d{2}-\d{2}$/.test(r.accessed)) errors.push(`${w}: accessed must be a date like 2026-11-05`);
  }
  for (const k of rowsTo.keys()) span(k);

  return {
    span,
    reached: (id) => rowsTo.has(id) || rowsTo.has(links.get(id)?.game_id ?? ''),
    errors: [...new Set(errors)],
  };
}
