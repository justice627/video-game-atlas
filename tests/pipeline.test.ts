// Phase 5: queue decisions, backpressure, picking, staging merges, fact-check records, agent guard.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readTables, TABLES, type Tables } from '../scripts/lib/tables.ts';
import { validate } from '../scripts/lib/dataset.ts';
import { applyDecisions, parseAssignments, Queue, QUEUE_COLS, type QueueRow } from '../scripts/lib/queue.ts';
import { mergeStaging, readStaging } from '../scripts/lib/staging.ts';
import { applyQueueDecisions, DATA_PATHS, linkHash, pick, recordFactcheck, renderRun } from '../scripts/pipeline.ts';
import { guard } from '../scripts/hooks/guard-agent.ts';
import { toCsv } from '../scripts/lib/csv.ts';
import { spawnSync } from 'node:child_process';

const tables = readTables();
const T = () => structuredClone(tables);
const tmpRoot = () => { const d = mkdtempSync(join(tmpdir(), 'pipe-')); mkdirSync(join(d, 'review')); return pathToFileURL(d + '/'); };
const row = (o: Partial<QueueRow>): QueueRow => ({ ...Object.fromEntries(QUEUE_COLS.map((c) => [c, ''])), id: 'q1', priority: '3', kind: 'needs-human', ...o } as QueueRow);
const draftWithQuote = () => tables.links.find((l) => l.status === 'draft' && l.quote && !l.flags && l.role !== 'venue')!;
const noAudit = { audit: () => {} };

describe('queue', () => {
  it('parses field=value edits, quoted or not, and rejects anything else', () => {
    expect(parseAssignments('from=1986 note="Set in Miami, \\"Vice City\\""')).toEqual([['from', '1986'], ['note', 'Set in Miami, "Vice City"']]);
    expect(() => parseAssignments('from 1986')).toThrow(/field=value/);
  });

  it('never reuses an id and does not duplicate an open row', () => {
    const q = new Queue(tmpRoot());
    const a = q.add({ kind: 'needs-human', link: 'x/y', game: 'x', place: 'y', claim: '', source: 's', quote: '', reason: '', proposed: '', what_i_need_to_do: '' });
    expect(q.add({ kind: 'needs-human', link: 'x/y', game: 'x', place: 'y', claim: '', source: 's', quote: '', reason: '', proposed: '', what_i_need_to_do: '' })).toBeUndefined();
    q.save([]);
    const b = q.add({ kind: 'audit', link: 'x/y', game: 'x', place: 'y', claim: '', source: 's', quote: '', reason: '', proposed: '', what_i_need_to_do: '' });
    expect([a?.id, b?.id]).toEqual(['q1', 'q2']);
  });

  it('applies approve, reject, edit and skip', () => {
    const t = T(), d = draftWithQuote();
    const id = d.id;
    const r = applyDecisions(t, [
      row({ id: 'q1', link: id, decision: 'approve' }),
    ], noAudit);
    expect(r.results[0].outcome).toBe('verified');
    expect(t.links.find((l) => l.id === id)!.status).toBe('verified');

    const t2 = T();
    applyDecisions(t2, [row({ link: id, decision: 'reject', decision_note: 'wrong city' })], noAudit);
    expect(t2.links.find((l) => l.id === id)).toMatchObject({ status: 'excluded' });
    expect(t2.links.find((l) => l.id === id)!.note).toContain('Rejected in review (q1): wrong city');

    const t3 = T();
    applyDecisions(t3, [row({ link: id, decision: 'edit', decision_note: 'confidence=low' })], noAudit);
    expect(t3.links.find((l) => l.id === id)).toMatchObject({ status: 'draft', confidence: 'low' });

    const s = applyDecisions(T(), [row({ id: 'q1', link: id, decision: 'skip' }), row({ id: 'q2', link: id })], noAudit);
    expect(s.remaining.map((x) => [x.id, x.decision])).toEqual([['q2', ''], ['q1', '']]);
  });

  it('a change to a verified link applies only on approve', () => {
    const t = T();
    const v = t.links.find((l) => l.id === 'gta-vice-city/miami')!;
    applyDecisions(t, [row({ kind: 'change-to-verified', link: v.id, proposed: 'note="New note"', decision: 'reject' })], noAudit);
    expect(v.note).not.toBe('New note');
    applyDecisions(t, [row({ kind: 'change-to-verified', link: v.id, proposed: 'note="New note"', decision: 'approve' })], noAudit);
    expect(v.note).toBe('New note');
    expect(v.status).toBe('verified');
  });

  it('a decision that would make the data invalid is not applied, and the row stays', () => {
    const q = new Queue(tmpRoot());
    const d = tables.links.find((l) => l.status === 'draft' && !l.quote)!;
    q.save([row({ link: d.id, decision: 'approve' }), row({ id: 'q2', link: 'nope/none', decision: 'approve' })]);
    const r = applyQueueDecisions(T(), q);
    expect(r.results.map((x) => x.outcome)).toEqual(['not applied', 'not applied']);
    expect(r.results[0].error).toContain('verified links need a quote');
    expect(r.remaining).toHaveLength(2);
    expect(r.tables.links.find((l) => l.id === d.id)!.status).toBe('draft');
  });
});

describe('pick', () => {
  it('takes queue-in first, then the backlog, then the best leads; skips frozen and researched games', () => {
    const t = T();
    t.queueIn = [{ title: 'Kingdom Come: Deliverance', wikidata: 'Q15408545' }];
    const p = pick(t, 4, { backlog: [{ game: 'hitman-2', title: 'Hitman 2', reason: 'no quote', attempts: '1' }, { game: 'x', title: 'X', reason: 'r', attempts: '2' }] });
    expect(p[0]).toMatchObject({ title: 'Kingdom Come: Deliverance', why: 'queue-in' });
    expect(p[1]).toMatchObject({ id: 'hitman-2' });
    expect(p.some((x) => x.id === 'x')).toBe(false); // two failed attempts: left for the owner
    const researched = new Set(t.links.map((l) => l.game_id));
    const sports = new Set(t.candidates.filter((c) => /sports-as-setting/.test(c.flags ?? '')).map((c) => c.id));
    for (const x of pick(t, 50)) { expect(researched.has(x.id)).toBe(false); expect(sports.has(x.id)).toBe(false); }
  });
});

describe('staging merge', () => {
  const stage = (files: Record<string, Record<string, unknown>[]>, blocked?: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'stage-'));
    for (const [key, rows] of Object.entries(files)) {
      const def = TABLES.find((d) => d.key === key)!;
      writeFileSync(join(dir, def.file), toCsv(def.cols.map((c) => c.key), rows));
    }
    if (blocked) writeFileSync(join(dir, 'blocked.csv'), `url,what_to_find\n${blocked}\n`);
    return readStaging(pathToFileURL(dir + '/'));
  };
  const game = { id: 'test-game', title: 'Test Game', release_year: 2020 };
  const link = (o: Record<string, unknown> = {}) => ({ game_id: 'test-game', place_id: 'miami', role: 'world', depiction: 'real', time_type: 'fixed', from: 1986, to: 1986,
    sources: 'https://en.wikipedia.org/wiki/Test', quote: 'Set in Miami in 1986', accessed: '2026-11-06', confidence: 'medium', status: 'draft', ...o });

  it('merges a clean game as draft with a fresh id, and records blocked sources', () => {
    const r = mergeStaging(T(), 'test-game', stage({ games: [game], links: [link()] }, 'https://www.ign.com/x,the level list'));
    expect(r.errors).toEqual([]);
    expect(r.linkIds).toEqual(['test-game/miami']);
    expect(r.tables.links.find((l) => l.id === 'test-game/miami')!.status).toBe('draft');
    expect(r.blocked).toEqual([{ url: 'https://www.ign.com/x', what_to_find: 'the level list' }]);
  });

  it('refuses other games, statuses above draft, and invalid rows', () => {
    const r = mergeStaging(T(), 'test-game', stage({ games: [game], links: [link({ game_id: 'gta-vice-city' }), link({ status: 'verified' })] }));
    expect(r.ok).toBe(false);
    const e = r.errors.join('\n');
    expect(e).toContain('a run may only touch its own game');
    expect(e).toContain('research only writes draft');
    // Rule checks run on the merged tables and name the staging row.
    const v = mergeStaging(T(), 'test-game', stage({ games: [game], links: [link({ role: 'arena' })] }));
    expect(v.errors.join('\n')).toMatch(/Links row 2 of staging\/test-game\/links.csv: role "arena" must be one of/);
  });

  it('never changes a verified link: a difference becomes a proposal', () => {
    const t = T();
    const v = t.links.find((l) => l.id === 'gta-vice-city/miami')!;
    const r = mergeStaging(t, 'gta-vice-city', stage({ games: [{ id: 'gta-vice-city', title: "Grand Theft Auto: Vice City" }], links: [{ ...v, status: 'draft', note: 'Different note' }] }));
    expect(r.ok).toBe(true);
    expect(r.tables.links.find((l) => l.id === v.id)!.note).toBe(v.note);
    expect(r.proposals).toEqual([expect.objectContaining({ link: v.id, proposed: 'note="Different note"' })]);
  });

  it('reuses an existing place by Wikidata id', () => {
    const miami = tables.places.find((p) => p.id === 'miami')!;
    const r = mergeStaging(T(), 'test-game', stage({ games: [game], places: [{ ...miami, id: 'miami-fl' }], links: [link({ place_id: 'miami-fl' })] }));
    expect(r.ok).toBe(true);
    expect(r.tables.links.find((l) => l.game_id === 'test-game')!.place_id).toBe('miami');
    expect(r.tables.places.some((p) => p.id === 'miami-fl')).toBe(false);
  });
});

describe('fact-check records', () => {
  it('stores a verdict per draft link with a hash of what was judged', () => {
    const d = draftWithQuote();
    const root = tmpRoot();
    const path = new URL('review/factcheck.csv', root).pathname;
    const r = recordFactcheck(T(), d.game_id, { verdict: 'object', objections: [{ link: d.id, rule: '4', note: 'year not in quote' }] }, 'run1', path);
    expect(r.objections).toBe(1);
    const text = readFileSync(path, 'utf8');
    expect(text).toContain(`${d.id},run1,object,4,year not in quote,${linkHash(d)}`);
    expect(() => recordFactcheck(T(), d.game_id, { verdict: 'object' }, 'run1', path)).toThrow(/at least one objection/);
    expect(() => recordFactcheck(T(), d.game_id, { verdict: 'pass', objections: [{ link: 'gta-vice-city/miami', rule: '', note: '' }] }, 'run1', path)).toThrow(/not a draft link/);
    expect(linkHash({ ...d, quote: 'other' })).not.toBe(linkHash(d));
  });
});

describe('agent guard', () => {
  const root = '/repo';
  const call = (agent: string, tool: string, path: string) => guard({ tool_name: tool, tool_input: { file_path: path } }, agent, root);
  it('keeps the researcher to staging and research reports, without a shell', () => {
    expect(call('researcher', 'Write', '/repo/data/staging/hitman-2/links.csv')).toBeNull();
    expect(call('researcher', 'Write', '/repo/docs/research/hitman.md')).toBeNull();
    expect(call('researcher', 'Edit', '/repo/data/links.csv')).toMatch(/only write under/);
    expect(call('researcher', 'Write', '/repo/data/staging/../links.csv')).toMatch(/only write under/);
    expect(call('researcher', 'Bash', '')).toMatch(/no shell/);
    expect(call('researcher', 'Read', '/repo/data/links.csv')).toBeNull();
  });
  it('keeps the fact-checker read-only and away from the research', () => {
    expect(call('fact-checker', 'Read', '/repo/data/links.csv')).toBeNull();
    expect(call('fact-checker', 'Read', '/repo/docs/research/hitman.md')).toMatch(/off limits/);
    expect(call('fact-checker', 'Grep', '/repo/data/staging/x')).toMatch(/off limits/);
    expect(call('fact-checker', 'Write', '/repo/data/x.csv')).toMatch(/read-only/);
  });
  it('lets every other agent through', () => expect(call('', 'Write', '/repo/src/main.ts')).toBeNull());
  it('the shell wrapper blocks by agent_type when no agent is named (project settings layer)', () => {
    const repo = new URL('../', import.meta.url).pathname;
    const run = (input: object, ...args: string[]) => spawnSync('bash', [join(repo, 'scripts/hooks/guard-agent.sh'), ...args], { input: JSON.stringify(input), env: { ...process.env, CLAUDE_PROJECT_DIR: repo }, encoding: 'utf8' });
    const write = (agent?: string) => ({ ...(agent ? { agent_type: agent } : {}), tool_name: 'Write', tool_input: { file_path: join(repo, 'data/links.csv') } });
    expect(run(write('researcher')).status).toBe(2);
    expect(run(write()).status).toBe(0);
    expect(run(write(), 'researcher').status).toBe(2);
  });
});

describe('run summary and data paths', () => {
  it('data commits may touch only data paths', () => {
    expect(['data/links.csv', 'review/queue.csv', 'docs/research/x.md', 'docs/review/audit-log.csv'].every((p) => DATA_PATHS.test(p))).toBe(true);
    expect(['src/main.ts', 'docs/data-rules.md', '.github/workflows/ci.yml', 'scripts/pipeline.ts'].some((p) => DATA_PATHS.test(p))).toBe(false);
  });
  it('renders the run log', () => {
    const md = renderRun('2026-11-07-0630', [{ step: 'pick', games: ['a'] }, { step: 'merge', game: 'a', links: 3 }, { step: 'tokens', game: 'a', value: '41000' }]);
    expect(md).toContain('| a | 3 | – | – | – | 41000 |');
  });
});

void validate;
