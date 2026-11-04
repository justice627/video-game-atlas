import './style.css';
import type { Atlas, Role } from './types.ts';
import { ROLES, ROLE_LABEL } from './types.ts';
import { mountTimeline, MIN_YEAR, MAX_YEAR, type Range } from './timeline.ts';
import { visiblePlacements, undatedGames, isStrategyLike, type Filters } from './filter.ts';
import { mountMap, ROLE_COLOR } from './map.ts';
import { renderList } from './list.ts';

/** Strategy is controlled by its own switch, not a chip. */
const CHIP_ROLES: Role[] = ROLES.filter((r) => r !== 'strategy');

function readHash(): Filters {
  const q = new URLSearchParams(location.hash.slice(1));
  const num = (k: string, d: number) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  const roles = q.get('roles')?.split(',').filter((k): k is Role => CHIP_ROLES.includes(k as Role));
  let range: Range = { from: num('from', MIN_YEAR), to: num('to', MAX_YEAR) };
  if (range.from > range.to) range = { from: range.to, to: range.from };
  return { range, roles: new Set(roles?.length ? roles : CHIP_ROLES), showCoarse: q.get('coarse') !== '0', showStrategy: q.get('strategy') === '1' };
}

function writeHash(f: Filters) {
  const q = new URLSearchParams();
  if (f.range.from !== MIN_YEAR) q.set('from', String(f.range.from));
  if (f.range.to !== MAX_YEAR) q.set('to', String(f.range.to));
  if (f.roles.size !== CHIP_ROLES.length) q.set('roles', [...f.roles].join(','));
  if (!f.showCoarse) q.set('coarse', '0');
  if (f.showStrategy) q.set('strategy', '1');
  history.replaceState(null, '', q.size ? `#${q}` : location.pathname + location.search);
}

async function main() {
  const atlas = (await (await fetch(`${import.meta.env.BASE_URL}atlas.json`)).json()) as Atlas;
  const filters = readHash();
  const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;

  const map = mountMap($('#map'));
  const chips = $('#kinds');
  chips.innerHTML = CHIP_ROLES.map((r) => `<button type="button" class="chip" data-kind="${r}">
      <span class="dot" style="background:${ROLE_COLOR[r]}"></span>${ROLE_LABEL[r]}<span class="chip-n"></span></button>`).join('');
  const coarse = $<HTMLInputElement>('#coarse');
  const strategy = $<HTMLInputElement>('#strategy');
  const strategyCount = atlas.games.filter((g) => g.links.some(isStrategyLike)).length;
  $('#strategy-n').textContent = String(strategyCount);
  const undated = undatedGames(atlas.games);
  $('#meta').textContent = `${atlas.games.length} verified game${atlas.games.length === 1 ? '' : 's'}`;

  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      coarse.checked = filters.showCoarse;
      strategy.checked = filters.showStrategy;
      const hits = visiblePlacements(atlas.games, filters);
      map.setHits(hits);
      renderList($('#list'), $('#count'), hits, undated, (gh) => map.focus(gh));
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
  window.addEventListener('hashchange', () => { Object.assign(filters, readHash()); timeline.set(filters.range); update(); });
  chips.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
    if (!c) return;
    const r = c.dataset.kind as Role;
    if (filters.roles.has(r)) filters.roles.delete(r); else filters.roles.add(r);
    update();
  });
  coarse.addEventListener('change', () => { filters.showCoarse = coarse.checked; update(); });
  strategy.addEventListener('change', () => { filters.showStrategy = strategy.checked; update(); });
  update();
}

main().catch((e) => {
  console.error(e);
  document.querySelector('#list')!.innerHTML = `<p class="empty">Could not load the atlas data.</p>`;
});
