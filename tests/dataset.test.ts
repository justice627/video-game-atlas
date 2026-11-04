import { describe, expect, it } from 'vitest';
import { buildAtlas, validate, TARGET_GAMES } from '../scripts/lib/dataset.ts';
import { visiblePlacements, byGame } from '../src/filter.ts';
import { KINDS } from '../src/types.ts';

const { atlas } = buildAtlas();
const find = (t: string) => atlas.games.find((g) => g.title === t);

describe('dataset', () => {
  it('passes validation', () => expect(validate(atlas)).toEqual([]));
  it(`has exactly ${TARGET_GAMES} games`, () => expect(atlas.games).toHaveLength(TARGET_GAMES));
  it('keeps Wikidata period labels and flags country pins', () => {
    expect(find("Assassin's Creed II")!.spans.map((s) => s.from)).toEqual(expect.arrayContaining([1476, 2012]));
    expect(find('Red Dead Redemption 2')!.placements.every((p) => p.coarse)).toBe(true);
  });
  it('shows Vice City and Yakuza 0 in the 1980s', () => {
    const hits = visiblePlacements(atlas.games, { range: { from: 1980, to: 1989 }, kinds: new Set(KINDS), showCoarse: true });
    const t = [...byGame(hits).keys()].map((g) => g.title);
    expect(t).toEqual(expect.arrayContaining(['Grand Theft Auto: Vice City', 'Yakuza 0']));
    expect(t.length).toBeLessThan(TARGET_GAMES);
  });
});
