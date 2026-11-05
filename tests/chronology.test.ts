import { describe, expect, it } from 'vitest';
import { readTables, type Tables } from '../scripts/lib/tables.ts';
import { buildAtlas, validate } from '../scripts/lib/dataset.ts';
import { parseRef, resolve, step } from '../scripts/lib/chronology.ts';

const tables = readTables();
const errorsAfter = (edit: (t: Tables) => void) => { const t = structuredClone(tables); edit(t); return validate(t).join('\n'); };
const row = (r: Partial<Tables['chronology'][number]>) => ({ relation: 'after', source: 'https://example.org', quote: 'later', accessed: '2026-11-05', from: '', to: '', ...r });

describe('chronology', () => {
  it('parses refs', () => {
    expect(parseRef('year:-44')).toEqual({ kind: 'year', year: -44 });
    expect(parseRef('era:world-war-i')).toEqual({ kind: 'era', id: 'world-war-i' });
    expect(parseRef('hitman-3/dubai')).toEqual({ kind: 'link', id: 'hitman-3/dubai' });
    expect(parseRef('hitman-3')).toEqual({ kind: 'game', id: 'hitman-3' });
    expect(parseRef('year:soon')).toBeNull();
  });

  it('steps: stated intervals are exact, unstated ones leave an open end', () => {
    expect(step({ lo: 2008, hi: 2008 }, 'after', 2)).toEqual({ lo: 2010, hi: 2010 });
    expect(step({ lo: 2012, hi: 2012 }, 'before', 20)).toEqual({ lo: 1992, hi: 1992 });
    expect(step({ lo: 2019, hi: 2019 }, 'after')).toEqual({ lo: 2019, hi: Infinity });
    expect(step({ lo: 2019, hi: 2020 }, 'during')).toEqual({ lo: 2019, hi: 2020 });
  });

  it('dates the golden chains', () => {
    const c = resolve(tables);
    expect(c.span('hitman-2016')).toEqual({ lo: 2019, hi: 2019 });
    expect(c.span('hitman-3/dubai')).toEqual({ lo: 2019, hi: Infinity }); // two unstated gaps: a lower bound only
    expect(c.span('uncharted-3/cartagena')).toEqual({ lo: 1992, hi: 1992 }); // a link-level flashback inside a dated game
    expect(c.span('pokemon-gold-and-silver')).toBeUndefined(); // a chain with no anchor gives no year
    expect(c.reached('pokemon-gold-and-silver/kanto-region')).toBe(true);
  });

  it('rejects stored years the chain contradicts', () => {
    expect(errorsAfter((t) => { t.links.find((l) => l.id === 'uncharted-3/cartagena')!.from = 1991; }))
      .toContain('years 1991–1992 fall outside what the chain allows (1992–1992)');
  });

  it('requires a chain for derived-time links, unless grandfathered', () => {
    const lost = 'uncharted-the-lost-legacy/halebidu';
    expect(errorsAfter(() => {})).toBe('');
    expect(errorsAfter((t) => { t.grandfathered = t.grandfathered.filter((g) => g.link_id !== lost); }))
      .toContain('derived-time links need a chronology row');
  });

  it('a derived-time link on an unanchored chain must be undated', () => {
    expect(errorsAfter((t) => {
      t.grandfathered = t.grandfathered.filter((g) => g.link_id !== 'the-last-of-us-part-ii/seattle');
    })).toContain('has no dated anchor');
  });

  it('checks rows', () => {
    const e = errorsAfter((t) => t.chronology.push(
      row({ from: 'year:1990', to: 'hitman-3', quote: 'no year here' }),
      row({ from: 'nope/nowhere', to: 'era:world-war-i', relation: 'around', interval_years: -1 }),
      row({ from: 'hitman-3', to: 'hitman-3', relation: 'during', interval_years: 2, source: 'ftp://x', accessed: 'today' }),
    ));
    expect(e).toContain('the quote must state the anchor year 1990');
    expect(e).toContain('from link "nope/nowhere" is not on the Links sheet');
    expect(e).toContain('to must be a link or a game');
    expect(e).toContain('relation "around" must be one of');
    expect(e).toContain('interval_years must be a whole number');
    expect(e).toContain('from and to are the same');
    expect(e).toContain('during takes no interval');
    expect(e).toContain('source must be one URL');
    expect(e).toContain('accessed must be a date');
  });

  it('finds cycles and disagreeing chains', () => {
    expect(errorsAfter((t) => t.chronology.push(row({ from: 'hitman-3', to: 'hitman-2016' })))).toMatch(/cycle|disagree/);
    expect(errorsAfter((t) => t.chronology.push(row({ from: 'year:1900', to: 'hitman-2016', interval_years: 1, quote: 'in 1900' }))))
      .toContain('disagree');
  });

  it('the build fills exact derived years for a link left without them', () => {
    const t = structuredClone(tables);
    const l = t.links.find((x) => x.id === 'uncharted-3/cartagena')!;
    l.from = l.to = undefined;
    t.grandfathered = t.grandfathered.filter(() => true);
    expect(validate(t)).toEqual([]);
    const built = buildAtlas(t).games.find((g) => g.id === 'uncharted-3')!.links.find((x) => x.place === 'Cartagena')!;
    expect(built.span).toEqual({ from: 1992, to: 1992 });
  });
});
