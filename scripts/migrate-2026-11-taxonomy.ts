// One-off migration (2026-11): split role into role + depiction (issue 8, approved).
// role: setting -> world, arena -> venue (Gallipoli -> map), inspiration -> world or level per the
// approved table; depiction: fictionalized for former inspiration links, real for the rest.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseCsv, toCsv } from './lib/csv.ts';

const DATA = new URL('../data/', import.meta.url);
const [header, ...rows] = parseCsv(readFileSync(new URL('links.csv', DATA), 'utf8'));
if (header.includes('depiction')) { console.log('already migrated'); process.exit(0); }
const LEVEL = new Set(['hitman-3/burj-khalifa', 'devil-may-cry-5/london', 'dmc-devil-may-cry/barcelona', 'dmc-devil-may-cry/genoa',
  'super-mario-odyssey/new-york-city', 'super-mario-odyssey/empire-state-building']);
const MAP = new Set(['gallipoli-2026/gallipoli']);
const REVIEW = new Set(['the-house-of-hikmah/house-of-wisdom']);

const out: Record<string, string>[] = [];
const changed: string[] = [];
for (const r of rows.filter((r) => r.some((c) => c))) {
  const row = Object.fromEntries(header.map((h, j) => [h, r[j] ?? '']));
  const before = row.role;
  row.depiction = before === 'inspiration' ? 'fictionalized' : 'real';
  if (before === 'setting') row.role = 'world';
  else if (before === 'arena') row.role = MAP.has(row.id) ? 'map' : 'venue';
  else if (before === 'inspiration') row.role = LEVEL.has(row.id) ? 'level' : 'world';
  if (REVIEW.has(row.id)) {
    row.flags = [...new Set([...row.flags.split(/\s+/).filter(Boolean), 'needs-review'])].join(' ');
    row.note = `${row.note} Role world and depiction fictionalized are provisional (taxonomy migration): the Steam text calls it "a beautifully imagined House of Wisdom".`.trim();
  }
  const renameOnly = (before === 'setting' && row.role === 'world') || (before === 'arena' && row.role === 'venue');
  if (!renameOnly && before !== row.role || before === 'inspiration') changed.push(`| \`${row.id}\` | ${row.status} | ${before} | ${row.role} | ${row.depiction} |`);
  out.push(row);
}
const cols = [...header];
cols.splice(cols.indexOf('role') + 1, 0, 'depiction');
writeFileSync(new URL('links.csv', DATA), toCsv(cols, out));
const freeze = readFileSync(new URL('freeze.csv', DATA), 'utf8').replace(/^role,arena,/m, 'role,venue,');
writeFileSync(new URL('freeze.csv', DATA), freeze);
const count = (k: string) => Object.entries(out.reduce<Record<string, number>>((m, r) => ((m[r[k]] = (m[r[k]] ?? 0) + 1), m), {})).map(([a, n]) => `${a} ${n}`).join(', ');
console.log(`links: ${out.length}; roles: ${count('role')}; depiction: ${count('depiction')}`);
console.log(`Links whose role changed beyond a rename, or that became fictionalized:\n| Link | Status | Was | Role | Depiction |\n| --- | --- | --- | --- | --- |\n${changed.join('\n')}`);
