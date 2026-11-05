// One test per validator rule added for the research pipeline (docs/plans/pipeline.md, section 4.2):
// the current data passes, and a single edit that breaks the rule fails with a row-level message.
import { describe, expect, it } from 'vitest';
import { readTables, type Tables } from '../scripts/lib/tables.ts';
import { buildAtlas, validate } from '../scripts/lib/dataset.ts';

const tables = readTables();
type L = Tables['links'][number] & { _row: number };
const byId = (t: Tables, id: string) => t.links.find((l) => l.id === id)! as L;
const errorsAfter = (edit: (t: Tables) => void) => { const t = structuredClone(tables); edit(t); return validate(t); };
const vc = 'gta-vice-city/miami';           // verified, one source, quote migrated
const draft = () => tables.links.find((l) => l.status === 'draft' && l.quote && !l.flags)! as L;

describe('pipeline rules', () => {
  it('current data passes', () => expect(validate(tables)).toEqual([]));

  it('link ids are unique', () => {
    const e = errorsAfter((t) => { t.links[1].id = t.links[0].id; });
    expect(e.join('\n')).toMatch(/Links row 3: id "gta-vice-city\/miami" already used on Links row 2/);
  });

  it('quotes: one per source, with an accessed date', () => {
    expect(errorsAfter((t) => { byId(t, vc).quote = 'a | b'; }).join('\n')).toContain('2 quote(s) for 1 source(s)');
    expect(errorsAfter((t) => { byId(t, vc).accessed = undefined; }).join('\n')).toContain('quote needs the accessed date');
    expect(errorsAfter((t) => { byId(t, vc).accessed = '2026-13-01'; }).join('\n')).toContain('accessed must be a date');
    expect(errorsAfter((t) => { byId(t, vc).accessed = '2999-01-01'; }).join('\n')).toContain('accessed is in the future');
    expect(errorsAfter((t) => { const l = byId(t, vc); l.quote = undefined; }).join('\n')).toContain('accessed is set but there is no quote');
    // A repeated URL carries a second quote.
    expect(errorsAfter((t) => { const l = byId(t, vc); l.sources = `${l.sources} ${l.sources}`; l.quote = `${l.quote} | Vice City`; })).toEqual([]);
  });

  it('verified links need a quote unless grandfathered; auto-verified always', () => {
    const ac = 'assassins-creed-ii/florence'; // verified, no quote, grandfathered
    expect(errorsAfter(() => {})).toEqual([]);
    expect(errorsAfter((t) => { t.grandfathered = t.grandfathered.filter((g) => g.link_id !== ac); }).join('\n'))
      .toContain('verified links need a quote for every source');
    expect(errorsAfter((t) => { byId(t, ac).status = 'auto-verified'; }).join('\n')).toContain('auto-verified links need a quote');
    const d = draft();
    expect(errorsAfter((t) => { byId(t, d.id).status = 'auto-verified'; })).toEqual([]);
  });

  it('the grandfathered list never grows and points at real links', () => {
    expect(tables.grandfathered.length).toBeLessThanOrEqual(269);
    expect(errorsAfter((t) => { t.grandfathered.push({ link_id: 'nope/nowhere' }); }).join('\n')).toContain('link "nope/nowhere" is not on the Links sheet');
  });

  it('flags are from the list, and judgment flags block auto-verified', () => {
    expect(errorsAfter((t) => { byId(t, vc).flags = 'needs-tiem'; }).join('\n')).toContain('flag "needs-tiem" must be one of');
    const d = draft();
    for (const f of ['contested', 'real-world-model', 'needs-review'])
      expect(errorsAfter((t) => { const l = byId(t, d.id); l.status = 'auto-verified'; l.flags = f === 'real-world-model' ? 'real-world-model inferred-time' : f; l.confidence = 'low'; }).join('\n'))
        .toContain(`flag ${f} needs a human`);
  });

  it('inferred time is low confidence; a real-world model is inferred', () => {
    expect(errorsAfter((t) => { byId(t, vc).flags = 'inferred-time'; }).join('\n')).toContain('inferred-time links are low confidence');
    expect(errorsAfter((t) => { const l = byId(t, vc); l.flags = 'real-world-model'; }).join('\n')).toContain('add the inferred-time flag');
  });

  it('country pins say why nothing smaller was used', () => {
    expect(errorsAfter((t) => { byId(t, 'goldeneye-007/cuba').note = undefined; }).join('\n')).toContain('country pins are a last resort');
  });

  it('freeze and queue-in rows are checked', () => {
    expect(errorsAfter((t) => { t.freeze.push({ kind: 'genre', value: 'x' }); }).join('\n')).toContain('kind "genre" must be one of');
    expect(errorsAfter((t) => { t.freeze.push({ kind: 'series', value: 'nope' }); }).join('\n')).toContain('series "nope" is not on the Series sheet');
    expect(errorsAfter((t) => { t.queueIn.push({ title: '' }); }).join('\n')).toContain('title is empty');
  });

  it('auto-verified links reach the map, marked auto', () => {
    const t = structuredClone(tables);
    const d = byId(t, draft().id);
    d.status = 'auto-verified';
    const g = buildAtlas(t).games.find((x) => x.id === d.game_id)!;
    expect(g.links.some((l) => l.auto)).toBe(true);
    expect(buildAtlas(tables).games.flatMap((x) => x.links).some((l) => l.auto)).toBe(false);
  });
});
