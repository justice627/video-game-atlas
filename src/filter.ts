import type { Game, Kind, Placement, Span } from './types.ts';
import type { Range } from './timeline.ts';

export interface Filters { range: Range; kinds: Set<Kind>; showCoarse: boolean }
export interface Hit { game: Game; placement: Placement; index: number; matched: Span[] }

export const overlaps = (s: Span, r: Range) => s.from <= r.to && s.to >= r.from;

/** Every placement that passes the filters, with the spans that matched the range. */
export function visiblePlacements(games: Game[], f: Filters): Hit[] {
  const hits: Hit[] = [];
  for (const game of games) {
    game.placements.forEach((placement, index) => {
      if (!f.kinds.has(placement.kind)) return;
      if (placement.coarse && !f.showCoarse) return;
      const matched = (placement.spans ?? game.spans).filter((s) => overlaps(s, f.range));
      if (matched.length) hits.push({ game, placement, index, matched });
    });
  }
  return hits;
}

/** Groups hits by game, preserving game order. */
export function byGame(hits: Hit[]): Map<Game, Hit[]> {
  const m = new Map<Game, Hit[]>();
  for (const h of hits) m.set(h.game, [...(m.get(h.game) ?? []), h]);
  return m;
}
