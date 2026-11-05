// Source bank, quote matching, the fetcher (against a fake network) and the offline check.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readTables, type Tables } from '../scripts/lib/tables.ts';
import { validate } from '../scripts/lib/dataset.ts';
import { bankFor, contextChars, evidenceKey, findQuote, htmlToText, looksBlocked, makeEvidence, normalize, USER_AGENT } from '../scripts/lib/sources.ts';
import { fetchSource, wikiTitle } from '../scripts/lib/fetch-source.ts';
import { offline, pairs } from '../scripts/verify-sources.ts';

const tables = readTables();
const bank = tables.sources;
const errorsAfter = (edit: (t: Tables) => void) => { const t = structuredClone(tables); edit(t); return validate(t).join('\n'); };

describe('source bank', () => {
  it('matches the most specific domain', () => {
    expect(bankFor('https://en.wikipedia.org/wiki/X', bank)?.domain).toBe('wikipedia.org');
    expect(bankFor('https://ja.wikipedia.org/wiki/X', bank)?.domain).toBe('wikipedia.org');
    expect(bankFor('https://uncharted.fandom.com/wiki/X', bank)?.status).toBe('blocked');
    expect(bankFor('https://halo.fandom.com/wiki/X', bank)?.domain).toBe('fandom.com');
    expect(bankFor('https://www.goal.com/x', bank)?.tier).toBe('medium');
    expect(bankFor('https://example.org/x', bank)).toBeUndefined();
  });

  it('every source domain must be in the bank, and confidence cannot beat the best tier', () => {
    expect(errorsAfter((t) => { t.links[0].sources = 'https://example.org/page'; t.links[0].quote = undefined; t.links[0].accessed = undefined; }))
      .toContain('source domain example.org is not in the source bank');
    expect(errorsAfter((t) => { const l = t.links.find((x) => x.id === 'gta-vice-city/miami')!; l.confidence = 'high'; }))
      .toContain('confidence high is higher than its best source (medium');
    expect(errorsAfter((t) => { t.sources.push({ domain: 'www.x.com', name: 'x', tier: 'top', access: 'ftp', status: 'ok' }); }))
      .toMatch(/bare host[\s\S]*tier "top"[\s\S]*access "ftp"/);
  });
});

describe('quote matching', () => {
  it('ignores case, spacing, quotation marks and dash style, but not words', () => {
    const text = 'FOXHOUND seizes a remote island in Alaska \'s Fox Archipelago codenamed "Shadow Moses", which…';
    expect(findQuote("a remote island in Alaska's Fox Archipelago codenamed Shadow Moses", text)).not.toBeNull();
    expect(findQuote('the year 1476–1499', 'from the year 1476-1499.')).not.toBeNull();
    expect(findQuote('a remote island in Alaska codenamed Shadow Moses', text)).toBeNull();
  });

  it('elisions match in order only', () => {
    const t = 'In 1999, a prologue. Twenty years later, the story.';
    expect(findQuote('In 1999 … Twenty years later', t)).not.toBeNull();
    expect(findQuote('Twenty years later … In 1999', t)).toBeNull();
  });

  it('evidence keeps 600 characters of context for CC text and 300 otherwise', () => {
    const long = `${'a'.repeat(1000)} Set in 1986 within Vice City ${'b'.repeat(1000)}`;
    const wp = bankFor('https://en.wikipedia.org/wiki/X', bank), ea = bankFor('https://www.ea.com/x', bank);
    expect(contextChars(wp)).toBe(600);
    expect(contextChars(ea)).toBe(300);
    const e = makeEvidence('https://en.wikipedia.org/wiki/X', 'set in 1986 within Vice City', long, 'test', wp, '2026-11-05')!;
    expect(e.context).toHaveLength(600);
    expect(e.context).toContain('set in 1986 within vice city');
    expect(makeEvidence('https://www.ea.com/x', 'set in 1986 within Vice City', long, 'test', ea, '2026-11-05')!.context).toHaveLength(300);
    expect(makeEvidence('https://www.ea.com/x', 'not there', long, 'test', ea, '2026-11-05')).toBeNull();
    expect(evidenceKey('u', 'Set In 1986')).toBe(evidenceKey('u', 'set in 1986'));
  });

  it('reads HTML and spots bot walls', () => {
    expect(htmlToText('<p>A&amp;B<sup class="reference">[1]</sup></p><script>x()</script><p>C&#8217;s</p>')).toMatch(/A&B\s+C’s/);
    expect(looksBlocked(403, '')).toBe('HTTP 403');
    expect(looksBlocked(200, '<title>Just a moment...</title>')).toBe('bot challenge');
    expect(looksBlocked(200, '<p>fine</p>')).toBeNull();
  });
});

describe('fetcher (fake network)', () => {
  const reply = (status: number, body: string, headers: Record<string, string> = {}) => new Response(body, { status, headers });
  const opts = (fn: (u: string, i?: RequestInit) => Response) => {
    const calls: { url: string; ua: string }[] = [];
    return { calls, o: { bank, sleep: async () => {}, fetchFn: (async (u: string, i?: RequestInit) => { calls.push({ url: u, ua: (i?.headers as Record<string, string>)['User-Agent'] }); return fn(u, i); }) as unknown as typeof fetch } };
  };

  it('uses the MediaWiki API with the project user agent', async () => {
    const { calls, o } = opts((u) => u.includes('prop=extracts')
      ? reply(200, JSON.stringify({ query: { pages: [{ extract: 'Set in 1986 within Vice City' }] } }))
      : reply(200, JSON.stringify({ parse: { text: '<p>table text</p>' } })));
    const r = await fetchSource('https://en.wikipedia.org/wiki/Grand_Theft_Auto:_Vice_City', o);
    expect(r.ok && r.texts.map((t) => t.method)).toEqual(['mediawiki-extract', 'mediawiki-parse']);
    expect(calls[0].url).toContain('/w/api.php?');
    expect(calls[0].url).toContain('titles=Grand+Theft+Auto%3A+Vice+City');
    expect(calls.every((c) => c.ua === USER_AGENT)).toBe(true);
  });

  it('never fetches a blocked domain, and reports a 403 as blocked without retrying', async () => {
    const { calls, o } = opts(() => reply(403, 'no'));
    expect(await fetchSource('https://uncharted.fandom.com/wiki/X', o)).toMatchObject({ ok: false, kind: 'blocked' });
    expect(calls).toHaveLength(0);
    expect(await fetchSource('https://www.goal.com/en/x', o)).toMatchObject({ ok: false, kind: 'blocked', reason: 'HTTP 403' });
    expect(calls).toHaveLength(1);
  });

  it('retries a 429 once, after Retry-After, then gives up as failed', async () => {
    const waits: number[] = [];
    const { calls, o } = opts(() => reply(429, 'slow down', { 'retry-after': '7' }));
    const r = await fetchSource('https://www.goal.com/en/y', { ...o, sleep: async (ms: number) => { waits.push(ms); } });
    expect(r).toMatchObject({ ok: false, kind: 'failed', reason: 'HTTP 429' });
    expect(calls).toHaveLength(2);
    expect(waits).toContain(7000);
  });

  it('reads Steam store text from appdetails', async () => {
    const { calls, o } = opts(() => reply(200, JSON.stringify({ 42: { success: true, data: { short_description: 'Journey to <b>Istanbul</b>' } } })));
    const r = await fetchSource('https://store.steampowered.com/app/42/X/', o);
    expect(calls[0].url).toBe('https://store.steampowered.com/api/appdetails?appids=42&l=english');
    expect(r.ok && r.texts[0].text).toMatch(/Journey to\s+Istanbul/);
  });

  it('takes titles from wiki URLs', () => expect(wikiTitle('https://en.wikipedia.org/wiki/Assassin%27s_Creed_II')).toBe("Assassin's Creed II"));
});

describe('offline check', () => {
  it('passes on the committed evidence, with only grandfathered or draft gaps', () => {
    const { errors } = offline(tables);
    expect(errors).toEqual([]);
  });

  it('missing evidence is an error for a shown, non-grandfathered link', () => {
    const t = structuredClone(tables);
    const p = pairs(t).find((x) => x.status === 'draft')!;
    t.links.find((l) => l.id === p.ref)!.status = 'auto-verified';
    const empty = pathToFileURL(mkdtempSync(join(tmpdir(), 'ev-')) + '/');
    expect(offline(t, new Set([p.ref]), empty).errors[0]).toContain(`${p.ref}: no evidence`);
    writeFileSync(new URL(`${evidenceKey(p.url, p.quote)}.json`, empty), '{}');
    expect(offline(t, new Set([p.ref]), empty).errors).toEqual([]);
  });
});
