import { describe, expect, it } from 'vitest';
import { readTables, type Tables } from '../scripts/lib/tables.ts';
import { buildAtlas, validate } from '../scripts/lib/dataset.ts';
import { visiblePlacements, byGame } from '../src/filter.ts';
import { KINDS } from '../src/types.ts';

const tables = readTables();
const atlas = buildAtlas(tables, 'test');
const find = (t: string) => atlas.games.find((g) => g.title === t);
const clone = (): Tables => structuredClone(tables);

describe('dataset (data/*.csv)', () => {
  it('passes validation', () => expect(validate(tables)).toEqual([]));
  it('leaves excluded games off the map', () => {
    const t = clone();
    t.games.find((g) => g.id === 'c-gta-vice-city')!.status = 'exclude';
    expect(buildAtlas(t, 'x').games.some((g) => g.id === 'c-gta-vice-city')).toBe(false);
  });
  it('reports bad rows with their row number', () => {
    const t = clone();
    const p = t.placements[0] as typeof t.placements[0] & { _row: number };
    p.kind = 'castle';
    expect(validate(t)).toEqual([`Placements row ${p._row}: kind "castle" must be one of ${KINDS.join(', ')}`]);
  });
  it('rejects placements pointing at unknown games', () => {
    const t = clone();
    t.placements.push({ game_id: 'nope', place: 'X', lat: 0, lon: 0, kind: 'setting', coarse: 'no' });
    expect(validate(t).join()).toContain('game_id "nope" is not on the Games sheet');
  });
  it('keeps Wikidata periods and flags country pins', () => {
    expect(find("Assassin's Creed II")!.spans.map((s) => s.from)).toEqual(expect.arrayContaining([1476, 2012]));
    expect(find('Red Dead Redemption 2')!.placements.every((p) => p.coarse)).toBe(true);
  });
  it('shows Vice City and Yakuza 0 in the 1980s', () => {
    const hits = visiblePlacements(atlas.games, { range: { from: 1980, to: 1989 }, kinds: new Set(KINDS), showCoarse: true });
    const t = [...byGame(hits).keys()].map((g) => g.title);
    expect(t).toEqual(expect.arrayContaining(['Grand Theft Auto: Vice City', 'Yakuza 0']));
  });
});
