import { describe, expect, it } from 'vitest';
import { readTables, type Tables } from '../scripts/lib/tables.ts';
import { buildAtlas, validate } from '../scripts/lib/dataset.ts';

const tables = readTables();
const clone = (): Tables => structuredClone(tables);
const link = (t: Tables, game: string) => t.links.find((l) => l.game_id === game)! as Tables['links'][number] & { _row: number };
const errorsAfter = (edit: (t: Tables) => void) => { const t = clone(); edit(t); return validate(t).join('\n'); };

describe('data/*.csv against docs/data-rules.md', () => {
  it('passes validation', () => expect(validate(tables)).toEqual([]));

  it('shows only verified links', () => {
    const atlas = buildAtlas(tables);
    expect(atlas.games.some((g) => g.id === 'fifa-world-cup-2010')).toBe(false); // all draft
    const t = clone();
    t.links.filter((l) => l.game_id === 'fifa-world-cup-2010').forEach((l) => (l.status = 'verified'));
    expect(buildAtlas(t).games.find((g) => g.id === 'fifa-world-cup-2010')!.links).toHaveLength(10);
  });

  it('places without coordinates use their parent, marked approximate', () => {
    const h3 = buildAtlas(tables).games.find((g) => g.id === 'hitman-3')!;
    const carp = h3.links.find((l) => l.place === 'Romanian Carpathians')!;
    expect([carp.lat, carp.lon, carp.approxPlace]).toEqual([46, 25, true]);
  });

  it('enforces the rules, naming the row', () => {
    const vc = link(tables, 'gta-vice-city');
    expect(errorsAfter((t) => { link(t, 'gta-vice-city').fictional_name = undefined; }))
      .toContain(`Links row ${vc._row}: role inspiration needs a fictional_name`);
    expect(errorsAfter((t) => { link(t, 'gta-vice-city').sources = undefined; })).toContain('at least one source URL is required');
    expect(errorsAfter((t) => { link(t, 'hitman-3').flags = undefined; })).toContain('undated links must carry the needs-time flag');
    expect(errorsAfter((t) => { link(t, 'assassins-creed-ii').time_type = 'era'; })).toContain('time_type era needs an era_id');
    expect(errorsAfter((t) => { t.places[0].wikidata = undefined; })).toContain('needs a wikidata or geonames id');
    expect(errorsAfter((t) => { link(t, 'gta-vice-city').place_id = 'atlantis'; })).toContain('place_id "atlantis" is not on the Places sheet');
    expect(errorsAfter((t) => { link(t, 'gta-vice-city').status = 'excluded'; link(t, 'gta-vice-city').note = undefined; })).toContain('excluded links need the reason');
  });
});
