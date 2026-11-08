// Phase 6: the gate, the audit schedule, the queue builder, issue commands and rendering.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readTables, type LinkRow, type Tables } from '../scripts/lib/tables.ts';
import { apply, check, judge, frozen, type GateInputs } from '../scripts/gate.ts';
import { auditState, sample, upperBound, type AuditRow } from '../scripts/lib/audit.ts';
import { Queue, QUEUE_COLS, type QueueRow } from '../scripts/lib/queue.ts';
import { stale } from '../scripts/queue-build.ts';
import { applyCommands, newTicks, parseComment } from '../scripts/lib/commands.ts';
import { renderBody, MARKER } from '../scripts/review-issue.ts';
import { allowed, carry, commandsFrom } from '../scripts/review-decisions.ts';
import { linkHash, writeOwnerEvidence } from '../scripts/pipeline.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { evidenceKey } from '../scripts/lib/sources.ts';

const tables = readTables();
const T = () => structuredClone(tables);
const tmpQueue = () => { const d = mkdtempSync(join(tmpdir(), 'gate-')); mkdirSync(join(d, 'review')); return new Queue(pathToFileURL(d + '/')); };
// A clean, unflagged world link with a Wikipedia source and quote, made draft.
const candidate = (t: Tables): LinkRow => {
  const l = t.links.find((x) => x.status === 'verified' && x.role === 'world' && x.quote && !x.flags && (x.sources ?? '').split(' ').length === 1 && x.sources!.includes('wikipedia'))!;
  l.status = 'draft';
  t.grandfathered = t.grandfathered.filter((g) => g.link_id !== l.id);
  return l;
};
const inputs = (l: LinkRow, o: Partial<GateInputs> = {}): GateInputs => ({
  factcheck: [{ link: l.id, run: 'r1', verdict: 'pass', rule: '', note: '', row_hash: linkHash(l), date: '2026-11-08' }],
  blocked: [], evidence: () => true, ...o,
});
const audits = (n: number, wrong: number[] = [], batch = (i: number) => `b${Math.floor(i / 10)}`): AuditRow[] =>
  Array.from({ length: n }, (_, i) => ({ link: `l${i}`, batch: batch(i), date: '2026-11-08', result: wrong.includes(i) ? 'wrong' : 'correct', cause: '' }));

describe('gate', () => {
  it('passes a link that meets all five checks', () => {
    const t = T(), l = candidate(t);
    expect(judge(t, l, inputs(l))).toMatchObject({ outcome: 'pass', reasons: [] });
  });

  it('sends research-fixable failures back to research', () => {
    const t = T(), l = candidate(t);
    expect(judge(t, l, inputs(l, { evidence: () => false }))).toMatchObject({ outcome: 'research' });
    const noQuote = { ...l, quote: undefined, accessed: undefined };
    expect(judge(t, noQuote, inputs(noQuote)).reasons).toContain('no quote');
    const fan = { ...l, sources: 'https://www.mariowiki.com/X', confidence: 'low' };
    expect(judge(t, fan, inputs(fan)).reasons.join()).toMatch(/below medium[\s\S]*find a stronger source/);
  });

  it('sends judgment failures to a human', () => {
    const t = T(), l = candidate(t);
    const objected = inputs(l, { factcheck: [{ link: l.id, run: 'r1', verdict: 'object', rule: '4', note: 'year not stated', row_hash: linkHash(l), date: '' }] });
    expect(judge(t, l, objected)).toMatchObject({ outcome: 'human', reasons: ['fact-checker objects (rule 4): year not stated'] });
    const flagged = { ...l, flags: 'contested' };
    expect(judge(t, flagged, inputs(flagged)).outcome).toBe('human');
  });

  it('waits for a blocked source or a fact-check of the current row', () => {
    const t = T(), l = candidate(t);
    const url = l.sources!;
    expect(judge(t, l, inputs(l, { evidence: () => false, blocked: [{ url, ref: l.id }] })).reasons[0]).toMatch(/^source blocked/);
    expect(judge(t, l, inputs(l, { factcheck: [{ link: l.id, run: 'r1', verdict: 'pass', rule: '', note: '', row_hash: 'stale', date: '' }] })))
      .toMatchObject({ outcome: 'wait', reasons: ['not fact-checked in its current form'] });
  });

  it('a derived-time chain with an unstated interval needs a human; an exact chain passes', () => {
    const t = T();
    const hitman = t.links.find((x) => x.id === 'hitman-3/dubai')!; // 2019 onward: two unstated gaps
    expect(judge(t, hitman, inputs(hitman)).reasons).toContain('derived-time chain has a step with no stated interval');
    const cartagena = t.links.find((x) => x.id === 'uncharted-3/cartagena')!; // exactly 1992
    expect(judge(t, cartagena, inputs(cartagena)).reasons.join()).not.toMatch(/derived-time/);
  });

  it('apply moves drafts, queues needs-human and audits, leaves frozen links alone', () => {
    const t = T(), l = candidate(t), q = tmpQueue();
    const venue = t.links.find((x) => x.role === 'venue' && x.status === 'draft')!;
    expect(frozen(t, venue)).toBe(true);
    const r = apply(t, inputs(l), q, { run: 'r1', auditLog: [], backlog: [] });
    expect(r.auto).toContain(l.id);
    expect(l.status).toBe('auto-verified');
    expect(r.audits).toEqual(r.auto); // burn-in: every auto-verified link is audited
    expect(q.rows().filter((x) => x.kind === 'audit').map((x) => x.link)).toContain(l.id);
    expect(venue.status).toBe('draft');
    expect(check(t, inputs(l))).toEqual([]);
    l.note = 'changed'; // notes aren't judged
    expect(check(t, inputs(l))).toEqual([]);
    const moved = { ...inputs(l), factcheck: [] };
    expect(check(t, moved)[0]).toContain(`${l.id}: auto-verified but no longer passes`);
  });

  it('a game researched twice without passing goes to a human', () => {
    const t = T(), l = candidate(t), q = tmpQueue();
    l.quote = undefined; l.accessed = undefined;
    const r = apply(t, inputs(l), q, { game: l.game_id, run: 'r1', auditLog: [], backlog: [{ game: l.game_id, attempts: '2' }] });
    expect(r.human).toContain(l.id);
    expect(q.rows()[0].reason).toMatch(/^researched twice without passing/);
  });
});

describe('audit schedule', () => {
  it('upper bounds match Clopper–Pearson', () => {
    expect(upperBound(60, 0)).toBeCloseTo(0.0487, 3);
    expect(upperBound(60, 1)).toBeCloseTo(0.0766, 3);
    expect(upperBound(100, 0)).toBeCloseTo(0.0295, 3);
  });
  it('burn-in until 60 with at most one error, then normal; a reset restarts the count', () => {
    expect(auditState(audits(59)).mode).toBe('burn-in');
    expect(auditState(audits(60, [5])).mode).toBe('normal');
    expect(auditState(audits(60, [5, 9])).note).toMatch(/burn-in failed/);
    expect(auditState([...audits(60, [5, 9]), { link: '', batch: '', date: '', result: 'reset', cause: 'PR 30' }, ...audits(10)]).audited).toBe(10);
  });
  it('tightens on 3 errors in the last 50, relaxes after 5 clean batches, reduces after 100 correct', () => {
    const tight = audits(80, [65, 70, 75]);
    expect(auditState(tight).mode).toBe('tightened');
    expect(auditState([...tight, ...audits(50, [], (i) => `c${i % 5}`).map((r, i) => ({ ...r, batch: `c${Math.floor(i / 10)}` }))]).mode).toBe('normal');
    expect(auditState(audits(100)).mode).toBe('reduced');
    expect(auditState([...audits(100), ...audits(1, [0], () => 'z')]).mode).toBe('normal');
  });
  it('samples 10% (at least one), deterministically', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `l${i}`);
    expect(sample(ids, 'normal', 'run-1')).toHaveLength(3);
    expect(sample(ids, 'normal', 'run-1')).toEqual(sample(ids, 'normal', 'run-1'));
    expect(sample(['a'], 'reduced', 'x')).toEqual(['a']);
    expect(sample(ids, 'burn-in', 'x')).toHaveLength(25);
  });
});

describe('queue builder', () => {
  const row = (o: Partial<QueueRow>) => ({ ...Object.fromEntries(QUEUE_COLS.map((c) => [c, ''])), ...o }) as QueueRow;
  it('drops open rows whose reason is gone, never decided ones', () => {
    const t = T();
    expect(stale(t, row({ kind: 'needs-human', link: 'gta-vice-city/miami' }))).toBe(true); // verified now
    expect(stale(t, row({ kind: 'needs-human', link: 'gta-vice-city/miami', decision: 'approve' }))).toBe(false);
    expect(stale(t, row({ kind: 'change-to-verified', link: 'gta-vice-city/miami' }))).toBe(false);
    expect(stale(t, row({ kind: 'blocked-source', link: 'gta-vice-city/miami', source: 'u', quote: 'q' }), () => true)).toBe(true);
  });
});

describe('issue commands', () => {
  it('reads one command per line, tolerating phone quotes, and rejects garbage', () => {
    const { commands, errors } = parseComment('reject q4 wrong city\nedit q5 from=1986 note="Set in Miami"\nquote q6 “The sentence I found”\nskip q7\n> quoted reply\n\napprove Q8');
    expect(errors).toEqual([]);
    expect(commands).toEqual([
      { op: 'reject', id: 'q4', reason: 'wrong city' }, { op: 'edit', id: 'q5', assignments: 'from=1986 note="Set in Miami"' },
      { op: 'quote', id: 'q6', text: 'The sentence I found' }, { op: 'skip', id: 'q7' }, { op: 'approve', id: 'q8' }]);
    expect(parseComment('reject q4').errors[0]).toMatch(/needs a reason/);
    expect(parseComment('edit q4 status=verified').errors[0]).toMatch(/can't edit status/);
    expect(parseComment('please approve everything').errors[0]).toMatch(/not a command/);
  });
  it('finds newly ticked boxes', () => {
    expect(newTicks('- [ ] q1 · a\n- [x] q2 · b', '- [x] q1 · a\n- [x] q2 · b\n- [x] q3 · c')).toEqual(['q1', 'q3']);
  });
  it('the first decision wins, quote only for blocked sources', () => {
    const rows = [{ id: 'q1', kind: 'needs-human', decision: '' }, { id: 'q2', kind: 'audit', decision: 'approve', decision_note: '' }, { id: 'q3', kind: 'blocked-source', decision: '' }] as QueueRow[];
    const o = applyCommands(rows, [{ op: 'reject', id: 'q1', reason: 'no' }, { op: 'skip', id: 'q2' }, { op: 'quote', id: 'q1', text: 'x' }, { op: 'quote', id: 'q3', text: 'He said "hi"' }, { op: 'approve', id: 'q9' }]);
    expect(o.applied).toEqual(['q1: reject (no)', 'q3: quote stored as evidence']);
    expect(o.conflicts).toEqual(['q2: already decided (approve); the first decision stands', 'q1: already decided (reject: no); the first decision stands']);
    expect(o.errors).toEqual(['q9: no such item in the queue']);
    const kindCheck = applyCommands([{ id: 'q5', kind: 'audit', decision: '' }] as QueueRow[], [{ op: 'quote', id: 'q5', text: 'x' }]);
    expect(kindCheck.errors).toEqual(['q5: quote is for blocked sources; this item is audit']);
    expect(rows[2].decision_note).toBe('quote="He said \\"hi\\""');
  });
});

describe('pinned issue', () => {
  const issue = (body: string, labels = ['review-queue']) => ({ number: 1, body, labels: labels.map((name) => ({ name })) });
  it('acts only on the pinned issue, only for the owner, never for bots', () => {
    const body = `${MARKER}\n- [x] q1`;
    expect(allowed({ issue: issue(body), sender: { login: 'justice627', type: 'User' } }, 'issues')).toBe(true);
    expect(allowed({ issue: issue(body), sender: { login: 'someone-else', type: 'User' } }, 'issues')).toBe(false);
    expect(allowed({ issue: issue(body), comment: { user: { login: 'justice627', type: 'Bot' } } }, 'issue_comment')).toBe(false);
    expect(allowed({ issue: issue(body, ['bug']), sender: { login: 'justice627', type: 'User' } }, 'issues')).toBe(false);
    expect(allowed({ issue: issue('no marker'), sender: { login: 'justice627', type: 'User' } }, 'issues')).toBe(false);
    expect(allowed({ issue: { ...issue(body), pull_request: {} }, sender: { login: 'justice627', type: 'User' } }, 'issues')).toBe(false);
  });
  it('turns body edits into approvals and ignores title edits', () => {
    expect(commandsFrom({ action: 'edited', issue: issue('- [x] q1'), changes: { body: { from: '- [ ] q1' } } }, 'issues').commands).toEqual([{ op: 'approve', id: 'q1' }]);
    expect(commandsFrom({ action: 'edited', issue: issue('- [x] q1'), changes: {} }, 'issues').commands).toEqual([]);
  });
  it('carries decisions waiting in the open PR onto open rows only', () => {
    const rows = [{ id: 'q1', decision: '' }, { id: 'q2', decision: 'skip' }] as QueueRow[];
    carry(rows, [{ id: 'q1', decision: 'approve', decision_note: '' }, { id: 'q2', decision: 'reject', decision_note: 'x' }] as QueueRow[]);
    expect(rows.map((r) => r.decision)).toEqual(['approve', 'skip']);
  });
  it('renders the next 15 open items with counts, audit mode and the error bound', () => {
    const rows = Array.from({ length: 17 }, (_, i) => ({ ...Object.fromEntries(QUEUE_COLS.map((c) => [c, ''])), id: `q${i + 1}`, kind: i === 16 ? 'change-to-verified' : 'needs-human', priority: i === 16 ? '1' : '3', game: 'g', claim: 'c', what_i_need_to_do: 'w' })) as QueueRow[];
    rows[3].decision = 'approve';
    const body = renderBody(rows, auditState([]));
    expect(body).toContain('**16 open** (change-to-verified 1 · audit 0 · needs-human 15 · blocked-source 0) · 1 decided');
    expect(body).toMatch(/Audit mode: \*\*burn-in\*\*/);
    expect([...body.matchAll(/^- \[ \] (q\d+)/gm)].map((m) => m[1])).toEqual(['q17', 'q1', 'q2', 'q3', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12', 'q13', 'q14', 'q15']);
  });
});

describe('blocked sources confirmed by hand', () => {
  it('store the owner\'s confirmation or pasted text as evidence', () => {
    const dir = pathToFileURL(mkdtempSync(join(tmpdir(), 'ev-')) + '/');
    writeOwnerEvidence([
      { id: 'q1', source: 'https://www.pokemon.com/x', quote: 'two years after', decision_note: '', outcome: 'confirmed by hand' },
      { id: 'q2', source: 'https://www.ign.com/y', quote: 'old quote', decision_note: 'quote="The new sentence"', outcome: 'quote replaced by the text found by hand' },
    ], dir);
    const a = JSON.parse(readFileSync(new URL(`${evidenceKey('https://www.pokemon.com/x', 'two years after')}.json`, dir), 'utf8'));
    expect(a).toMatchObject({ method: 'owner (justice627, review q1)', context: 'Confirmed on the page by the owner in review q1.' });
    const b = JSON.parse(readFileSync(new URL(`${evidenceKey('https://www.ign.com/y', 'The new sentence')}.json`, dir), 'utf8'));
    expect(b).toMatchObject({ quote: 'The new sentence', context: 'The new sentence' });
    expect(readdirSync(dir)).toHaveLength(2);
  });
});
