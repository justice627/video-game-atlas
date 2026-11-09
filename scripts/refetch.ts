// Weekly re-check (.github/workflows/weekly-refetch.yml): fetch every source that has a quote again.
// A quote still on its page gets fresh evidence. A quote that's gone:
//   - verified link: a change-to-verified item (approve keeps the link as it is; edit sets a new quote);
//   - any other link: needs-human, with a queue item.
// Blocked or failed fetches are logged as usual and change nothing. Links without quotes
// (grandfathered) are not checked: a missing quote that never existed isn't a change.
import { describeLink, Queue } from './lib/queue.ts';
import { readTables, writeTables } from './lib/tables.ts';
import { fetchMode } from './verify-sources.ts';
import { ROOT } from './pipeline.ts';
import { build } from './queue-build.ts';

const t = readTables();
const { found, notFound, blocked } = await fetchMode(t, 'all');
const q = new Queue(ROOT);
const today = new Date().toISOString().slice(0, 10);
let changed = 0;
for (const p of notFound) {
  const l = t.links.find((x) => x.id === p.ref);
  if (!l) continue; // chronology rows: listed in the report only
  if (l.status === 'verified') {
    q.add({ kind: 'change-to-verified', link: l.id, game: l.game_id, place: l.place_id, claim: describeLink(t, l), source: p.url, quote: p.quote,
      reason: `quote not found on its page in the weekly re-check (${today})`, proposed: '',
      what_i_need_to_do: 'The page no longer has this sentence. Approve to keep the link as it is, or edit it with a new quote (edit q.. quote="…" accessed=…).' });
  } else if (l.status !== 'excluded') {
    l.status = 'needs-human';
    q.add({ kind: 'needs-human', link: l.id, game: l.game_id, place: l.place_id, claim: describeLink(t, l), source: p.url, quote: p.quote,
      reason: `quote not found on its page in the weekly re-check (${today})`, proposed: '',
      what_i_need_to_do: 'The page no longer has this sentence. Approve if the claim still holds, reject with the reason, or edit the quote.' });
  }
  changed++;
}
writeTables(t);
const r = build(t, q);
console.log(`refetch: ${found.length} quote(s) still on their pages, ${notFound.length} gone (${changed} link(s) to review), ${blocked.length} blocked or failed; queue ${r.open} open`);
