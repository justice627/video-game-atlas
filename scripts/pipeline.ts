// Deterministic steps of a research run (/research-batch). Agents research and judge; this script
// picks games, merges staging, applies queue decisions, records verdicts and commits. Usage:
//
//   npm run pipeline -- apply-decisions            apply decided rows in review/queue.csv
//   npm run pipeline -- backpressure               "research" or "discover-only" (exit 0 either way)
//   npm run pipeline -- discover                   Wikidata: snapshot sync + recent releases → candidates
//   npm run pipeline -- pick <n>                   next n games as JSON: queue-in, backlog, unblocked, best leads
//   npm run pipeline -- merge-staging <game>       data/staging/<game>/ → tables (draft only; never edits verified)
//   npm run pipeline -- record-factcheck <game> <file.json>   store the fact-checker's verdict per link
//   npm run pipeline -- abandon <game> <reason>    drop a game's staging, put it on the research backlog
//   npm run pipeline -- log <run> <key> <value> [game]   add a line to the run log (e.g. tokens 41200 hitman-2)
//   npm run pipeline -- commit <run>               data-only commit on branch data/<run>, pushed
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { parseCsv, toCsv } from './lib/csv.ts';
import { validate } from './lib/dataset.ts';
import { applyDecisions, BACKPRESSURE, byPriority, parseAssignments, Queue, type QueueRow } from './lib/queue.ts';
import { evidenceKey, sha256 } from './lib/sources.ts';
import { mergeStaging, readStaging } from './lib/staging.ts';
import { readTables, writeTables, type LinkRow, type Tables } from './lib/tables.ts';
import { recordBlocked } from './verify-sources.ts';

export const ROOT = new URL('../', import.meta.url);
const today = () => new Date().toISOString().slice(0, 10);
const csvRows = (path: string) => {
  const f = new URL(path, ROOT);
  if (!existsSync(f)) return [] as Record<string, string>[];
  const [h, ...rows] = parseCsv(readFileSync(f, 'utf8'));
  return rows.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
};
const writeCsv = (path: string, cols: string[], rows: Record<string, unknown>[]) => { mkdirSync(new URL('.', new URL(path, ROOT)), { recursive: true }); writeFileSync(new URL(path, ROOT), toCsv(cols, rows)); };

/** Paths a data commit may touch (the data-guard rule, docs/plans/pipeline.md phase 7). */
export const DATA_PATHS = /^(data\/|docs\/research\/|docs\/review\/|review\/)/;
export const BACKLOG_COLS = ['game', 'title', 'reason', 'attempts', 'added'];
export const FACTCHECK_COLS = ['link', 'run', 'verdict', 'rule', 'note', 'row_hash', 'date'];
export const AUDIT_COLS = ['link', 'batch', 'date', 'result', 'cause'];

/** Hash of the parts of a link a verdict is about: any change to them voids the verdict. */
export function linkHash(l: LinkRow): string {
  return sha256(JSON.stringify([l.place_id, l.role, l.depiction, l.fictional_name, l.name_in_game, l.time_type, l.from, l.to, l.era_id, l.sources, l.quote, l.confidence, l.flags])).slice(0, 16);
}

// ---------- apply-decisions ----------
export function applyQueueDecisions(t: Tables, q: Queue, run = today()) {
  const audits: Record<string, string>[] = [];
  const log = { audit: (r: QueueRow, result: string, cause: string) => audits.push({ link: r.link, batch: run, date: today(), result, cause }) };
  // One row at a time against a copy: a decision that would make the data invalid is not applied.
  let current = t;
  const remaining: QueueRow[] = [], resolved = q.resolved(), results: { id: string; outcome: string; error?: string }[] = [];
  for (const row of q.rows()) {
    if (!row.decision) { remaining.push(row); continue; }
    const trial = structuredClone(current);
    const auditCount = audits.length;
    const res = applyDecisions(trial, [row], log);
    const errs = res.results[0].error ? [] : validate(trial);
    if (res.results[0].error || errs.length) {
      audits.length = auditCount;
      remaining.push(row);
      results.push({ id: row.id, outcome: 'not applied', error: res.results[0].error ?? errs.slice(0, 3).join('; ') });
      continue;
    }
    current = trial;
    remaining.push(...res.remaining);
    resolved.push(...res.resolved);
    results.push(res.results[0]);
  }
  return { tables: current, remaining: byPriority(remaining), resolved, results, audits };
}

/** Evidence for a blocked source the owner checked by hand: their pasted text, or their confirmation. */
export function writeOwnerEvidence(rows: { source: string; quote: string; decision_note: string; id: string; outcome: string }[], dir = new URL('data/evidence/', ROOT)) {
  mkdirSync(dir, { recursive: true });
  for (const r of rows) {
    let text = '';
    try { text = parseAssignments(r.decision_note).find(([k]) => k === 'quote')?.[1] ?? ''; } catch { /* free-text note */ }
    const quote = r.outcome.startsWith('quote replaced') ? text : r.quote;
    if (!quote) continue;
    const ev = { url: r.source, quote, accessed: today(), content_sha256: '', method: `owner (justice627, review ${r.id})`, context: text || `Confirmed on the page by the owner in review ${r.id}.` };
    writeFileSync(new URL(`${evidenceKey(r.source, quote)}.json`, dir), JSON.stringify(ev, null, 2) + '\n');
  }
}

// ---------- pick ----------
export interface Pick { id: string; title: string; wikidata?: string; wikipedia?: string; why: string }
export function scoreCandidate(c: Tables['candidates'][number]): number {
  const flags = c.flags ?? '';
  const places = (c.lead_places ?? '').split(';').filter((s) => s.trim()).length;
  return places + (c.lead_periods ? 1 : 0) + (c.wikipedia ? 1 : 0) - (/only-coarse-pins/.test(flags) ? 3 : 0) - (/generic-period|span>500y/.test(flags) ? 2 : 0);
}
export function pick(t: Tables, n: number, opts: { backlog?: Record<string, string>[]; blocked?: Record<string, string>[] } = {}): Pick[] {
  const frozenRoles = new Set(t.freeze.filter((f) => f.kind === 'role').map((f) => f.value));
  const frozenSeries = new Set(t.freeze.filter((f) => f.kind === 'series').map((f) => f.value));
  const researched = new Set(t.links.map((l) => l.game_id));
  const frozenGame = (id: string) => { const g = t.games.find((x) => x.id === id); return !!g?.series_id && frozenSeries.has(g.series_id); };
  // Sports candidates (v0.1 flag) would be venue research: frozen while the venue role is.
  const frozenCandidate = (c: Tables['candidates'][number]) => frozenRoles.has('venue') && /sports-as-setting/.test(c.flags ?? '');
  const out: Pick[] = [], seen = new Set<string>();
  const add = (p: Pick) => { const k = (p.wikidata ?? p.id).toLowerCase(); if (out.length < n && !seen.has(k) && !seen.has(p.title.toLowerCase())) { seen.add(k); seen.add(p.title.toLowerCase()); out.push(p); } };
  const byTitle = (title: string) => t.candidates.find((c) => c.title.toLowerCase() === title.toLowerCase());
  for (const q of t.queueIn) {
    const c = (q.wikidata && t.candidates.find((x) => x.wikidata === q.wikidata)) || byTitle(q.title);
    add({ id: c?.id ?? q.wikidata ?? q.title, title: q.title, wikidata: q.wikidata ?? c?.wikidata, wikipedia: q.wikipedia ?? c?.wikipedia, why: `queue-in${q.note ? `: ${q.note}` : ''}` });
  }
  for (const b of opts.backlog ?? []) {
    if (Number(b.attempts) >= 2 || frozenGame(b.game)) continue;
    const g = t.games.find((x) => x.id === b.game);
    add({ id: b.game, title: b.title || g?.title || b.game, wikidata: g?.wikidata, wikipedia: g?.wikipedia, why: `backlog: ${b.reason}` });
  }
  const okDomains = new Set(t.sources.filter((s) => s.status === 'ok').map((s) => s.domain));
  for (const b of opts.blocked ?? []) {
    if (b.kind !== 'blocked' || !okDomains.has(b.domain) || !b.ref.includes('/')) continue;
    const game = b.ref.split('/')[0];
    const g = t.games.find((x) => x.id === game);
    if (g && !frozenGame(game)) add({ id: game, title: g.title, wikidata: g.wikidata, wikipedia: g.wikipedia, why: `source unblocked: ${b.domain}` });
  }
  const pool = t.candidates.filter((c) => !frozenCandidate(c) && !researched.has(c.id) && !t.games.some((g) => g.wikidata && g.wikidata === c.wikidata));
  for (const c of pool.map((c) => ({ c, s: scoreCandidate(c) })).sort((a, b) => b.s - a.s || a.c.title.localeCompare(b.c.title)))
    add({ id: c.c.id, title: c.c.title, wikidata: c.c.wikidata, wikipedia: c.c.wikipedia, why: `candidate, lead score ${c.s}` });
  return out;
}

// ---------- merge-staging ----------
export function mergeGame(game: string, q: Queue, run: string, root = ROOT) {
  const dir = new URL(`data/staging/${game}/`, root);
  if (!existsSync(dir)) throw new Error(`no staging folder for ${game}`);
  const r = mergeStaging(readTables(), game, readStaging(dir));
  if (!r.ok) return r;
  writeTables(r.tables);
  for (const p of r.proposals) {
    const l = r.tables.links.find((x) => x.id === p.link)!;
    q.add({ kind: 'change-to-verified', link: p.link, game, place: l.place_id, claim: p.claim, source: l.sources ?? '', quote: l.quote ?? '', reason: `research run ${run} found different values for a verified link`, proposed: p.proposed, what_i_need_to_do: 'Approve to apply the proposed values, reject to keep the link as it is, or edit with your own values.' });
  }
  if (r.blocked.length) recordBlocked(r.blocked.map((b) => ({ url: b.url, domain: (() => { try { return new URL(b.url).hostname.replace(/^www\./, ''); } catch { return ''; } })(), ref: game, what_to_find: b.what_to_find, kind: 'blocked', reason: 'reported by the researcher' })));
  rmSync(dir, { recursive: true });
  return r;
}

// ---------- record-factcheck ----------
export interface Verdict { verdict: 'pass' | 'object'; objections?: { link: string; rule: string; note: string }[] }
export function recordFactcheck(t: Tables, game: string, v: Verdict, run: string, path = 'review/factcheck.csv') {
  if (v.verdict !== 'pass' && v.verdict !== 'object') throw new Error('verdict must be "pass" or "object"');
  const links = t.links.filter((l) => l.game_id === game && l.status === 'draft');
  const objected = new Map<string, { rule: string; note: string }[]>();
  for (const o of v.objections ?? []) {
    if (!links.some((l) => l.id === o.link)) throw new Error(`objection names "${o.link}", not a draft link of ${game}`);
    objected.set(o.link, [...(objected.get(o.link) ?? []), o]);
  }
  if (v.verdict === 'object' && !objected.size) throw new Error('verdict "object" needs at least one objection');
  const rows = csvRows(path);
  for (const l of links) {
    const os = objected.get(l.id);
    if (os) for (const o of os) rows.push({ link: l.id, run, verdict: 'object', rule: o.rule, note: o.note, row_hash: linkHash(l), date: today() });
    else rows.push({ link: l.id, run, verdict: 'pass', rule: '', note: '', row_hash: linkHash(l), date: today() });
  }
  writeCsv(path, FACTCHECK_COLS, rows);
  return { links: links.length, objections: objected.size };
}

// ---------- abandon ----------
/** A game the run couldn't finish: its staging goes, it lands on the backlog, the run moves on. */
export function abandon(game: string, reason: string, title = '', root = ROOT) {
  rmSync(new URL(`data/staging/${game}/`, root), { recursive: true, force: true });
  const rows = csvRows('review/backlog.csv');
  const old = rows.find((r) => r.game === game);
  if (old) { old.attempts = String(Number(old.attempts || 0) + 1); old.reason = reason; }
  else rows.push({ game, title, reason, attempts: '1', added: today() });
  writeCsv('review/backlog.csv', BACKLOG_COLS, rows);
}

// ---------- commit ----------
function git(args: string[]) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
/** Paths from `git status --porcelain -z` (a rename's entry is followed by its old path, which is skipped). */
export function changedPaths(z: string): string[] {
  const parts = z.split('\0').filter(Boolean), out: string[] = [];
  for (let i = 0; i < parts.length; i++) { const status = parts[i].slice(0, 2); out.push(parts[i].slice(3)); if (/[RC]/.test(status)) i++; }
  return out;
}
export function renderRun(run: string, events: Record<string, unknown>[]): string {
  const of = (step: string) => events.filter((e) => e.step === step);
  const lines = [`# Research run ${run}`, ''];
  for (const e of of('decisions')) lines.push(`- Queue decisions applied: ${e.applied}, not applied: ${e.failed}`);
  for (const e of of('backpressure')) lines.push(`- Open queue items: ${e.open} (${e.mode})`);
  for (const e of of('discover')) lines.push(`- New candidates: ${e.added}`);
  for (const e of of('pick')) lines.push(`- Picked: ${(e.games as string[]).join(', ') || 'none'}`);
  lines.push('', '| Game | Merged links | Auto-verified | Queued | Back to research | Tokens |', '| --- | --- | --- | --- | --- | --- |');
  const games = [...new Set(events.filter((e) => e.game).map((e) => String(e.game)))];
  for (const g of games) {
    const ev = events.filter((e) => e.game === g);
    const get = (step: string, k: string) => ev.filter((e) => e.step === step).map((e) => e[k]).join(' ') || '–';
    lines.push(`| ${g} | ${get('merge', 'links')} | ${get('gate', 'auto')} | ${get('gate', 'queued')} | ${get('gate', 'backlog')} | ${get('tokens', 'value')} |`);
  }
  for (const e of of('blocked')) lines.push(`- Blocked: ${e.value}`);
  for (const e of of('audit')) lines.push(`- Audit mode: ${e.value}`);
  for (const e of of('note')) lines.push(`- ${e.value}`);
  return lines.join('\n') + '\n';
}
export function commitRun(run: string) {
  if (!/^\d{4}-\d{2}-\d{2}-[\w-]+$/.test(run)) throw new Error('run id must look like 2026-11-07-0630');
  // -z: NUL-separated, unquoted paths; untrimmed, so each entry keeps its two status characters.
  const changed = changedPaths(execFileSync('git', ['status', '--porcelain', '-z', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8' }));
  const outside = changed.filter((p) => !DATA_PATHS.test(p));
  if (outside.length) throw new Error(`refusing to commit: a research run may only change data paths, not ${outside.join(', ')}`);
  if (!changed.length) return { branch: '', pushed: false, note: 'nothing to commit' };
  const events = existsSync(new URL(`review/runs/${run}.jsonl`, ROOT)) ? readFileSync(new URL(`review/runs/${run}.jsonl`, ROOT), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  writeFileSync(new URL(`review/runs/${run}.md`, ROOT), renderRun(run, events));
  const branch = `data/${run}`;
  git(['checkout', '-b', branch]);
  git(['add', '--', 'data', 'docs/research', 'docs/review', 'review']);
  git(['commit', '-m', `Research run ${run}\n\nSee review/runs/${run}.md.`]);
  try { git(['push', '-u', 'origin', branch]); return { branch, pushed: true }; }
  catch (e) { return { branch, pushed: false, note: `push failed: ${(e as Error).message.split('\n')[0]}` }; }
}

export function logEvent(run: string, e: Record<string, unknown>) {
  mkdirSync(new URL('review/runs/', ROOT), { recursive: true });
  appendFileSync(new URL(`review/runs/${run}.jsonl`, ROOT), JSON.stringify({ ...e, at: new Date().toISOString() }) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...args] = process.argv.slice(2);
  const run = process.env.RUN_ID ?? `${today()}-manual`;
  const q = new Queue(ROOT);
  const say = (o: unknown) => console.log(typeof o === 'string' ? o : JSON.stringify(o, null, 2));
  switch (cmd) {
    case 'apply-decisions': {
      const r = applyQueueDecisions(readTables(), q, run);
      writeTables(r.tables);
      q.save(r.remaining, r.resolved);
      if (r.audits.length) writeCsv('docs/review/audit-log.csv', AUDIT_COLS, [...csvRows('docs/review/audit-log.csv'), ...r.audits]);
      writeOwnerEvidence(r.resolved.filter((x) => x.kind === 'blocked-source' && (x.outcome.startsWith('confirmed') || x.outcome.startsWith('quote replaced'))));
      const failed = r.results.filter((x) => x.error);
      logEvent(run, { step: 'decisions', applied: r.results.length - failed.length, failed: failed.length });
      say(r.results);
      break;
    }
    case 'backpressure': {
      const open = q.open().length;
      const mode = open >= BACKPRESSURE ? 'discover-only' : 'research';
      logEvent(run, { step: 'backpressure', open, mode });
      say(`${mode} (${open} open, limit ${BACKPRESSURE})`);
      break;
    }
    case 'discover': {
      const { discoverRecent } = await import('./discover-recent.ts');
      const added = await discoverRecent();
      logEvent(run, { step: 'discover', added });
      say(`${added} new candidate(s) from recent releases. (The full snapshot refresh is npm run fetch:wikidata && npm run sync:wikidata, run weekly at most.)`);
      break;
    }
    case 'pick': {
      const n = Number(args[0] ?? 5);
      const picks = pick(readTables(), n, { backlog: csvRows('review/backlog.csv'), blocked: csvRows('review/blocked-sources.csv') });
      logEvent(run, { step: 'pick', games: picks.map((p) => p.id) });
      say(picks);
      break;
    }
    case 'merge-staging': {
      const game = args[0];
      const r = mergeGame(game, q, run);
      logEvent(run, { step: 'merge', game, links: r.linkIds.length, proposals: r.proposals.length, ok: r.ok });
      if (!r.ok) { console.error(`Not merged (staging kept):\n  ${r.errors.join('\n  ')}`); process.exit(1); }
      say({ merged: r.linkIds, proposals: r.proposals.length, blocked: r.blocked.length, notes: r.notes });
      break;
    }
    case 'record-factcheck': {
      const [game, file] = args;
      const r = recordFactcheck(readTables(), game, JSON.parse(readFileSync(file, 'utf8')) as Verdict, run);
      logEvent(run, { step: 'factcheck', game, ...r });
      say(r);
      break;
    }
    case 'abandon': { abandon(args[0], args.slice(1).join(' ') || 'no reason given'); logEvent(run, { step: 'abandon', game: args[0], value: args.slice(1).join(' ') }); say(`${args[0]}: abandoned, on the backlog`); break; }
    case 'log': { logEvent(args[0], { step: args[1], game: args[3], value: args[2] }); break; }
    case 'commit': say(commitRun(args[0] ?? run)); break;
    default: console.error('usage: see the header of scripts/pipeline.ts'); process.exit(1);
  }
}
