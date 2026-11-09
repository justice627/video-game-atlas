// Checks every quote against its source (docs/plans/pipeline.md, section 4.6).
//
//   npm run verify:sources -- --offline [--links id,id]   quotes vs committed evidence; no network (CI, hook)
//   npm run verify:sources -- --fetch [--changed|--all]    fetch sources, write evidence records
//
// --fetch looks only at quotes without evidence, unless --changed (rows changed against origin/main)
// or --all (every quote, for the weekly re-check). A blocked or failed fetch is logged in
// review/blocked-sources.csv and never fails the run. Full pages stay in .cache/ (gitignored);
// only small evidence records in data/evidence/ are committed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseCsv, toCsv } from './lib/csv.ts';
import { quotesOf } from './lib/dataset.ts';
import { fetchSource } from './lib/fetch-source.ts';
import { bankFor, evidenceKey, makeEvidence, type Evidence } from './lib/sources.ts';
import { readTables, type Tables } from './lib/tables.ts';

const ROOT = new URL('../', import.meta.url);
export const EVIDENCE = new URL('data/evidence/', ROOT);
const BLOCKED = new URL('review/blocked-sources.csv', ROOT);
const BLOCKED_COLS = ['url', 'domain', 'ref', 'what_to_find', 'kind', 'reason', 'first_seen', 'last_seen'];

export interface Pair { ref: string; status: string; grandfathered: boolean; url: string; quote: string }

/** Every (source, quote) pair in links and chronology. */
export function pairs(t: Tables): Pair[] {
  const gf = new Set(t.grandfathered.map((g) => g.link_id));
  const out: Pair[] = [];
  for (const l of t.links) {
    if (l.status === 'excluded' || !l.quote) continue;
    const urls = (l.sources ?? '').split(/\s+/).filter(Boolean);
    quotesOf(l.quote).forEach((q, i) => urls[i] && out.push({ ref: l.id, status: l.status, grandfathered: gf.has(l.id), url: urls[i], quote: q }));
  }
  t.chronology.forEach((c, i) => c.source && c.quote && out.push({ ref: `chronology:${i + 2}`, status: 'chronology', grandfathered: false, url: c.source, quote: c.quote }));
  return out;
}

const evidenceFile = (p: Pair) => new URL(`${evidenceKey(p.url, p.quote)}.json`, EVIDENCE);
export const hasEvidence = (p: Pair, dir = EVIDENCE) => existsSync(new URL(`${evidenceKey(p.url, p.quote)}.json`, dir));

/** Offline check. Missing evidence is an error for shown, non-grandfathered links; a warning otherwise. */
export function offline(t: Tables, only?: Set<string>, dir = EVIDENCE) {
  const errors: string[] = [], warnings: string[] = [];
  for (const p of pairs(t)) {
    if (only && !only.has(p.ref)) continue;
    if (hasEvidence(p, dir)) continue;
    const msg = `${p.ref}: no evidence that ${new URL(p.url).hostname} contains "${p.quote.slice(0, 80)}" (run verify:sources -- --fetch)`;
    if ((p.status === 'verified' || p.status === 'auto-verified') && !p.grandfathered) errors.push(msg);
    else warnings.push(msg);
  }
  return { errors, warnings };
}

/** Link ids whose rows differ from origin/main, plus chronology rows (by content) that are new. */
function changedRefs(t: Tables): Set<string> {
  const show = (f: string) => { try { return execFileSync('git', ['show', `origin/main:data/${f}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; } };
  const base = new Map<string, string>();
  const [h, ...rows] = parseCsv(show('links.csv'));
  for (const r of rows) base.set(r[h?.indexOf('id') ?? 0], r.join('\u0000'));
  const now = parseCsv(readFileSync(new URL('data/links.csv', ROOT), 'utf8'));
  const out = new Set<string>();
  for (const r of now.slice(1)) { const id = r[now[0].indexOf('id')]; if (base.get(id) !== r.join('\u0000')) out.add(id); }
  const oldChron = new Set(parseCsv(show('chronology.csv')).map((r) => r.join('\u0000')));
  parseCsv(readFileSync(new URL('data/chronology.csv', ROOT), 'utf8')).slice(1).forEach((r, i) => { if (!oldChron.has(r.join('\u0000'))) out.add(`chronology:${i + 2}`); });
  void t;
  return out;
}

/** Adds or refreshes rows in review/blocked-sources.csv (one per URL and ref). */
export function recordBlocked(rows: Record<string, string>[]) {
  const today = new Date().toISOString().slice(0, 10);
  const [h, ...old] = existsSync(BLOCKED) ? parseCsv(readFileSync(BLOCKED, 'utf8')) : [BLOCKED_COLS];
  const all = old.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
  for (const n of rows) {
    const same = all.find((r) => r.url === n.url && r.ref === n.ref);
    if (same) Object.assign(same, { kind: n.kind, reason: n.reason, last_seen: today });
    else all.push({ ...n, first_seen: today, last_seen: today });
  }
  mkdirSync(new URL('review/', ROOT), { recursive: true });
  writeFileSync(BLOCKED, toCsv(BLOCKED_COLS, all));
}

export async function fetchMode(t: Tables, mode: 'missing' | 'changed' | 'all') {
  const today = new Date().toISOString().slice(0, 10);
  const changed = mode === 'changed' ? changedRefs(t) : undefined;
  const todo = pairs(t).filter((p) => mode === 'all' || (mode === 'changed' ? changed!.has(p.ref) : !hasEvidence(p)));
  const cacheDir = new URL(`.cache/sources/${today}/`, ROOT);
  mkdirSync(EVIDENCE, { recursive: true });
  const found: Pair[] = [], notFound: Pair[] = [], blocked: Record<string, string>[] = [];
  const stats = { fetched: 0 };
  for (const p of todo) {
    const res = await fetchSource(p.url, { bank: t.sources, cacheDir });
    stats.fetched++;
    if (!res.ok) {
      const b = bankFor(p.url, t.sources);
      blocked.push({ url: p.url, domain: b?.domain ?? new URL(p.url).hostname, ref: p.ref, what_to_find: `The sentence: "${p.quote}"`, kind: res.kind, reason: res.reason });
      continue;
    }
    let ev: Evidence | null = null;
    for (const x of res.texts) if ((ev = makeEvidence(p.url, p.quote, x.text, x.method, bankFor(p.url, t.sources), today))) break;
    if (ev) { writeFileSync(evidenceFile(p), JSON.stringify(ev, null, 2) + '\n'); found.push(p); }
    else notFound.push(p);
  }
  if (blocked.length) recordBlocked(blocked);
  const lines = [
    `verify-sources --fetch (${mode}): ${todo.length} quote(s) checked`,
    `  found and recorded: ${found.length}`,
    `  not found in the source: ${notFound.length}`,
    ...notFound.map((p) => `    ${p.ref} [${p.status}${p.grandfathered ? ', grandfathered' : ''}]: "${p.quote.slice(0, 100)}" not in ${p.url}`),
    `  blocked or failed (logged in review/blocked-sources.csv): ${blocked.length}`,
    ...blocked.map((b) => `    ${b.ref}: ${b.kind}, ${b.reason} (${b.url})`),
  ];
  console.log(lines.join('\n'));
  const report = process.argv.find((a) => a.startsWith('--report='))?.slice(9);
  if (report) writeFileSync(report, lines.join('\n') + '\n');
  return { found, notFound, blocked };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const t = readTables();
  if (args.includes('--fetch')) {
    await fetchMode(t, args.includes('--all') ? 'all' : args.includes('--changed') ? 'changed' : 'missing');
  } else {
    const only = args.find((a) => a.startsWith('--links='))?.slice(8);
    const { errors, warnings } = offline(t, only ? new Set(only.split(',')) : undefined);
    const n = existsSync(EVIDENCE) ? readdirSync(EVIDENCE).length : 0;
    console.log(`verify-sources --offline: ${pairs(t).length} quote(s), ${n} evidence record(s); ${errors.length} error(s), ${warnings.length} warning(s)`);
    if (args.includes('--verbose')) for (const w of warnings) console.log(`  warning: ${w}`);
    for (const e of errors) console.error(`  error: ${e}`);
    if (errors.length) process.exit(1);
  }
}
