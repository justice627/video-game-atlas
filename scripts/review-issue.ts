// The pinned "Review queue" issue: renders its body from review/queue.csv and lists new items.
//   npx tsx scripts/review-issue.ts body            the issue body (stdout)
//   npx tsx scripts/review-issue.ts new <old.csv>   ids open now that weren't in <old.csv>
import { existsSync, readFileSync } from 'node:fs';
import { parseCsv } from './lib/csv.ts';
import { auditState, type AuditRow } from './lib/audit.ts';
import { byPriority, KINDS, Queue, type QueueRow } from './lib/queue.ts';
import { ROOT } from './pipeline.ts';

export const MARKER = '<!-- review-queue:v1 -->';
export const SHOWN = 15;
const esc = (s: string) => s.replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;')).replace(/\r?\n/g, ' ');

export function renderBody(rows: QueueRow[], audit: ReturnType<typeof auditState>): string {
  const open = byPriority(rows.filter((r) => !r.decision));
  const pending = rows.filter((r) => r.decision).length;
  const counts = KINDS.map((k) => `${k} ${open.filter((r) => r.kind === k).length}`).join(' · ');
  const items = open.slice(0, SHOWN).map((r) => {
    const fields = [
      r.source && `**Source:** ${r.source}`,
      r.quote && `**Quote:** “${esc(r.quote)}”`,
      r.reason && `**Why it's here:** ${esc(r.reason)}`,
      r.proposed && `**Proposed:** \`${esc(r.proposed)}\``,
      `**What to do:** ${esc(r.what_i_need_to_do)}`,
    ].filter(Boolean).map((f) => `  - ${f}`);
    // The blank line after <summary> lets GitHub render the markdown inside <details>.
    return [`- [ ] ${r.id} · ${esc(r.game)}${r.place ? ` · ${esc(r.place)}` : ''}`, `  <details><summary>${r.kind}: ${esc(r.claim)}</summary>`, '', ...fields, '', '  </details>'].join('\n');
  });
  return [
    MARKER,
    `**${open.length} open** (${counts})${pending ? ` · ${pending} decided, applied by the next research run` : ''}`,
    `Audit mode: **${audit.mode}** (${audit.note}) · 95% upper bound on the gate's error rate: **${(audit.upper95 * 100).toFixed(1)}%** after ${audit.audited} audit(s)`,
    '',
    open.length ? `### Next ${Math.min(SHOWN, open.length)}` : '### Nothing waiting',
    '',
    ...items,
    '',
    '---',
    'Tick a box to approve. Or comment, one command per line:',
    '```',
    'reject q42 the level is in Lyon, not Paris',
    'edit q42 from=1986 to=1987',
    'quote q42 "the sentence you found on the page"',
    'skip q42',
    '```',
    'Only the repository owner\'s ticks and comments count. Decisions go to a data PR and are applied by the next research run.',
  ].join('\n');
}

const read = (path: string | URL) => { const [h, ...r] = parseCsv(readFileSync(path, 'utf8')); return r.filter((x) => x.some(Boolean)).map((x) => Object.fromEntries(h.map((k, i) => [k, x[i] ?? '']))); };

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, arg] = process.argv.slice(2);
  const rows = new Queue(ROOT).rows();
  if (cmd === 'body') {
    const log = existsSync(new URL('docs/review/audit-log.csv', ROOT)) ? read(new URL('docs/review/audit-log.csv', ROOT)) as unknown as AuditRow[] : [];
    process.stdout.write(renderBody(rows, auditState(log)) + '\n');
  } else if (cmd === 'new') {
    const old = new Set(arg && existsSync(arg) ? read(arg).map((r) => r.id) : []);
    process.stdout.write(rows.filter((r) => !r.decision && !old.has(r.id)).map((r) => r.id).join(' '));
  } else { console.error('usage: review-issue.ts body | new <old.csv>'); process.exit(1); }
}
