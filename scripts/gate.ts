// The auto-verify gate (docs/plans/pipeline.md, "Auto-verify gate"). A draft link becomes
// auto-verified only when all five checks pass:
//   1. validate() passes;
//   2. every source has a quote, and evidence that the quote is on that page;
//   3. the best source is medium or better in data/sources.csv (low confidence only via a
//      deterministic inferred-time rule);
//   4. the fact-checker passed this exact row (verdict hash matches);
//   5. no contested, real-world-model or needs-review flag, and no derived-time chain with an
//      unstated interval. An undated link may ship; needs-time sends its game back to research.
// Failures research can fix go to the backlog; failures that need judgment go to needs-human and
// the review queue; links waiting on a blocked source or a fact-check stay draft.
//
//   npm run gate -- --check                     CI: every auto-verified link still passes
//   npm run gate -- --apply [--game <id>]       research runs: move drafts on
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseCsv, toCsv } from './lib/csv.ts';
import { quotesOf, validate } from './lib/dataset.ts';
import { resolve as resolveChains } from './lib/chronology.ts';
import { auditState, sample, type AuditRow } from './lib/audit.ts';
import { Queue, describeLink } from './lib/queue.ts';
import { bankFor } from './lib/sources.ts';
import { readTables, writeTables, type LinkRow, type Tables } from './lib/tables.ts';
import { hasEvidence } from './verify-sources.ts';
import { linkHash, logEvent, ROOT, BACKLOG_COLS } from './pipeline.ts';

export type Outcome = 'pass' | 'research' | 'human' | 'wait';
export interface Verdict { link: LinkRow; outcome: Outcome; reasons: string[]; needsTime: boolean }
const RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };
const JUDGMENT_FLAGS = ['contested', 'real-world-model', 'needs-review'];

export interface GateInputs {
  factcheck: Record<string, string>[];
  blocked: Record<string, string>[];
  evidence: (url: string, quote: string) => boolean;
}

export function loadInputs(root = ROOT): GateInputs {
  const rows = (p: string) => { const f = new URL(p, root); if (!existsSync(f)) return []; const [h, ...r] = parseCsv(readFileSync(f, 'utf8')); return r.filter((x) => x.some(Boolean)).map((x) => Object.fromEntries(h.map((k, i) => [k, x[i] ?? '']))); };
  return { factcheck: rows('review/factcheck.csv'), blocked: rows('review/blocked-sources.csv'), evidence: (url, quote) => hasEvidence({ url, quote, ref: '', status: '', grandfathered: false }) };
}

export function judge(t: Tables, l: LinkRow, inp: GateInputs, chron = resolveChains(t)): Verdict {
  const research: string[] = [], human: string[] = [], wait: string[] = [];
  const flags = (l.flags ?? '').split(/\s+/).filter(Boolean);
  const urls = (l.sources ?? '').split(/\s+/).filter(Boolean);
  // 2. Quotes and evidence.
  if (!l.quote) research.push('no quote');
  else quotesOf(l.quote).forEach((q, i) => {
    const url = urls[i];
    if (!url || inp.evidence(url, q)) return;
    const blocked = inp.blocked.some((b) => b.url === url && (b.ref === l.id || b.ref === l.game_id));
    (blocked ? wait : research).push(blocked ? `source blocked: ${url}` : `quote not found in ${url}: "${q.slice(0, 80)}"`);
  });
  // 3. Source tier and confidence.
  const best = Math.max(-1, ...urls.map((u) => RANK[bankFor(u, t.sources)?.tier ?? ''] ?? -1));
  if (best < RANK.medium) research.push('best source is below medium (data/sources.csv); find Wikipedia, press or official material');
  if (l.confidence === 'low' && !flags.includes('inferred-time')) research.push('confidence low without a deterministic dating rule: find a stronger source');
  // 4. Fact-check of this exact row.
  const hash = linkHash(l);
  const mine = inp.factcheck.filter((f) => f.link === l.id && f.row_hash === hash);
  const lastRun = mine.length ? mine[mine.length - 1].run : undefined;
  const latest = mine.filter((f) => f.run === lastRun);
  if (!latest.length) wait.push('not fact-checked in its current form');
  for (const o of latest.filter((f) => f.verdict === 'object')) human.push(`fact-checker objects (rule ${o.rule}): ${o.note}`);
  // 5. Flags and chains.
  for (const f of JUDGMENT_FLAGS) if (flags.includes(f)) human.push(`flag ${f} needs a human`);
  if (flags.includes('derived-time')) {
    const s = chron.reached(l.id) ? chron.span(l.id) : undefined;
    if (!s) research.push('derived-time without a chronology chain to a dated anchor');
    else if (!Number.isFinite(s.lo) || !Number.isFinite(s.hi)) human.push('derived-time chain has a step with no stated interval');
  }
  const outcome: Outcome = human.length ? 'human' : research.length ? 'research' : wait.length ? 'wait' : 'pass';
  return { link: l, outcome, reasons: [...human, ...research, ...wait], needsTime: flags.includes('needs-time') };
}

export function frozen(t: Tables, l: LinkRow): boolean {
  const roles = new Set(t.freeze.filter((f) => f.kind === 'role').map((f) => f.value));
  const series = new Set(t.freeze.filter((f) => f.kind === 'series').map((f) => f.value));
  const g = t.games.find((x) => x.id === l.game_id);
  return roles.has(l.role) || (!!g?.series_id && series.has(g.series_id));
}

/** CI: every auto-verified link must still pass (its fact-check verdict must match its current row). */
export function check(t: Tables, inp: GateInputs): string[] {
  const chron = resolveChains(t);
  return t.links.filter((l) => l.status === 'auto-verified').flatMap((l) => {
    const v = judge(t, l, inp, chron);
    return v.outcome === 'pass' ? [] : [`${l.id}: auto-verified but no longer passes the gate: ${v.reasons.join('; ')}`];
  });
}

/** A backlog entry: `attempt` counts toward the two-attempt limit; a missing fact-check doesn't. */
export interface ApplyResult { auto: string[]; human: string[]; research: string[]; wait: string[]; audits: string[]; backlogGames: Map<string, { reason: string; attempt: boolean }> }

export function apply(t: Tables, inp: GateInputs, q: Queue, opts: { game?: string; run: string; auditLog: AuditRow[]; backlog: Record<string, string>[] }): ApplyResult {
  const errs = validate(t);
  if (errs.length) throw new Error(`gate check 1 failed, nothing moved: validate() reports ${errs.length} problem(s), first: ${errs[0]}`);
  const chron = resolveChains(t);
  const r: ApplyResult = { auto: [], human: [], research: [], wait: [], audits: [], backlogGames: new Map() };
  const attempts = (game: string) => Number(opts.backlog.find((b) => b.game === game)?.attempts ?? 0);
  for (const l of t.links.filter((x) => x.status === 'draft' && (!opts.game || x.game_id === opts.game) && !frozen(t, x))) {
    const v = judge(t, l, inp, chron);
    if (v.outcome === 'research' && attempts(l.game_id) >= 2) { v.outcome = 'human'; v.reasons.unshift('researched twice without passing the gate'); }
    if (v.outcome === 'pass') {
      l.status = 'auto-verified'; r.auto.push(l.id);
      if (v.needsTime && !r.backlogGames.has(l.game_id)) r.backlogGames.set(l.game_id, { reason: 'needs-time: no sourced year yet', attempt: false });
    } else if (v.outcome === 'human') {
      l.status = 'needs-human'; r.human.push(l.id);
      q.add({ kind: 'needs-human', link: l.id, game: l.game_id, place: l.place_id, claim: describeLink(t, l), source: (l.sources ?? '').split(/\s+/)[0] ?? '', quote: quotesOf(l.quote)[0] ?? '', reason: v.reasons.join('; '), proposed: '',
        what_i_need_to_do: 'Check the claim against its source. Approve if it is right, reject with the reason if not, or edit the fields that are wrong.' });
    } else if (v.outcome === 'research') {
      r.research.push(l.id);
      // Only a run that just researched this game (--game) counts as an attempt; a sweep over old drafts doesn't.
      r.backlogGames.set(l.game_id, { reason: v.reasons.join('; '), attempt: !!opts.game });
    } else {
      r.wait.push(l.id);
      // A sweep over all drafts (no --game) sends unchecked ones back so a run fact-checks them.
      if (!opts.game && v.reasons.every((x) => x.startsWith('not fact-checked')) && !r.backlogGames.has(l.game_id))
        r.backlogGames.set(l.game_id, { reason: 'needs a fact-check', attempt: false });
    }
  }
  // Audits of this batch's auto-verified links.
  const state = auditState(opts.auditLog);
  for (const id of sample(r.auto, state.mode, opts.run)) {
    const l = t.links.find((x) => x.id === id)!;
    q.add({ kind: 'audit', link: id, game: l.game_id, place: l.place_id, claim: describeLink(t, l), source: (l.sources ?? '').split(/\s+/)[0] ?? '', quote: quotesOf(l.quote)[0] ?? '', reason: `audit (${state.mode}): this link passed the gate on its own`, proposed: '',
      what_i_need_to_do: 'Is it true and supported by its quote? Approve = correct. Reject = wrong, with the reason (the link comes off the map). Incomplete is not wrong.' });
    r.audits.push(id);
  }
  return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const t = readTables(), inp = loadInputs();
  const rows = (p: string) => { const f = new URL(p, ROOT); if (!existsSync(f)) return []; const [h, ...r] = parseCsv(readFileSync(f, 'utf8')); return r.filter((x) => x.some(Boolean)).map((x) => Object.fromEntries(h.map((k, i) => [k, x[i] ?? '']))); };
  const auditLog = rows('docs/review/audit-log.csv') as unknown as AuditRow[];
  const state = auditState(auditLog);
  const audit = `audit mode ${state.mode} (${state.note}); ${state.audited} audited, ${state.errors} wrong; 95% upper bound on the error rate ${(state.upper95 * 100).toFixed(1)}%`;
  if (args.includes('--check')) {
    const errs = check(t, inp);
    console.log(`gate --check: ${t.links.filter((l) => l.status === 'auto-verified').length} auto-verified link(s); ${audit}`);
    for (const e of errs) console.error(`  ${e}`);
    if (errs.length) process.exit(1);
  } else if (args.includes('--apply')) {
    const game = args[args.indexOf('--game') + 1] && args.includes('--game') ? args[args.indexOf('--game') + 1] : undefined;
    const run = process.env.RUN_ID ?? `${new Date().toISOString().slice(0, 10)}-manual`;
    const backlog = rows('review/backlog.csv');
    const r = apply(t, inp, new Queue(ROOT), { game, run, auditLog, backlog });
    writeTables(t);
    for (const [g, { reason, attempt }] of r.backlogGames) {
      const old = backlog.find((b) => b.game === g);
      if (old) { old.attempts = String(Number(old.attempts || 0) + (attempt ? 1 : 0)); old.reason = reason; }
      else backlog.push({ game: g, title: t.games.find((x) => x.id === g)?.title ?? '', reason, attempts: attempt ? '1' : '0', added: new Date().toISOString().slice(0, 10) });
    }
    writeFileSync(new URL('review/backlog.csv', ROOT), toCsv(BACKLOG_COLS, backlog));
    for (const g of new Set([...r.auto, ...r.human, ...r.research].map((id) => id.split('/')[0])))
      logEvent(run, { step: 'gate', game: g, auto: r.auto.filter((x) => x.startsWith(`${g}/`)).length, queued: r.human.filter((x) => x.startsWith(`${g}/`)).length, backlog: r.research.filter((x) => x.startsWith(`${g}/`)).length });
    logEvent(run, { step: 'audit', value: audit });
    console.log(`gate --apply${game ? ` ${game}` : ''}: ${r.auto.length} auto-verified, ${r.human.length} to needs-human, ${r.research.length} back to research, ${r.wait.length} waiting (blocked source or no fact-check yet), ${r.audits.length} audit(s) queued; ${audit}`);
  } else { console.error('usage: npm run gate -- --check | --apply [--game <id>]'); process.exit(1); }
}
