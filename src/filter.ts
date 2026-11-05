import type { Game, Link, Role, Span } from './types.ts';
import { MIN_YEAR, MAX_YEAR, type Range } from './timeline.ts';

export interface Filters { range: Range; roles: Set<Role>; showCoarse: boolean; showStrategy: boolean; showUndated: boolean }
export interface Hit { game: Game; link: Link; index: number; matched?: Span; approxTime: boolean }

export const overlaps = (s: Span, r: Range) => s.from <= r.to && s.to >= r.from;
/** A span much wider than the selected window says little about this window: draw it as approximate. */
export const APPROX_FACTOR = 5;

/** Strategy maps and sandbox time are hidden unless asked for (docs/data-rules.md, section 4). */
export const isStrategyLike = (l: Link) => l.role === 'strategy' || l.timeType === 'sandbox';

/** The full slider range: the only window that says nothing about time. */
export const isAllTime = (r: Range) => r.from <= MIN_YEAR && r.to >= MAX_YEAR;
/** Undated links show under "All time" or with their switch on (docs/data-rules.md, section 4). */
export const undatedShown = (f: Filters) => f.showUndated || isAllTime(f.range);

export function visiblePlacements(games: Game[], f: Filters): Hit[] {
  const hits: Hit[] = [];
  const window = f.range.to - f.range.from + 1;
  for (const game of games) {
    game.links.forEach((link, index) => {
      if (link.timeType === 'undated' && !undatedShown(f)) return;
      if (isStrategyLike(link)) { if (!f.showStrategy) return; }
      else if (!f.roles.has(link.role)) return;
      if (link.approxPlace && !link.bbox && !f.showCoarse) return;
      if (!link.span) {                                    // undated, or sandbox without known years: no time to match
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

/** Verified games with no dated link: hidden from any window narrower than "All time" unless the undated switch is on. */
export const undatedGames = (games: Game[]) => games.filter((g) => g.links.every((l) => l.timeType === 'undated'));

/**
 * Map entries: one per hit, or, when collapsing by series, one per series × place × role.
 * Games without a series are never merged with other games.
 */
export function groupEntries(hits: Hit[], collapse: boolean): Hit[][] {
  if (!collapse) return hits.map((h) => [h]);
  const m = new Map<string, Hit[]>();
  for (const h of hits) {
    const owner = h.game.series ? `series:${h.game.series}` : `game:${h.game.id}`;
    const place = h.link.placeWikidata ?? `${h.link.lat.toFixed(4)},${h.link.lon.toFixed(4)}`;
    const key = `${owner}|${h.link.role}|${place}`;
    m.set(key, [...(m.get(key) ?? []), h]);
  }
  return [...m.values()];
}
