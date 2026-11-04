import type { Hit } from './filter.ts';
import { byGame } from './filter.ts';
import type { Game } from './types.ts';
import { formatSpan } from './timeline.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderList(root: HTMLElement, count: HTMLElement, hits: Hit[], undated: Game[], onPick: (hits: Hit[]) => void) {
  const groups = [...byGame(hits)];
  const places = new Set(hits.map((h) => `${h.link.lat},${h.link.lon}`)).size;
  count.textContent = `${groups.length} game${groups.length === 1 ? '' : 's'} · ${places} place${places === 1 ? '' : 's'}`;
  count.dataset.games = String(groups.length);
  const undatedNote = undated.length
    ? `<p class="note">Not on the timeline yet (no sourced date): ${undated.map((g) => esc(g.title)).join(', ')}.</p>`
    : '';
  if (!groups.length) {
    root.innerHTML = `<p class="empty">No verified games in this range with these filters.</p>${undatedNote}`;
    return;
  }
  root.innerHTML = groups.map(([game, gh], i) => {
    const spans = [...new Map(gh.filter((h) => h.matched).map((h) => [`${h.matched!.from}:${h.matched!.to}`, h.matched!])).values()]
      .sort((a, b) => a.from - b.from);
    const when = spans.length ? spans.slice(0, 3).map(formatSpan).join(', ') + (spans.length > 3 ? '…' : '') : 'Across eras';
    const where = [...new Set(gh.map((h) => h.link.fictionalName ?? h.link.place))];
    return `<li><button type="button" data-i="${i}">
      <span class="li-title">${esc(game.title)}</span>
      <span class="li-meta">${when}</span>
      <span class="li-where">${esc(where.slice(0, 4).join(', '))}${where.length > 4 ? ` +${where.length - 4}` : ''}</span>
    </button></li>`;
  }).join('') + (undatedNote ? `<li>${undatedNote}</li>` : '');
  root.querySelectorAll<HTMLButtonElement>('button[data-i]').forEach((b) =>
    b.addEventListener('click', () => onPick(groups[Number(b.dataset.i)][1])),
  );
}
