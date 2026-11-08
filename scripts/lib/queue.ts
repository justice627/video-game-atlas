// The review queue (docs/plans/pipeline.md, section 4.5): review/queue.csv holds everything waiting
// on the owner; decided rows are applied by scripts/pipeline.ts apply-decisions and move to
// review/resolved.csv. Ids (q1, q2, …) come from review/next-id.txt and are never reused.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseCsv, toCsv } from './csv.ts';
import type { LinkRow, Tables } from './tables.ts';

export const QUEUE_COLS = ['id', 'kind', 'priority', 'link', 'game', 'place', 'claim', 'source', 'quote', 'reason', 'proposed',
  'what_i_need_to_do', 'decision', 'decision_note', 'added'] as const;
export const RESOLVED_COLS = [...QUEUE_COLS, 'resolved', 'outcome'] as const;
export type QueueRow = Record<(typeof QUEUE_COLS)[number], string>;
export type ResolvedRow = QueueRow & { resolved: string; outcome: string };
/** In priority order (brief): changes to verified links first, blocked sources last. */
export const KINDS = ['change-to-verified', 'audit', 'needs-human', 'blocked-source'] as const;
export const DECISIONS = ['approve', 'reject', 'edit', 'skip'] as const;
/** Research stops picking new games while this many items are open. */
export const BACKPRESSURE = 40;
/** Link fields an `edit` decision may set. Status follows from the decision, never from the note. */
export const EDITABLE = ['place_id', 'role', 'depiction', 'fictional_name', 'name_in_game', 'time_type', 'from', 'to', 'era_id',
  'sources', 'quote', 'accessed', 'confidence', 'flags', 'note'] as const;

export class Queue {
  constructor(public root: URL) {}
  private file = (n: string) => new URL(`review/${n}`, this.root);
  private read<T>(name: string, cols: readonly string[]): T[] {
    if (!existsSync(this.file(name))) return [];
    const [h, ...rows] = parseCsv(readFileSync(this.file(name), 'utf8'));
    return rows.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(cols.map((c) => [c, r[h.indexOf(c)] ?? ''])) as T);
  }
  rows(): QueueRow[] { return this.read<QueueRow>('queue.csv', QUEUE_COLS); }
  resolved(): ResolvedRow[] { return this.read<ResolvedRow>('resolved.csv', RESOLVED_COLS); }
  save(rows: QueueRow[], resolved?: ResolvedRow[]) {
    mkdirSync(this.file(''), { recursive: true });
    writeFileSync(this.file('queue.csv'), toCsv([...QUEUE_COLS], rows));
    if (resolved) writeFileSync(this.file('resolved.csv'), toCsv([...RESOLVED_COLS], resolved));
  }
  /** Next unused id. The counter only grows, so ids are never reused. */
  nextId(): string {
    const f = this.file('next-id.txt');
    const n = existsSync(f) ? Number(readFileSync(f, 'utf8').trim()) || 1 : 1;
    writeFileSync(f, `${n + 1}\n`);
    return `q${n}`;
  }
  open(): QueueRow[] { return this.rows().filter((r) => !r.decision); }
  /** Adds a row unless an open row of the same kind already covers the same link and source. */
  add(r: Omit<QueueRow, 'id' | 'decision' | 'decision_note' | 'added' | 'priority'> & Partial<QueueRow>): QueueRow | undefined {
    const rows = this.rows();
    if (rows.some((x) => x.kind === r.kind && x.link === r.link && x.source === (r.source ?? '') && !x.decision)) return undefined;
    const row = { ...Object.fromEntries(QUEUE_COLS.map((c) => [c, ''])), ...r, id: this.nextId(), priority: String(KINDS.indexOf(r.kind as never) + 1),
      added: new Date().toISOString().slice(0, 10) } as QueueRow;
    this.save([...rows, row]);
    return row;
  }
}

/** Sorts by kind priority, keeping each kind's order (skip moves a row to the end of its kind). */
export const byPriority = (rows: QueueRow[]) => rows.map((r, i) => ({ r, i })).sort((a, b) => Number(a.r.priority) - Number(b.r.priority) || a.i - b.i).map((x) => x.r);

/** `field=value field2="a value with spaces"` → pairs. Throws on anything else. */
export function parseAssignments(s: string): [string, string][] {
  const out: [string, string][] = [];
  const re = /\s*([a-z_]+)=("((?:[^"\\]|\\.)*)"|[^\s"]+)\s*/gy;
  let m: RegExpExecArray | null, at = 0;
  while (at < s.length && (m = re.exec(s))) { out.push([m[1], m[3] !== undefined ? m[3].replace(/\\(.)/g, '$1') : m[2]]); at = re.lastIndex; }
  if (s.slice(at).trim()) throw new Error(`can't read "${s.slice(at).trim()}"; write field=value, with quotes around values that have spaces`);
  return out;
}

export interface Applied { id: string; outcome: string; error?: string }

/**
 * Applies decided rows to the tables in place. Returns what happened per row; rows that fail
 * stay in the queue with their decision untouched, so the owner can correct them.
 * approve: link -> verified (audit: logged correct). reject: link -> excluded with the note as the
 * reason (audit: logged wrong, link -> needs-human; change-to-verified: proposal dropped).
 * edit: fields applied; a verified link stays verified, anything else goes back to draft for the gate.
 * skip: row moves to the end of its kind.
 */
export function applyDecisions(t: Tables, q: QueueRow[], log: { audit: (row: QueueRow, result: 'correct' | 'wrong', cause: string) => void }) {
  const results: Applied[] = [];
  const keep: QueueRow[] = [], resolved: ResolvedRow[] = [], skipped: QueueRow[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const r of q) {
    if (!r.decision) { keep.push(r); continue; }
    try {
      const outcome = applyOne(t, r, log);
      if (outcome === 'skipped') { skipped.push({ ...r, decision: '', decision_note: '' }); results.push({ id: r.id, outcome }); continue; }
      resolved.push({ ...r, resolved: today, outcome });
      results.push({ id: r.id, outcome });
    } catch (e) {
      keep.push(r);
      results.push({ id: r.id, outcome: 'not applied', error: (e as Error).message });
    }
  }
  return { remaining: [...keep, ...skipped], resolved, results };
}

function linkOf(t: Tables, r: QueueRow): LinkRow {
  const l = t.links.find((x) => x.id === r.link);
  if (!l) throw new Error(`${r.id}: link "${r.link}" is not in data/links.csv`);
  return l;
}

function setFields(l: LinkRow, pairs: [string, string][]) {
  for (const [k, v] of pairs) {
    if (!(EDITABLE as readonly string[]).includes(k)) throw new Error(`field "${k}" can't be edited here (allowed: ${EDITABLE.join(', ')})`);
    const rec = l as unknown as Record<string, unknown>;
    rec[k] = v === '' ? undefined : (k === 'from' || k === 'to') ? Number(v) : v;
    if ((k === 'from' || k === 'to') && v !== '' && !Number.isInteger(Number(v))) throw new Error(`${k} must be a whole year`);
  }
}

function applyOne(t: Tables, r: QueueRow, log: { audit: (row: QueueRow, result: 'correct' | 'wrong', cause: string) => void }): string {
  const d = r.decision.trim().toLowerCase();
  if (!(DECISIONS as readonly string[]).includes(d)) throw new Error(`${r.id}: decision "${r.decision}" must be one of ${DECISIONS.join(', ')}`);
  if (d === 'skip') return 'skipped';
  if (r.kind === 'blocked-source') {
    // Resolved by the owner checking the page by hand: approve = "the quote is there", reject = "it isn't".
    if (d === 'approve') return 'confirmed by hand';
    if (d === 'reject') { if (r.link.includes('/')) { const l = linkOf(t, r); if (l.status !== 'verified') { l.status = 'needs-human'; } } return 'quote not found by hand'; }
    if (d === 'edit') { const l = linkOf(t, r); setFields(l, parseAssignments(r.decision_note)); if (l.status !== 'verified') l.status = 'draft'; return 'edited'; }
  }
  const l = linkOf(t, r);
  if (r.kind === 'audit') {
    if (d === 'approve') { log.audit(r, 'correct', ''); return 'audit: correct'; }
    if (d === 'reject') { log.audit(r, 'wrong', r.decision_note); l.status = 'needs-human'; return 'audit: wrong'; }
    setFields(l, parseAssignments(r.decision_note)); log.audit(r, 'wrong', `edited: ${r.decision_note}`); l.status = 'verified'; return 'audit: corrected and verified';
  }
  if (r.kind === 'change-to-verified') {
    if (d === 'approve') { setFields(l, parseAssignments(r.proposed)); return 'change applied'; }
    if (d === 'reject') return 'change dropped';
    setFields(l, parseAssignments(r.decision_note)); return 'edited';
  }
  // needs-human
  if (d === 'approve') { l.status = 'verified'; return 'verified'; }
  if (d === 'reject') { l.status = 'excluded'; l.note = [l.note, `Rejected in review (${r.id}): ${r.decision_note || 'no reason given'}`].filter(Boolean).join(' '); return 'excluded'; }
  setFields(l, parseAssignments(r.decision_note)); l.status = 'draft'; return 'edited, back to the gate';
}
