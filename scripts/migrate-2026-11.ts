// One-off migration (2026-11) for the research pipeline, phase 2. Run once; its output is committed.
// - links.csv gains id, quote and accessed.
// - A quote moves into the quote column only when it is unambiguous: one source URL and exactly one
//   quoted passage in the note. The note is left as it was, so no verified text changes.
//   "accessed" is the date the line was last written (git blame), the best record of when it was checked.
// - Every verified link is listed in grandfathered.csv (decision D5: verified links may stay without a quote).
// - New tables: queue-in.csv (empty), freeze.csv (sports and venue freeze), grandfathered.csv.
// - Counts are reconciled: same links in and out, same count per status.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseCsv, toCsv } from './lib/csv.ts';
import { TABLES, ELISION } from './lib/tables.ts';

const DATA = new URL('../data/', import.meta.url);
const file = (name: string) => new URL(name, DATA);
const linksDef = TABLES.find((d) => d.key === 'links')!;
const [header, ...rows] = parseCsv(readFileSync(file('links.csv'), 'utf8'));
if (header.includes('id')) { console.log('links.csv already migrated'); process.exit(0); }
const lines = rows.filter((r) => r.some((c) => c !== ''));

// git blame dates per CSV line (rows have no embedded newlines; checked below).
const text = readFileSync(file('links.csv'), 'utf8');
if (text.trimEnd().split('\n').length !== lines.length + 1) throw new Error('links.csv has multi-line rows; blame mapping would be wrong');
const blame = execFileSync('git', ['blame', '--line-porcelain', 'data/links.csv'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
const dates: string[] = [];
for (const m of blame.matchAll(/^author-time (\d+)$/gm)) dates.push(new Date(Number(m[1]) * 1000).toISOString().slice(0, 10));
if (dates.length !== lines.length + 1) throw new Error(`blame gave ${dates.length} lines for ${lines.length + 1}`);

const seen = new Map<string, number>();
const out: Record<string, string>[] = [];
let moved = 0;
const notMoved: string[] = [];
lines.forEach((r, i) => {
  const row = Object.fromEntries(header.map((h, j) => [h, r[j] ?? '']));
  const base = `${row.game_id}/${row.place_id}`;
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  row.id = n === 1 ? base : `${base}/${n}`;
  const sources = row.sources.split(/\s+/).filter(Boolean);
  const quotes = [...row.note.matchAll(/"([^"]{8,})"/g)].map((m) => m[1].trim());
  row.quote = ''; row.accessed = '';
  if (row.status !== 'excluded' && sources.length === 1 && quotes.length === 1) {
    row.quote = quotes[0].replace(/\s*(\.\.\.?|…)\s*/g, ELISION);
    row.accessed = dates[i + 1];
    moved++;
  } else if (quotes.length) notMoved.push(`${row.id}: ${sources.length} source(s), ${quotes.length} quoted passage(s)`);
  out.push(row);
});
const ids = new Set(out.map((r) => r.id));
if (ids.size !== out.length) throw new Error('duplicate link ids');

writeFileSync(file('links.csv'), toCsv(linksDef.cols.map((c) => c.key), out));

const write = (name: string, key: string, rows: Record<string, string>[]) => {
  if (existsSync(file(name))) throw new Error(`${name} exists`);
  writeFileSync(file(name), toCsv(TABLES.find((d) => d.key === key)!.cols.map((c) => c.key), rows));
};
write('queue-in.csv', 'queueIn', []);
write('freeze.csv', 'freeze', [
  { kind: 'role', value: 'arena', note: 'Sports and venue research frozen 2026-11-05 until the owner lifts it' },
  { kind: 'series', value: 'fifa', note: 'Sports freeze, 2026-11-05' },
  { kind: 'series', value: 'ea-sports-fc', note: 'Sports freeze, 2026-11-05' },
  { kind: 'series', value: 'fifa-world-cup', note: 'Sports freeze, 2026-11-05' },
]);
write('grandfathered.csv', 'grandfathered', out.filter((r) => r.status === 'verified').map((r) => ({ link_id: r.id, note: '' })));

// Reconcile.
const count = (rs: { status: string }[]) => JSON.stringify(Object.entries(rs.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {})).sort());
const before = lines.map((r) => ({ status: r[header.indexOf('status')] }));
if (count(before) !== count(out) || before.length !== out.length) throw new Error('reconciliation failed');
console.log(`links: ${out.length} in, ${out.length} out, by status ${count(out)}`);
console.log(`quotes moved: ${moved}; left in note (ambiguous): ${notMoved.length}`);
console.log(`grandfathered: ${out.filter((r) => r.status === 'verified').length} verified links`);
writeFileSync(new URL('../docs/review/2026-11-migration.md', import.meta.url),
  `# 2026-11 migration: quotes left in notes\n\nThese links have quoted text in \`note\` that the migration could not assign to one source unambiguously (several sources or several quoted passages). The research pipeline adds their quotes when it next touches the link; verified ones are grandfathered.\n\n${notMoved.map((s) => `- ${s}`).join('\n')}\n`);
