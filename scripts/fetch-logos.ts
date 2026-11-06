// Finds game and series logos through Wikidata ("logo image", P154), checks each file's licence on
// Wikimedia Commons and saves a PNG rendering to data/logos/ (docs/data-rules.md, section 8).
// Only files not yet in data/logos.csv are fetched. A refused or rate-limited request stops the run:
// rows already checked are kept, nothing else is written (CLAUDE.md, hard rule 1).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readTables, TABLES, type LogoRow } from './lib/tables.ts';
import { toCsv } from './lib/csv.ts';
import { sparql } from './lib/sparql.ts';
import { bankFor, USER_AGENT } from './lib/sources.ts';
import { checkLicence, commonsFileName, commonsQuery, fileSha256, imageName, LOGO_DIR, parseCommons } from './lib/logos.ts';

const t = readTables();
const COMMONS = 'https://commons.wikimedia.org';
const bank = bankFor(`${COMMONS}/wiki/`, t.sources);
if (!bank || bank.status !== 'ok') {
  console.error(`commons.wikimedia.org is ${bank ? `marked ${bank.status}` : 'not'} in data/sources.csv; not fetching.`);
  process.exit(1);
}
const rate = bank.rate_ms ?? 1000;
const today = new Date().toISOString().slice(0, 10);
let last = 0;
async function politeFetch(url: string) {
  const wait = last + rate - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  return fetch(url, { headers: { 'User-Agent': USER_AGENT } });
}

// 1. Which Commons file Wikidata names as each game's and series' logo.
const subjects = [
  ...t.games.filter((g) => g.wikidata).map((g) => ({ kind: 'game', id: g.id, q: g.wikidata! })),
  ...t.series.filter((s) => s.wikidata).map((s) => ({ kind: 'series', id: s.id, q: s.wikidata! })),
];
const rows = await sparql(`SELECT ?item ?logo WHERE { VALUES ?item { ${[...new Set(subjects.map((s) => `wd:${s.q}`))].join(' ')} } ?item wdt:P154 ?logo }`);
const logosOf = new Map<string, string[]>();
for (const r of rows) {
  const q = r.item!.replace('http://www.wikidata.org/entity/', '');
  logosOf.set(q, [...(logosOf.get(q) ?? []), commonsFileName(r.logo!)].sort());
}

const known = new Map(t.logos.map((r) => [`${r.kind}:${r.id}`, r]));
const todo: { kind: string; id: string; file: string; note?: string }[] = [];
for (const s of subjects) {
  const files = logosOf.get(s.q);
  if (!files) continue;
  const have = known.get(`${s.kind}:${s.id}`);
  if (have) {
    if (have.file !== files[0] && !files.includes(have.file)) console.log(`  ${s.kind} ${s.id}: Wikidata now names "${files[0]}", data has "${have.file}". Kept; review by hand.`);
    continue;
  }
  todo.push({ kind: s.kind, id: s.id, file: files[0], ...(files.length > 1 ? { note: `Wikidata lists ${files.length} logos; took the first by name` } : {}) });
}
console.log(`${subjects.length} games and series with Wikidata, ${logosOf.size} with a logo, ${todo.length} not yet in data/logos.csv.`);

// 2. Licence and rendering from Commons, 50 files per request; then each image.
const added: LogoRow[] = [];
let stopped = '';
mkdirSync(LOGO_DIR, { recursive: true });
for (let i = 0; i < todo.length && !stopped; i += 50) {
  const batch = todo.slice(i, i + 50);
  const res = await politeFetch(commonsQuery(`${COMMONS}${bank.api}`, [...new Set(batch.map((b) => b.file))]));
  if (!res.ok) { stopped = `Commons API answered HTTP ${res.status}${res.headers.get('retry-after') ? ` (Retry-After ${res.headers.get('retry-after')})` : ''}`; break; }
  const files = parseCommons(await res.json(), batch.map((b) => b.file));
  for (const b of batch) {
    const f = files.get(b.file)!;
    const base = { kind: b.kind, id: b.id, file: b.file, accessed: today };
    if (f.missing || !f.thumb) { added.push({ ...base, status: 'excluded', note: 'not found on Commons' }); continue; }
    const v = checkLicence(f.meta, f.templates);
    const lic = { ...(v.licence ? { licence: v.licence } : {}), ...(v.licenceName ? { licence_name: v.licenceName } : {}) };
    if (!v.ok) { added.push({ ...base, ...lic, status: 'excluded', note: v.reason }); continue; }
    const img = await politeFetch(f.thumb);
    if (!img.ok) { stopped = `image ${f.thumb} answered HTTP ${img.status}`; break; }
    const buf = Buffer.from(await img.arrayBuffer());
    const image = imageName(b.kind, b.id, f.thumb);
    writeFileSync(new URL(image, LOGO_DIR), buf);
    added.push({ ...base, ...lic, ...(v.author ? { author: v.author } : {}), image, sha256: fileSha256(buf), status: 'ok', ...(b.note ? { note: b.note } : {}) });
  }
}

// 3. Write data/logos.csv: existing rows untouched, new ones added, sorted by kind and id.
const def = TABLES.find((d) => d.key === 'logos')!;
const all = [...t.logos, ...added].map(({ _row, ...r }: LogoRow & { _row?: number }) => r).sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
const out = new URL(`../data/${def.file}`, import.meta.url);
const before = readFileSync(out, 'utf8');
const after = toCsv(def.cols.map((c) => c.key), all as unknown as Record<string, unknown>[]);
if (after !== before) writeFileSync(out, after);
const ok = added.filter((r) => r.status === 'ok').length;
console.log(`Added ${added.length} row(s): ${ok} ok, ${added.length - ok} excluded.`);
for (const r of added.filter((r) => r.status === 'excluded')) console.log(`  excluded ${r.kind} ${r.id} (${r.file}): ${r.note}`);
if (stopped) {
  console.error(`Stopped: ${stopped}. Logged, not retried; run again later. ${todo.length - added.length} file(s) left unchecked.`);
  process.exit(2);
}
