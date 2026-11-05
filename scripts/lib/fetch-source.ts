// Fetches a source's text politely: APIs before HTML, one host at a time at the bank's rate,
// a project user agent, Retry-After respected. A blocked or failed fetch is reported, never retried
// another way (CLAUDE.md, hard rule 1).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { bankFor, htmlToText, looksBlocked, sha256, USER_AGENT } from './sources.ts';
import type { SourceRow } from './tables.ts';

export type Fetched =
  | { ok: true; texts: { method: string; text: string }[] }
  | { ok: false; kind: 'blocked' | 'failed' | 'unsupported'; reason: string };

export interface FetchOptions {
  bank: SourceRow[];
  cacheDir?: URL;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const lastHit = new Map<string, number>();

/** A MediaWiki page title from a /wiki/ URL. */
export function wikiTitle(url: string): string | undefined {
  const u = new URL(url);
  const m = /\/wiki\/(.+)$/.exec(u.pathname);
  if (m) return decodeURIComponent(m[1]).replace(/_/g, ' ');
  return u.searchParams.get('title') ?? undefined;
}

export async function fetchSource(url: string, o: FetchOptions): Promise<Fetched> {
  const row = bankFor(url, o.bank);
  if (!row) return { ok: false, kind: 'unsupported', reason: 'domain not in data/sources.csv' };
  if (row.status === 'blocked') return { ok: false, kind: 'blocked', reason: `${row.domain} is marked blocked in data/sources.csv` };
  if (row.status === 'paid') return { ok: false, kind: 'unsupported', reason: `${row.domain} is paid` };
  if (row.access === 'none') return { ok: false, kind: 'unsupported', reason: `${row.domain} has no quotable text` };

  const cacheFile = o.cacheDir ? new URL(`${sha256(url).slice(0, 32)}.json`, o.cacheDir) : undefined;
  if (cacheFile && existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, 'utf8')) as Fetched;

  const doFetch = o.fetchFn ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const host = new URL(url).hostname;
  const get = async (target: string): Promise<{ status: number; body: string; retryAfter?: number }> => {
    for (let attempt = 0; ; attempt++) {
      const wait = (lastHit.get(host) ?? 0) + (row.rate_ms ?? 2000) - now();
      if (wait > 0) await sleep(wait);
      lastHit.set(host, now());
      const res = await doFetch(target, { headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT, Accept: 'application/json, text/html;q=0.9' }, redirect: 'follow' });
      const body = await res.text();
      const ra = Number(res.headers.get('retry-after'));
      // One polite retry on 429/503 when the server says how long to wait (at most a minute).
      if ((res.status === 429 || res.status === 503) && attempt === 0) { await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) * 1000 : 5000); continue; }
      return { status: res.status, body, retryAfter: Number.isFinite(ra) ? ra : undefined };
    }
  };

  let out: Fetched;
  try {
    const texts: { method: string; text: string }[] = [];
    if (row.access === 'mediawiki') {
      const title = wikiTitle(url);
      if (!title) return { ok: false, kind: 'unsupported', reason: 'not a /wiki/ page URL' };
      const api = `${new URL(url).origin}${row.api ?? '/w/api.php'}`;
      const q = (p: Record<string, string>) => `${api}?${new URLSearchParams({ format: 'json', formatversion: '2', redirects: '1', maxlag: '5', ...p })}`;
      // Plain-text extract first (prose); parsed HTML second (infoboxes, tables, lists).
      const ex = await get(q({ action: 'query', prop: 'extracts', explaintext: '1', titles: title }));
      const blockedEx = looksBlocked(ex.status, ex.body);
      if (blockedEx) return save({ ok: false, kind: 'blocked', reason: blockedEx });
      if (ex.status === 200) {
        const page = (JSON.parse(ex.body) as { query?: { pages?: { extract?: string; missing?: boolean }[] } }).query?.pages?.[0];
        if (page?.missing) return save({ ok: false, kind: 'failed', reason: 'page does not exist' });
        if (page?.extract) texts.push({ method: 'mediawiki-extract', text: page.extract });
      }
      const pa = await get(q({ action: 'parse', prop: 'text', page: title }));
      if (pa.status === 200) {
        const html = (JSON.parse(pa.body) as { parse?: { text?: string } }).parse?.text;
        if (html) texts.push({ method: 'mediawiki-parse', text: htmlToText(html) });
      }
      if (!texts.length) return save({ ok: false, kind: 'failed', reason: `HTTP ${ex.status}/${pa.status}` });
    } else if (row.access === 'steam') {
      const id = /\/app\/(\d+)/.exec(url)?.[1];
      if (!id) return { ok: false, kind: 'unsupported', reason: 'not a Steam app URL' };
      const r = await get(`https://store.steampowered.com/api/appdetails?appids=${id}&l=english`);
      if (r.status !== 200) return save({ ok: false, kind: looksBlocked(r.status, r.body) ? 'blocked' : 'failed', reason: `HTTP ${r.status}` });
      const d = (JSON.parse(r.body) as Record<string, { success: boolean; data?: Record<string, string> }>)[id];
      if (!d?.success || !d.data) return save({ ok: false, kind: 'failed', reason: 'appdetails returned no data' });
      texts.push({ method: 'steam-appdetails', text: htmlToText([d.data.short_description, d.data.about_the_game, d.data.detailed_description].filter(Boolean).join('\n')) });
    } else {
      const r = await get(url);
      const blocked = looksBlocked(r.status, r.body);
      if (blocked) return save({ ok: false, kind: 'blocked', reason: blocked });
      if (r.status !== 200) return save({ ok: false, kind: 'failed', reason: `HTTP ${r.status}` });
      texts.push({ method: 'html', text: htmlToText(r.body) });
    }
    out = { ok: true, texts };
  } catch (e) {
    out = { ok: false, kind: 'failed', reason: (e as Error).message };
  }
  return save(out);

  function save(f: Fetched): Fetched {
    // Only successful fetches are cached: a failure is retried on the next run.
    if (cacheFile && f.ok) { mkdirSync(o.cacheDir!, { recursive: true }); writeFileSync(cacheFile, JSON.stringify(f)); }
    return f;
  }
}
