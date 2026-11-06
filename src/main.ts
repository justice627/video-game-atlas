import './style.css';
import type { Atlas, Role } from './types.ts';
import { ROLES, ROLE_LABEL, DEFAULT_ROLES } from './types.ts';
import { mountTimeline, MIN_YEAR, MAX_YEAR, type Range } from './timeline.ts';
import { visiblePlacements, undatedGames, undatedShown, isStrategyLike, groupEntries, type Filters } from './filter.ts';
import { mountMap, ROLE_COLOR } from './map.ts';
import { renderList } from './list.ts';

/** Strategy is controlled by its own switch, not a chip. */
const CHIP_ROLES: Role[] = ROLES.filter((r) => r !== 'strategy');
/** Role names in links shared before the 2026-11 taxonomy (setting, arena; inspiration is now a depiction). */
const OLD_ROLES: Record<string, Role> = { setting: 'world', arena: 'venue' };
const sameSet = (a: Set<Role>, b: Role[]) => a.size === b.length && b.every((r) => a.has(r));

function readHash(): Filters {
  const q = new URLSearchParams(location.hash.slice(1));
  const num = (k: string, d: number) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  const roles = [...new Set(q.get('roles')?.split(',').map((k) => OLD_ROLES[k] ?? k).filter((k): k is Role => CHIP_ROLES.includes(k as Role)))];
  let range: Range = { from: num('from', MIN_YEAR), to: num('to', MAX_YEAR) };
  if (range.from > range.to) range = { from: range.to, to: range.from };
  return { range, roles: new Set(q.has('roles') ? roles : DEFAULT_ROLES), showCoarse: q.get('coarse') !== '0', showStrategy: q.get('strategy') === '1', showUndated: q.get('undated') === '1' };
}

let collapse = new URLSearchParams(location.hash.slice(1)).get('series') === '1';

function writeHash(f: Filters) {
  const q = new URLSearchParams();
  if (collapse) q.set('series', '1');
  if (f.range.from !== MIN_YEAR) q.set('from', String(f.range.from));
  if (f.range.to !== MAX_YEAR) q.set('to', String(f.range.to));
  if (!sameSet(f.roles, DEFAULT_ROLES)) q.set('roles', [...f.roles].join(','));
  if (!f.showCoarse) q.set('coarse', '0');
  if (f.showStrategy) q.set('strategy', '1');
  if (f.showUndated) q.set('undated', '1');
  history.replaceState(null, '', q.size ? `#${q}` : location.pathname + location.search);
}

async function main() {
  const atlas = (await (await fetch(`${import.meta.env.BASE_URL}atlas.json`)).json()) as Atlas;
  const filters = readHash();
  const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;

  const seriesById = new Map(atlas.series.map((s) => [s.id, s.name]));
  const seriesName = (id: string) => seriesById.get(id);
  const map = mountMap($('#map'), seriesName, atlas.logos);
  const group = $<HTMLInputElement>('#group');
  const chips = $('#kinds');
  chips.innerHTML = CHIP_ROLES.map((r) => `<button type="button" class="chip" data-kind="${r}">
      <span class="dot" style="background:${ROLE_COLOR[r]}"></span>${ROLE_LABEL[r]}<span class="chip-n"></span></button>`).join('');
  const coarse = $<HTMLInputElement>('#coarse');
  const strategy = $<HTMLInputElement>('#strategy');
  const showUndated = $<HTMLInputElement>('#undated');
  const strategyCount = atlas.games.filter((g) => g.links.some(isStrategyLike)).length;
  $('#strategy-n').textContent = String(strategyCount);
  const undated = undatedGames(atlas.games);
  $('#undated-n').textContent = String(undated.length);
  $('#meta').textContent = `${atlas.games.length} verified game${atlas.games.length === 1 ? '' : 's'}`;

  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      coarse.checked = filters.showCoarse;
      strategy.checked = filters.showStrategy;
      showUndated.checked = filters.showUndated;
      group.checked = collapse;
      const hits = visiblePlacements(atlas.games, filters);
      map.setHits(groupEntries(hits, collapse));
      renderList($('#list'), $('#count'), hits, undatedShown(filters) ? [] : undated, (gh) => map.focus(gh), { collapse, seriesName, logos: atlas.logos });
      // Per-role counts ignore the role filter itself, so you can see what turning one on would add.
      const all = visiblePlacements(atlas.games, { ...filters, roles: new Set(ROLES) });
      chips.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) => {
        const r = c.dataset.kind as Role;
        c.setAttribute('aria-pressed', String(filters.roles.has(r)));
        c.querySelector('.chip-n')!.textContent = String(new Set(all.filter((h) => h.link.role === r).map((h) => h.game)).size);
      });
      writeHash(filters);
    });
  };

  const timeline = mountTimeline($('#timeline'), filters.range, (r) => { filters.range = r; update(); });
  window.addEventListener('hashchange', () => {
    Object.assign(filters, readHash());
    collapse = new URLSearchParams(location.hash.slice(1)).get('series') === '1';
    timeline.set(filters.range);
    update();
  });
  chips.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
    if (!c) return;
    const r = c.dataset.kind as Role;
    if (filters.roles.has(r)) filters.roles.delete(r); else filters.roles.add(r);
    update();
  });
  coarse.addEventListener('change', () => { filters.showCoarse = coarse.checked; update(); });
  strategy.addEventListener('change', () => { filters.showStrategy = strategy.checked; update(); });
  showUndated.addEventListener('change', () => { filters.showUndated = showUndated.checked; update(); });
  group.addEventListener('change', () => { collapse = group.checked; update(); });
  update();
}

main().catch((e) => {
  console.error(e);
  document.querySelector('#list')!.innerHTML = `<p class="empty">Could not load the atlas data.</p>`;
});
