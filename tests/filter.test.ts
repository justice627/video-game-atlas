import { describe, expect, it } from 'vitest';
import { visiblePlacements, byGame, undatedGames, type Filters } from '../src/filter.ts';
import type { Game, Link } from '../src/types.ts';

const link = (o: Partial<Link>): Link => ({
  place: 'X', placeType: 'city', lat: 0, lon: 0, approxPlace: false, role: 'setting', timeType: 'fixed',
  sources: ['https://example.org'], confidence: 'medium', flags: [], ...o,
});
const ac2: Game = { id: 'ac2', title: "Assassin's Creed II", links: [
  link({ place: 'Florence', span: { from: 1476, to: 1499 } }),
] };
const hitman: Game = { id: 'h3', title: 'Hitman 3', links: [link({ place: 'Dubai', role: 'level', timeType: 'undated', flags: ['needs-time'] })] };
const civ: Game = { id: 'civ', title: 'Civilization VI', links: [
  link({ place: 'The world', placeType: 'region', approxPlace: true, role: 'strategy', timeType: 'sandbox', bbox: [-180, -60, 180, 75] }),
] };
const country: Game = { id: 'c', title: 'Country game', links: [link({ place: 'Italy', placeType: 'country', approxPlace: true, span: { from: 1500, to: 1500 } })] };
const all = [ac2, hitman, civ, country];
const base: Filters = { range: { from: 1400, to: 1600 }, roles: new Set(['setting', 'level', 'arena', 'inspiration']), showCoarse: true, showStrategy: false };
const titles = (f: Partial<Filters>) => [...byGame(visiblePlacements(all, { ...base, ...f })).keys()].map((g) => g.title);

describe('filter (docs/data-rules.md section 4)', () => {
  it('matches fixed spans by overlap', () => {
    expect(titles({ range: { from: 1490, to: 1490 } })).toContain("Assassin's Creed II");
    expect(titles({ range: { from: 1700, to: 1800 } })).not.toContain("Assassin's Creed II");
  });
  it('never puts undated links on the timeline', () => {
    expect(titles({ range: { from: -1e9, to: 1e5 } })).not.toContain('Hitman 3');
    expect(undatedGames(all).map((g) => g.title)).toEqual(['Hitman 3']);
  });
  it('hides strategy and sandbox until switched on', () => {
    expect(titles({})).not.toContain('Civilization VI');
    expect(titles({ showStrategy: true })).toContain('Civilization VI');
  });
  it('hides approximate pins when asked, but keeps drawn regions', () => {
    expect(titles({ showCoarse: false })).not.toContain('Country game');
    expect(titles({ showCoarse: false, showStrategy: true })).toContain('Civilization VI');
  });
  it('marks spans far wider than the window as approximate in time', () => {
    const wide: Game = { id: 'w', title: 'Wide', links: [link({ span: { from: 1000, to: 1900 } })] };
    const [h] = visiblePlacements([wide], { ...base, range: { from: 1500, to: 1510 } });
    expect(h.approxTime).toBe(true);
    const [h2] = visiblePlacements([wide], { ...base, range: { from: 1000, to: 1900 } });
    expect(h2.approxTime).toBe(false);
  });
});
