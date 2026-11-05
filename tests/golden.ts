// Golden examples: the worked examples in docs/data-rules.md plus the Pokémon chain.
// Each fixture in tests/golden/ is the exact built output for those games. A rule or
// build change that moves one must say so in its PR (see .github/pull_request_template.md).
import { buildAtlas } from '../scripts/lib/dataset.ts';
import type { Tables } from '../scripts/lib/tables.ts';

export const GOLDEN: Record<string, { about: string; games: (id: string) => boolean }> = {
  'gta-vice-city': { about: 'fictionalized world, fixed year', games: (id) => id === 'gta-vice-city' },
  'assassins-creed-ii': { about: 'five world links, sourced range, no frame-story link', games: (id) => id === 'assassins-creed-ii' },
  'hitman-3': { about: 'levels (one fictionalized) dated by a chain with an anchor (Hitman 2016, "In 1999")', games: (id) => id === 'hitman-3' },
  'fifa-world-cup-2010': { about: 'ten venues, two sources each', games: (id) => id === 'fifa-world-cup-2010' },
  'civilization-vi': { about: 'strategy map, sandbox time', games: (id) => id === 'civilization-vi' },
  pokemon: { about: 'fictionalized regions, chain without an anchor: stays undated', games: (id) => id.startsWith('pokemon-') },
};

/** Built output for the golden games, whatever their status: the rules are under test, not the review state. */
export function goldenOutput(t: Tables, name: string) {
  const pick = GOLDEN[name].games;
  const all = structuredClone(t);
  for (const l of all.links) if (pick(l.game_id) && l.status !== 'excluded') l.status = 'verified';
  return buildAtlas(all).games.filter((g) => pick(g.id));
}
