// Resolves merge conflicts when a data/* branch takes in main (.github/workflows/open-data-pr.yml).
// Research runs and the decisions workflow both write review files, so these conflicts are
// expected and mechanical. Data tables are not: a conflict there is left for a human or the next run.
//   npx tsx scripts/merge-data.ts        (run during a conflicted `git merge origin/main`)
// Exit 0: all conflicts resolved and staged. Exit 1: a conflict it won't resolve (listed).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { parseCsv, toCsv } from './lib/csv.ts';

const git = (args: string[]) => execFileSync('git', args, { encoding: 'utf8' });
const side = (n: 2 | 3, path: string) => { try { return git(['show', `:${n}:${path}`]); } catch { return ''; } };
const rows = (text: string) => { const [h = [], ...r] = parseCsv(text); return { h, r: r.filter((x) => x.some(Boolean)).map((x) => Object.fromEntries(h.map((k, i) => [k, x[i] ?? '']))) }; };

/** Append-only logs: main's rows, then the branch's rows main doesn't have. */
export function unionLog(ours: string, theirs: string): string {
  const a = rows(theirs), b = rows(ours);
  const h = a.h.length ? a.h : b.h;
  const seen = new Set(a.r.map((x) => JSON.stringify(x)));
  return toCsv(h, [...a.r, ...b.r.filter((x) => !seen.has(JSON.stringify(x)))]);
}
/** Queue rows by id: a decided row beats an open one; otherwise main's version wins. */
export function unionQueue(ours: string, theirs: string): string {
  const a = rows(theirs), b = rows(ours);
  const out = new Map(a.r.map((x) => [x.id, x]));
  for (const x of b.r) { const m = out.get(x.id); if (!m || (!m.decision && x.decision)) out.set(x.id, x); }
  return toCsv(a.h.length ? a.h : b.h, [...out.values()]);
}
/** Backlog by game: the higher attempt count and the branch's latest reason. */
export function unionBacklog(ours: string, theirs: string): string {
  const a = rows(theirs), b = rows(ours);
  const out = new Map(a.r.map((x) => [x.game, x]));
  for (const x of b.r) { const m = out.get(x.game); out.set(x.game, m ? { ...x, attempts: String(Math.max(Number(m.attempts || 0), Number(x.attempts || 0))) } : x); }
  return toCsv(a.h.length ? a.h : b.h, [...out.values()]);
}

const RESOLVERS: Record<string, (ours: string, theirs: string) => string> = {
  'review/next-id.txt': (o, t) => `${Math.max(Number(o.trim()) || 1, Number(t.trim()) || 1)}\n`,
  'review/queue.csv': unionQueue,
  'review/backlog.csv': unionBacklog,
  'review/resolved.csv': unionLog,
  'review/factcheck.csv': unionLog,
  'review/blocked-sources.csv': unionLog,
  'docs/review/audit-log.csv': unionLog,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const conflicted = git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
  const unresolved: string[] = [];
  for (const path of conflicted) {
    const resolve = RESOLVERS[path] ?? (path.startsWith('review/runs/') ? (o: string) => o : undefined);
    if (!resolve) { unresolved.push(path); continue; }
    writeFileSync(path, resolve(side(2, path), side(3, path)));
    git(['add', '--', path]);
  }
  if (unresolved.length) { console.error(`Not resolved automatically: ${unresolved.join(', ')}`); process.exit(1); }
  console.log(`Resolved: ${conflicted.join(', ') || 'nothing to resolve'}`);
}
