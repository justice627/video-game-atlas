import './style.css';
import type { Atlas, Kind } from './types.ts';
import { KINDS, KIND_LABEL } from './types.ts';
import { mountTimeline, MIN_YEAR, MAX_YEAR, type Range } from './timeline.ts';
import { visiblePlacements, type Filters } from './filter.ts';
import { mountMap, KIND_COLOR } from './map.ts';
import { renderList } from './list.ts';

function readHash(): Filters {
  const q = new URLSearchParams(location.hash.slice(1));
  const num = (k: string, d: number) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : d);
  const kinds = q.get('kinds')?.split(',').filter((k): k is Kind => KINDS.includes(k as Kind));
  let range: Range = { from: num('from', MIN_YEAR), to: num('to', MAX_YEAR) };
  if (range.from > range.to) range = { from: range.to, to: range.from };
  return { range, kinds: new Set(kinds?.length ? kinds : KINDS), showCoarse: q.get('coarse') !== '0' };
}

function writeHash(f: Filters) {
  const q = new URLSearchParams();
  if (f.range.from !== MIN_YEAR) q.set('from', String(f.range.from));
  if (f.range.to !== MAX_YEAR) q.set('to', String(f.range.to));
  if (f.kinds.size !== KINDS.length) q.set('kinds', [...f.kinds].join(','));
  if (!f.showCoarse) q.set('coarse', '0');
  history.replaceState(null, '', q.size ? `#${q}` : location.pathname + location.search);
}

async function main() {
  const atlas = (await (await fetch(`${import.meta.env.BASE_URL}atlas.json`)).json()) as Atlas;
  const filters = readHash();
  const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;

  const map = mountMap($('#map'));
  const chips = $('#kinds');
  chips.innerHTML = KINDS.map((k) => `<button type="button" class="chip" data-kind="${k}">
      <span class="dot" style="background:${KIND_COLOR[k]}"></span>${KIND_LABEL[k]}<span class="chip-n"></span></button>`).join('');
  const coarse = $<HTMLInputElement>('#coarse');
  coarse.checked = filters.showCoarse;
  $('#meta').textContent = `${atlas.games.length} games · Wikidata snapshot ${atlas.wikidataFetched}`;

  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const hits = visiblePlacements(atlas.games, filters);
      map.setHits(hits);
      renderList($('#list'), $('#count'), hits, (gh) => map.focus(gh));
      // Per-kind counts ignore the kind filter itself so you can see what turning one on would add.
      const all = visiblePlacements(atlas.games, { ...filters, kinds: new Set(KINDS) });
      chips.querySelectorAll<HTMLButtonElement>('.chip').forEach((c) => {
        const k = c.dataset.kind as Kind;
        c.setAttribute('aria-pressed', String(filters.kinds.has(k)));
        c.querySelector('.chip-n')!.textContent = String(new Set(all.filter((h) => h.placement.kind === k).map((h) => h.game)).size);
      });
      writeHash(filters);
    });
  };

  const timeline = mountTimeline($('#timeline'), filters.range, (r) => { filters.range = r; update(); });
  // A pasted link with a different hash does not reload the page; re-read it.
  window.addEventListener('hashchange', () => {
    Object.assign(filters, readHash());
    coarse.checked = filters.showCoarse;
    timeline.set(filters.range);
  });
  chips.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
    if (!c) return;
    const k = c.dataset.kind as Kind;
    if (filters.kinds.has(k)) filters.kinds.delete(k); else filters.kinds.add(k);
    update();
  });
  coarse.addEventListener('change', () => { filters.showCoarse = coarse.checked; update(); });
  update();
}

main().catch((e) => {
  console.error(e);
  document.querySelector('#list')!.innerHTML = `<p class="empty">Could not load the atlas data.</p>`;
});
