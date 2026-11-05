// Source bank lookups, quote matching and evidence records (docs/plans/pipeline.md, section 4.6).
import { createHash } from 'node:crypto';
import { ELISION, type SourceRow } from './tables.ts';

export const USER_AGENT = 'video-game-atlas-research/1.0 (https://github.com/justice627/video-game-atlas)';

/** The most specific bank row for a URL's host, or undefined. */
export function bankFor(url: string, bank: SourceRow[]): SourceRow | undefined {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return undefined; }
  host = host.replace(/^www\./, '');
  return bank
    .filter((b) => host === b.domain || host.endsWith(`.${b.domain}`))
    .sort((a, b) => b.domain.length - a.domain.length)[0];
}

/** Case, whitespace, quotation marks and dash style don't count. Apostrophes inside words do. */
export function normalize(s: string): string {
  return s.normalize('NFKC')
    .replace(/[­​]/g, '')
    .replace(/[‘’‚′`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/ '(s|t|d|m|ll|re|ve)\b/gi, "'$1") // HTML text can split a possessive ("alaska 's")
    .replace(/[“”„″"]/g, '') // quotation marks inside a quote don't count
    .replace(/(^|[\s(])'|'(?=[\s),.;:!?]|$)/g, '$1') // nor do single quotes used as quotation marks
    .replace(/[‐-―−]/g, '-')
    .replace(/ ([,.;:!?)])/g, '$1') // nor spaces left before punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Where the quote is in the text: every elided part, in order. Null when it isn't there. */
export function findQuote(quote: string, text: string): { start: number; end: number } | null {
  const t = normalize(text);
  const parts = quote.split(ELISION.trim()).map(normalize).filter(Boolean);
  if (!parts.length) return null;
  let at = 0, start = -1;
  for (const p of parts) {
    const i = t.indexOf(p, at);
    if (i < 0) return null;
    if (start < 0) start = i;
    at = i + p.length;
  }
  return { start, end: at };
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** One evidence record per (source URL, quote). */
export const evidenceKey = (url: string, quote: string) => sha256(`${url}\n${normalize(quote)}`).slice(0, 24);

/** Context kept around a quote: 600 characters for CC-licensed text, 300 otherwise (decision D7). */
export const contextChars = (row?: SourceRow) => (/^CC/i.test(row?.licence ?? '') ? 600 : 300);

export interface Evidence {
  url: string; quote: string; accessed: string; content_sha256: string; method: string; context: string;
}

export function makeEvidence(url: string, quote: string, text: string, method: string, row: SourceRow | undefined, accessed: string): Evidence | null {
  const hit = findQuote(quote, text);
  if (!hit) return null;
  const t = normalize(text);
  const n = Math.max(contextChars(row), hit.end - hit.start);
  const from = Math.max(0, Math.min(hit.start - Math.floor((n - (hit.end - hit.start)) / 2), t.length - n));
  return { url, quote, accessed, content_sha256: sha256(t), method, context: t.slice(from, from + n) };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
/** Readable text from HTML: drops scripts, styles and tags, decodes entities. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<sup[^>]*class="[^"]*reference[^"]*"[\s\S]*?<\/sup>/gi, '') // Wikipedia footnote markers
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, ' ');
}

/** Signs that a page is a bot wall, not content. */
export function looksBlocked(status: number, body: string): string | null {
  if (status === 401 || status === 403) return `HTTP ${status}`;
  if (/cf-chl|challenge-platform|Just a moment\.\.\.|Attention Required! \| Cloudflare|captcha/i.test(body.slice(0, 20000))) return 'bot challenge';
  return null;
}
