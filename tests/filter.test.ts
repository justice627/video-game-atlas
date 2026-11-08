import { describe, expect, it } from 'vitest';
import { MIN_YEAR, MAX_YEAR } from '../src/timeline.ts';
import { visiblePlacements, byGame, undatedGames, groupEntries, type Filters } from '../src/filter.ts';
import type { Game, Link } from '../src/types.ts';

const link = (o: Partial<Link>): Link => ({
  place: 'X', placeType: 'city', lat: 0, lon: 0, approxPlace: false, role: 'world', timeType: 'fixed',
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
const base: Filters = { range: { from: 1400, to: 1600 }, roles: new Set(['world', 'level', 'venue', 'map']), showCoarse: true, showStrategy: false, showUndated: false, showAuto: true };
const titles = (f: Partial<Filters>) => [...byGame(visiblePlacements(all, { ...base, ...f })).keys()].map((g) => g.title);

describe('filter (docs/data-rules.md section 4)', () => {
  it('matches fixed spans by overlap', () => {
    expect(titles({ range: { from: 1490, to: 1490 } })).toContain("Assassin's Creed II");
    expect(titles({ range: { from: 1700, to: 1800 } })).not.toContain("Assassin's Creed II");
  });
  it('shows undated links only under "All time" or with their switch on', () => {
    expect(titles({ range: { from: -1e9, to: 1e5 } })).not.toContain('Hitman 3');
    expect(titles({ range: { from: MIN_YEAR, to: MAX_YEAR } })).toContain('Hitman 3');
    expect(titles({ showUndated: true })).toContain('Hitman 3');
    const [h] = visiblePlacements([hitman], { ...base, showUndated: true });
    expect(h.matched).toBeUndefined();
    expect(h.approxTime).toBe(true);
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

describe('series grouping (docs/data-rules.md section 5)', () => {
  const arena = (o: Partial<Link>) => link({ role: 'venue', placeType: 'landmark', placeWikidata: 'Q207109', place: 'Johan Cruijff ArenA', lat: 52.31, lon: 4.94, span: { from: 2010, to: 2010 }, ...o });
  const fifa = (id: string, nameInGame: string): Game => ({ id, title: id, series: 'fifa', links: [arena({ nameInGame })] });
  const games = [fifa('FIFA 11', 'Amsterdam ArenA'), fifa('FIFA 20', 'Johan Cruijff ArenA'),
    { id: 'other', title: 'Other', links: [arena({})] }];
  const hits = visiblePlacements(games, { ...base, roles: new Set(['venue']), range: { from: 2000, to: 2020 } });
  it('keeps one entry per game when not collapsed', () => expect(groupEntries(hits, false)).toHaveLength(3));
  it('merges a series at one place into one entry, but never games without a series', () => {
    const e = groupEntries(hits, true);
    expect(e.map((x) => x.map((h) => h.game.id))).toEqual([['FIFA 11', 'FIFA 20'], ['other']]);
    expect(e[0].map((h) => h.link.nameInGame)).toEqual(['Amsterdam ArenA', 'Johan Cruijff ArenA']);
  });
});

describe('auto-verified links', () => {
  it('show by default and hide with the switch', () => {
    const auto: Game = { id: 'a', title: 'Auto', links: [link({ place: 'Lisbon', auto: true, span: { from: 1500, to: 1500 } })] };
    expect(visiblePlacements([auto], base)).toHaveLength(1);
    expect(visiblePlacements([auto], { ...base, showAuto: false })).toHaveLength(0);
  });
});
