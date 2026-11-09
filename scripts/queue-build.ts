// Rebuilds review/queue.csv (npm run queue:build): drops open rows whose reason is gone, adds rows
// for blocked sources and for needs-human links without one, and sorts by kind. Rows with a
// decision filled in are never touched until they're applied.
import { existsSync, readFileSync } from 'node:fs';
import { parseCsv } from './lib/csv.ts';
import { quotesOf } from './lib/dataset.ts';
import { byPriority, describeLink, Queue, type QueueRow } from './lib/queue.ts';
import { readTables, type Tables } from './lib/tables.ts';
import { hasEvidence } from './verify-sources.ts';
import { ROOT } from './pipeline.ts';

const csv = (p: string, root: URL) => { const f = new URL(p, root); if (!existsSync(f)) return []; const [h, ...r] = parseCsv(readFileSync(f, 'utf8')); return r.filter((x) => x.some(Boolean)).map((x) => Object.fromEntries(h.map((k, i) => [k, x[i] ?? '']))); };
const sentence = (s: string) => /^The sentence: "(.*)"$/.exec(s)?.[1] ?? '';

export function stale(t: Tables, r: QueueRow, evidence = (url: string, quote: string) => hasEvidence({ url, quote, ref: '', status: '', grandfathered: false })): boolean {
  if (r.decision) return false;
  const l = t.links.find((x) => x.id === r.link);
  switch (r.kind) {
    case 'needs-human': return l?.status !== 'needs-human';
    case 'audit': return l?.status !== 'auto-verified';
    case 'change-to-verified': return l?.status !== 'verified';
    case 'blocked-source': return (r.link.includes('/') && !l) || (!!r.quote && evidence(r.source, r.quote));
    default: return false;
  }
}

export function build(t: Tables, q: Queue, root = ROOT) {
  const before = q.rows();
  q.save(before.filter((r) => !stale(t, r)));
  let added = 0;
  for (const b of csv('review/blocked-sources.csv', root)) {
    const l = t.links.find((x) => x.id === b.ref);
    const chain = /^chronology:(\d+)$/.exec(b.ref) ? t.chronology[Number(b.ref.split(':')[1]) - 2] : undefined;
    const title = (id: string) => t.games.find((g) => g.id === id)?.title ?? t.games.find((g) => g.id === id.split('/')[0])?.title ?? id;
    const quote = sentence(b.what_to_find);
    if (quote && hasEvidence({ url: b.url, quote, ref: '', status: '', grandfathered: false })) continue;
    if (l?.status === 'excluded') continue;
    const row = q.add({ kind: 'blocked-source', link: b.ref, game: l?.game_id ?? (chain ? chain.to.split('/')[0] : b.ref.split('/')[0]), place: l?.place_id ?? '',
      claim: l ? describeLink(t, l) : chain ? `${title(chain.to)} is ${chain.interval_years ? `${chain.interval_years} years ` : ''}${chain.relation} ${title(chain.from)} (chronology row ${b.ref.split(':')[1]})` : b.ref, source: b.url, quote, reason: `${b.kind === 'blocked' ? 'Refuses automated fetching' : 'Fetch failed'}: ${b.reason}`, proposed: '',
      what_i_need_to_do: `Open ${b.url} and look for: ${b.what_to_find.replace(/^The sentence: /, 'the sentence ')}. Approve if it is there (or reply quote <id> "<the text you found>"), reject if it is not.` });
    if (row) added++;
  }
  for (const l of t.links.filter((x) => x.status === 'needs-human')) {
    const row = q.add({ kind: 'needs-human', link: l.id, game: l.game_id, place: l.place_id, claim: describeLink(t, l), source: (l.sources ?? '').split(/\s+/)[0] ?? '', quote: quotesOf(l.quote)[0] ?? '', reason: 'needs a human (from the gate or a wrong audit)', proposed: '',
      what_i_need_to_do: 'Check the claim against its source. Approve if it is right, reject with the reason if not, or edit the fields that are wrong.' });
    if (row) added++;
  }
  const rows = byPriority(q.rows());
  q.save(rows);
  return { removed: before.length - (rows.length - added), added, open: rows.filter((r) => !r.decision).length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = build(readTables(), new Queue(ROOT));
  console.log(`queue:build: ${r.added} added, ${r.removed} removed, ${r.open} open`);
}
