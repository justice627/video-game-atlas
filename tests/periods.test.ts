import { describe, expect, it } from 'vitest';
import { expand, parseYear, periodToSpan } from '../scripts/lib/periods.ts';

describe('Wikidata periods', () => {
  it('converts astronomical BCE years to historical numbering', () => {
    expect(parseYear('-0048-01-01T00:00:00Z')).toBe(-49); // 49 BC
    expect(parseYear('0000-01-01T00:00:00Z')).toBe(-1);
    expect(parseYear('1476-01-01T00:00:00Z')).toBe(1476);
  });
  it('expands by precision', () => {
    expect(expand('1476-01-01T00:00:00Z', 9)).toEqual({ from: 1476, to: 1476 });
    expect(expand('1980-01-01T00:00:00Z', 8)).toEqual({ from: 1980, to: 1989 });
    expect(expand('1600-01-01T00:00:00Z', 7)).toEqual({ from: 1501, to: 1600 });
    expect(expand('-0499-01-01T00:00:00Z', 7)).toEqual({ from: -500, to: -401 }); // 5th century BCE
    expect(expand('2000-01-01T00:00:00Z', 6)).toEqual({ from: 1001, to: 2000 });
  });
  it('prefers start/end over a point in time', () => {
    expect(periodToSpan({
      label: 'Kamakura period', point: ['1200-01-01T00:00:00Z', 9],
      start: ['1185-01-01T00:00:00Z', 9], end: ['1333-01-01T00:00:00Z', 9],
    })).toEqual({ from: 1185, to: 1333, label: 'Kamakura period' });
  });
  it('handles open-ended and missing dates', () => {
    expect(periodToSpan({ label: 'x', start: ['1900-01-01T00:00:00Z', 9] })).toEqual({ from: 1900, to: 1900, label: 'x' });
    expect(periodToSpan({ label: 'future' })).toBeNull();
  });
});
