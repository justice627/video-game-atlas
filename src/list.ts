import type { Hit } from './filter.ts';
import { byGame } from './filter.ts';
import { formatSpan } from './timeline.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderList(root: HTMLElement, count: HTMLElement, hits: Hit[], onPick: (hits: Hit[]) => void) {
  const groups = [...byGame(hits)];
  const places = new Set(hits.map((h) => `${h.placement.lat},${h.placement.lon}`)).size;
  count.textContent = `${groups.length} game${groups.length === 1 ? '' : 's'} · ${places} place${places === 1 ? '' : 's'}`;
  count.dataset.games = String(groups.length);
  if (!groups.length) {
    root.innerHTML = '<p class="empty">No games in this range with these filters. Widen the timeline or turn on more kinds.</p>';
    return;
  }
  root.innerHTML = groups.map(([game, gh], i) => {
    const spans = [...new Map(gh.flatMap((h) => h.matched).map((s) => [`${s.from}:${s.to}`, s])).values()]
      .sort((a, b) => a.from - b.from);
    const where = [...new Set(gh.map((h) => h.placement.fictionalName ?? h.placement.place))];
    return `<li><button type="button" data-i="${i}">
      <span class="li-title">${esc(game.title)}</span>
      <span class="li-meta">${spans.slice(0, 3).map(formatSpan).join(', ')}${spans.length > 3 ? '…' : ''}</span>
      <span class="li-where">${esc(where.slice(0, 4).join(', '))}${where.length > 4 ? ` +${where.length - 4}` : ''}</span>
    </button></li>`;
  }).join('');
  root.querySelectorAll<HTMLButtonElement>('button[data-i]').forEach((b) =>
    b.addEventListener('click', () => onPick(groups[Number(b.dataset.i)][1])),
  );
}
