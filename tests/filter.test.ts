import { describe, expect, it } from 'vitest';
import { visiblePlacements, byGame } from '../src/filter.ts';
import type { Game } from '../src/types.ts';
import { KINDS } from '../src/types.ts';

const ac2: Game = {
  id: 'ac2', title: "Assassin's Creed II", source: 'wikidata',
  spans: [{ from: 1476, to: 1476 }, { from: 2012, to: 2012 }],
  placements: [
    { place: 'Florence', lat: 43.77, lon: 11.25, kind: 'setting', coarse: false },
    { place: 'Italy', lat: 42.5, lon: 12.5, kind: 'setting', coarse: true },
  ],
};
const cod2: Game = {
  id: 'cod2', title: 'Call of Duty 2', source: 'curated', spans: [{ from: 1941, to: 1945 }],
  placements: [
    { place: 'Moscow', lat: 55.7, lon: 37.6, kind: 'level', coarse: false, spans: [{ from: 1941, to: 1941 }] },
    { place: 'Pointe du Hoc', lat: 49.4, lon: -1, kind: 'level', coarse: false, spans: [{ from: 1944, to: 1944 }] },
  ],
};
const all = { kinds: new Set(KINDS), showCoarse: true };
const titles = (r: { from: number; to: number }, extra = {}) =>
  [...byGame(visiblePlacements([ac2, cod2], { ...all, range: r, ...extra })).keys()].map((g) => g.title);

describe('filter', () => {
  it('matches any span, never the min-max envelope', () => {
    expect(titles({ from: 1476, to: 1476 })).toContain("Assassin's Creed II");
    expect(titles({ from: 2012, to: 2012 })).toContain("Assassin's Creed II");
    expect(titles({ from: 1700, to: 1800 })).not.toContain("Assassin's Creed II");
  });
  it('uses placement spans over game spans', () => {
    const hits = visiblePlacements([cod2], { ...all, range: { from: 1944, to: 1944 } });
    expect(hits.map((h) => h.placement.place)).toEqual(['Pointe du Hoc']);
  });
  it('hides coarse pins when asked', () => {
    const hits = visiblePlacements([ac2], { ...all, showCoarse: false, range: { from: 1400, to: 1500 } });
    expect(hits.map((h) => h.placement.place)).toEqual(['Florence']);
  });
  it('filters by kind', () => {
    expect(titles({ from: 0, to: 3000 }, { kinds: new Set(['level']) })).toEqual(['Call of Duty 2']);
  });
});
