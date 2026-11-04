import type { Game, Link, Role, Span } from './types.ts';
import type { Range } from './timeline.ts';

export interface Filters { range: Range; roles: Set<Role>; showCoarse: boolean; showStrategy: boolean }
export interface Hit { game: Game; link: Link; index: number; matched?: Span; approxTime: boolean }

export const overlaps = (s: Span, r: Range) => s.from <= r.to && s.to >= r.from;
/** A span much wider than the selected window says little about this window: draw it as approximate. */
export const APPROX_FACTOR = 5;

/** Strategy maps and sandbox time are hidden unless asked for (docs/data-rules.md, section 4). */
export const isStrategyLike = (l: Link) => l.role === 'strategy' || l.timeType === 'sandbox';

export function visiblePlacements(games: Game[], f: Filters): Hit[] {
  const hits: Hit[] = [];
  const window = f.range.to - f.range.from + 1;
  for (const game of games) {
    game.links.forEach((link, index) => {
      if (link.timeType === 'undated') return;            // never on the timeline
      if (isStrategyLike(link)) { if (!f.showStrategy) return; }
      else if (!f.roles.has(link.role)) return;
      if (link.approxPlace && !link.bbox && !f.showCoarse) return;
      if (!link.span) {                                    // sandbox without known years: shown whenever sandbox is on
        hits.push({ game, link, index, approxTime: true });
        return;
      }
      if (!overlaps(link.span, f.range)) return;
      const width = link.span.to - link.span.from + 1;
      hits.push({ game, link, index, matched: link.span, approxTime: width > APPROX_FACTOR * window });
    });
  }
  return hits;
}

export function byGame(hits: Hit[]): Map<Game, Hit[]> {
  const m = new Map<Game, Hit[]>();
  for (const h of hits) m.set(h.game, [...(m.get(h.game) ?? []), h]);
  return m;
}

/** Verified games that cannot appear on the timeline yet because none of their links has a time. */
export const undatedGames = (games: Game[]) => games.filter((g) => g.links.every((l) => l.timeType === 'undated'));
