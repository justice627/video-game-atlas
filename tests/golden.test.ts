import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readTables } from '../scripts/lib/tables.ts';
import { GOLDEN, goldenOutput } from './golden.ts';

const tables = readTables();

describe('golden examples (update with `npm run golden:update` and say which moved in the PR)', () => {
  for (const [name, { about }] of Object.entries(GOLDEN)) {
    it(`${name}: ${about}`, () => {
      const want = JSON.parse(readFileSync(new URL(`golden/${name}.json`, import.meta.url), 'utf8'));
      expect(goldenOutput(tables, name)).toEqual(want);
    });
  }
});
