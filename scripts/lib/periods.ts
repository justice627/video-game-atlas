import type { Span } from '../../src/types.ts';

/** Wikidata precision codes. */
const P = { MILLENNIUM: 6, CENTURY: 7, DECADE: 8, YEAR: 9 } as const;

/**
 * WDQS emits XSD-style astronomical years ("-0048" = 49 BC). Convert to historical
 * numbering with no year 0 so -49 means 49 BCE.
 */
export function parseYear(timeValue: string): number {
  const m = /^([+-]?)(\d+)-/.exec(timeValue);
  if (!m) throw new Error(`Unparseable time value: ${timeValue}`);
  const astro = (m[1] === '-' ? -1 : 1) * Number(m[2]);
  return astro <= 0 ? astro - 1 : astro;
}

/** Expands a single time value into the range of years its precision covers. */
export function expand(timeValue: string, precision: number): Span {
  const y = parseYear(timeValue);
  if (precision >= P.YEAR) return { from: y, to: y };
  if (precision === P.DECADE) {
    const d = Math.floor(y / 10) * 10;
    return { from: d, to: d + 9 };
  }
  if (precision === P.CENTURY) {
    // Wikidata convention: the stored year sits inside the century; 1501..1600 = 16th century.
    if (y > 0) { const c = Math.floor((y - 1) / 100); return { from: c * 100 + 1, to: c * 100 + 100 }; }
    const c = Math.floor((-y - 1) / 100); return { from: -(c * 100 + 100), to: -(c * 100 + 1) };
  }
  if (precision === P.MILLENNIUM) {
    if (y > 0) { const c = Math.floor((y - 1) / 1000); return { from: c * 1000 + 1, to: c * 1000 + 1000 }; }
    const c = Math.floor((-y - 1) / 1000); return { from: -(c * 1000 + 1000), to: -(c * 1000 + 1) };
  }
  // Coarser than millennium (10k, 100k, million years...): widen by 10^(9 - precision).
  const width = 10 ** (P.YEAR - precision);
  const base = Math.floor(y / width) * width;
  return { from: base, to: base + width - 1 };
}

type TV = [string, number];
export interface PeriodInput { label: string; point?: TV; start?: TV; end?: TV }

/** Resolves a Wikidata period item to a span, or null when it carries no dates. */
export function periodToSpan(p: PeriodInput): Span | null {
  if (p.start || p.end) {
    const s = p.start ? expand(...p.start) : undefined;
    const e = p.end ? expand(...p.end) : undefined;
    const from = (s ?? e)!.from;
    const to = (e ?? s)!.to;
    return from <= to ? { from, to, label: p.label } : { from: to, to: from, label: p.label };
  }
  if (p.point) return { ...expand(...p.point), label: p.label };
  return null;
}
