import { describe, expect, it } from 'vitest';
import { STOPS, posToYear, yearToPos, formatYear, MIN_YEAR, MAX_YEAR, RESOLUTION } from '../src/timeline.ts';

describe('timeline scale', () => {
  it('hits every segment stop exactly', () => {
    for (const [p, y] of STOPS) {
      expect(posToYear(p)).toBe(y);
      expect(yearToPos(y)).toBeCloseTo(p, 6);
    }
  });
  it('round-trips years inside the historical segments', () => {
    for (const y of [-3000, -49, 1, 1476, 1986, 2026, 2077, 2183]) expect(posToYear(yearToPos(y))).toBe(y);
  });
  it('clamps out-of-range input', () => {
    expect(posToYear(-5)).toBe(MIN_YEAR);
    expect(posToYear(RESOLUTION + 5)).toBe(MAX_YEAR);
    expect(yearToPos(1e12)).toBe(RESOLUTION);
  });
  it('is monotonic', () => {
    let prev = -Infinity;
    for (let p = 0; p <= RESOLUTION; p += 7) { const y = posToYear(p); expect(y).toBeGreaterThanOrEqual(prev); prev = y; }
  });
  it('formats deep time, BCE and future', () => {
    expect(formatYear(MIN_YEAR)).toBe('13.8 bn BCE');
    expect(formatYear(-49)).toBe('49 BCE');
    expect(formatYear(-10000)).toBe('10,000 BCE');
    expect(formatYear(1476)).toBe('1476');
    expect(formatYear(100000)).toBe('100,000');
  });
});
