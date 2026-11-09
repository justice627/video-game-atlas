// Applies ticks and commands from the pinned review issue to review/queue.csv
// (.github/workflows/decisions.yml). Deterministic; no LLM. Acts only on the pinned issue and only
// for the owner: anything else exits quietly with no output.
//   npx tsx scripts/review-decisions.ts <event.json> <event-name> [carried-queue.csv]
// Writes review/queue.csv, prints the reply to stdout, and sets `changed` in $GITHUB_OUTPUT.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { parseCsv } from './lib/csv.ts';
import { applyCommands, newTicks, parseComment, type Command } from './lib/commands.ts';
import { Queue, QUEUE_COLS, type QueueRow } from './lib/queue.ts';
import { MARKER } from './review-issue.ts';
import { ROOT } from './pipeline.ts';

export const OWNER = 'justice627';
export const LABEL = 'review-queue';

interface GhEvent {
  action?: string; sender?: { login?: string; type?: string };
  issue?: { number?: number; body?: string; labels?: { name: string }[]; pull_request?: unknown };
  comment?: { body?: string; user?: { login?: string; type?: string } };
  changes?: { body?: { from?: string } };
}

/** Whether this event may change anything: the pinned issue, the owner, a human. */
export function allowed(e: GhEvent, name: string): boolean {
  const issue = e.issue;
  if (!issue || issue.pull_request) return false;
  if (!issue.labels?.some((l) => l.name === LABEL) || !issue.body?.includes(MARKER)) return false;
  const who = name === 'issue_comment' ? e.comment?.user : e.sender;
  return who?.login === OWNER && who?.type !== 'Bot';
}

export function commandsFrom(e: GhEvent, name: string): { commands: Command[]; errors: string[] } {
  if (name === 'issues' && e.action === 'edited') {
    if (e.changes?.body?.from === undefined) return { commands: [], errors: [] }; // a title or label edit
    return { commands: newTicks(e.changes.body.from, e.issue?.body ?? '').map((id) => ({ op: 'approve' as const, id })), errors: [] };
  }
  if (name === 'issue_comment' && e.action === 'created') return parseComment(e.comment?.body ?? '');
  return { commands: [], errors: [] };
}

/** Decisions waiting in the open decisions PR, carried onto main's queue so a rebuilt branch keeps them. */
export function carry(rows: QueueRow[], carried: QueueRow[]) {
  for (const c of carried) {
    const r = rows.find((x) => x.id === c.id);
    if (r && !r.decision && c.decision) { r.decision = c.decision; r.decision_note = c.decision_note; }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [eventPath, name, carriedPath] = process.argv.slice(2);
  const e = JSON.parse(readFileSync(eventPath, 'utf8')) as GhEvent;
  const out = (k: string, v: string) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
  if (!allowed(e, name)) { out('changed', 'false'); out('reply', 'false'); process.exit(0); }
  const { commands, errors } = commandsFrom(e, name);
  if (!commands.length && !errors.length) { out('changed', 'false'); out('reply', 'false'); process.exit(0); }
  const q = new Queue(ROOT);
  const rows = q.rows();
  if (carriedPath && existsSync(carriedPath)) {
    const [h, ...r] = parseCsv(readFileSync(carriedPath, 'utf8'));
    carry(rows, r.filter((x) => x.some(Boolean)).map((x) => Object.fromEntries(QUEUE_COLS.map((c) => [c, x[h.indexOf(c)] ?? ''])) as QueueRow));
  }
  const lines: string[] = [];
  if (errors.length) {
    // One unreadable line and the whole comment changes nothing.
    lines.push('Nothing applied: I could not read every line.', '', ...errors.map((x) => `- ${x}`));
    q.save(rows);
    out('changed', String(!!carriedPath));
  } else {
    const o = applyCommands(rows, commands);
    q.save(rows);
    if (o.applied.length) lines.push('Recorded (applied by the next research run):', ...o.applied.map((x) => `- ${x}`));
    if (o.conflicts.length) lines.push('', 'Not changed, already decided:', ...o.conflicts.map((x) => `- ${x}`));
    if (o.errors.length) lines.push('', 'Not changed:', ...o.errors.map((x) => `- ${x}`));
    out('changed', String(o.applied.length > 0 || !!carriedPath));
  }
  out('reply', 'true');
  process.stdout.write(lines.join('\n') + '\n');
}
