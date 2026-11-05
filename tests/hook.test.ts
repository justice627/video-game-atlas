// The PostToolUse data hook (scripts/hooks/check-data.ts) against a copy of data/.
import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { check, watched } from '../scripts/hooks/check-data.ts';

const root = new URL('../', import.meta.url).pathname;
const copy = () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'hook-')), 'data');
  cpSync(join(root, 'data'), dir, { recursive: true });
  return { dir, url: pathToFileURL(dir + '/') };
};
const editLinks = (dir: string, f: (csv: string) => string) => writeFileSync(join(dir, 'links.csv'), f(readFileSync(join(dir, 'links.csv'), 'utf8')));

describe('data hook', () => {
  it('watches data tables only', () => {
    expect(watched(`${root}data/links.csv`, root)).toBe('data/links.csv');
    expect(watched('data/staging/hitman-2/links.csv', root)).toBe('data/staging/hitman-2/links.csv');
    expect(watched(`${root}src/main.ts`, root)).toBeUndefined();
    expect(watched(`${root}data/evidence/x.json`, root)).toBeUndefined();
    expect(check(`${root}src/main.ts`).code).toBe(0);
  });

  it('passes valid data', () => {
    const { url } = copy();
    expect(check(`${root}data/links.csv`, url, root)).toMatchObject({ code: 0, message: 'data/links.csv: valid.' });
  });

  it('blocks an invalid edit with the row named', () => {
    const { dir, url } = copy();
    editLinks(dir, (s) => s.replace(',verified,', ',verifed,'));
    const r = check(`${root}data/links.csv`, url, root);
    expect(r.code).toBe(2);
    expect(r.message).toContain('Links row 2: status "verifed"');
  });

  it('blocks a changed quote on a shown link that has no evidence', () => {
    const { dir, url } = copy();
    // A draft quote changed and the link promoted: its new quote has no evidence record.
    const lines = readFileSync(join(dir, 'links.csv'), 'utf8').split('\n');
    const i = lines.findIndex((l) => l.includes(',draft,') && /,https:\/\/en\.wikipedia\.org\/[^ ,]+,[^,"]{10,},\d{4}-\d{2}-\d{2},/.test(l));
    lines[i] = lines[i].replace(/(,https:\/\/en\.wikipedia\.org\/[^ ,]+,)([^,"]{10,})(,\d{4}-\d{2}-\d{2},)/, '$1A sentence nobody wrote$3').replace(',draft,', ',auto-verified,');
    writeFileSync(join(dir, 'links.csv'), lines.join('\n'));
    const r = check(`${root}data/links.csv`, url, root);
    expect(r.code).toBe(2);
    expect(r.message).toContain('no evidence that en.wikipedia.org contains "A sentence nobody wrote"');
  });

  it('the shell wrapper skips non-data files without starting Node', () => {
    const out = execFileSync('bash', [join(root, 'scripts/hooks/check-data.sh')], { input: JSON.stringify({ tool_input: { file_path: `${root}README.md` } }), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' });
    expect(out).toBe('');
  });
});
