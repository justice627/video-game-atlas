// PostToolUse hook: after an Edit or Write of a data table, validate the tables and check the
// changed rows' quotes against committed evidence. No network. Exit 2 sends the row-level
// problems back to Claude; exit 0 lets the edit stand.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCsv } from '../lib/csv.ts';
import { validate } from '../lib/dataset.ts';
import { readTables } from '../lib/tables.ts';
import { offline } from '../verify-sources.ts';
import { mergeStaging, readStaging } from '../lib/staging.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Data tables the hook watches: data/*.csv (and data/staging/** once research writes there). */
export const watched = (file: string, root = ROOT) => {
  const rel = relative(root, resolve(root, file)).split('\\').join('/');
  return /^data\/([^/]+|staging\/.+)\.csv$/.test(rel) ? rel : undefined;
};

/** Link ids whose rows differ from the committed (HEAD) links.csv. */
export function changedLinkIds(dataDir: URL, root = ROOT): Set<string> {
  let base = '';
  try { base = execFileSync('git', ['show', 'HEAD:data/links.csv'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* new repo */ }
  const index = (text: string) => {
    const [h, ...rows] = parseCsv(text);
    const i = h?.indexOf('id') ?? -1;
    return new Map(rows.filter((r) => r.some(Boolean)).map((r) => [r[i], r.join('\u0000')]));
  };
  const before = index(base), now = index(readFileSync(new URL('links.csv', dataDir), 'utf8'));
  return new Set([...now].filter(([id, row]) => before.get(id) !== row).map(([id]) => id));
}

export function check(file: string, dataDir = pathToFileURL(`${ROOT}data/`), root = ROOT): { code: 0 | 2; message: string } {
  const rel = watched(file, root);
  if (!rel) return { code: 0, message: '' };
  const staged = /^data\/staging\/([^/]+)\//.exec(rel);
  if (staged) {
    // A research run's staging tables: check them by merging into a copy of the real tables.
    let r;
    try { r = mergeStaging(readTables(dataDir), staged[1], readStaging(new URL(`staging/${staged[1]}/`, dataDir))); }
    catch (e) { return { code: 2, message: `${rel}: ${(e as Error).message}` }; }
    if (r.ok) return { code: 0, message: `${rel}: merges cleanly (${r.linkIds.length} link(s)${r.proposals.length ? `, ${r.proposals.length} proposed change(s) to verified links` : ''}).` };
    // A staging folder is written file by file: a missing games.csv row or place may simply not be written yet.
    return { code: 2, message: `${rel}: the staging for ${staged[1]} would not merge yet. Fix these, or write the missing rows next:\n  ${r.errors.slice(0, 30).join('\n  ')}` };
  }
  let errs: string[];
  try { errs = validate(readTables(dataDir)); } catch (e) { return { code: 2, message: `${rel}: ${(e as Error).message}` }; }
  const t = readTables(dataDir);
  const ids = changedLinkIds(dataDir, root);
  const ev = offline(t, ids);
  const problems = [...errs, ...ev.errors];
  if (!problems.length) {
    const note = ev.warnings.length ? ` ${ev.warnings.length} changed quote(s) have no evidence yet: run npm run verify:sources -- --fetch --changed.` : '';
    return { code: 0, message: `${rel}: valid.${note}` };
  }
  const shown = problems.slice(0, 30);
  return { code: 2, message: `${rel}: ${problems.length} problem(s) after this edit. Fix them before continuing (docs/data-rules.md):\n  ${shown.join('\n  ')}${problems.length > shown.length ? `\n  … and ${problems.length - shown.length} more` : ''}` };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}') as { tool_input?: { file_path?: string }; cwd?: string };
  const file = input.tool_input?.file_path ?? '';
  const { code, message } = check(file);
  if (code === 2) { process.stderr.write(message + '\n'); process.exit(2); }
  if (message) process.stdout.write(message + '\n');
}
