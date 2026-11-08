import type { Hit } from './filter.ts';
import { byGame } from './filter.ts';
import type { Game } from './types.ts';
import { formatSpan } from './timeline.ts';
import { gameLogo, logoHtml, type Logos } from './logo.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface ListOptions {
  /** Nest games under their series. */
  collapse: boolean;
  seriesName: (id: string) => string | undefined;
  logos?: Logos;
}

const LIST_LOGO = { base: import.meta.env.BASE_URL, link: false, cls: 'li-logo' };
/** A fixed-size slot, empty when there is no logo, so titles line up. */
const slot = (html: string) => `<span class="li-logo-slot">${html}</span>`;

function when(hits: Hit[]): string {
  const spans = [...new Map(hits.filter((h) => h.matched).map((h) => [`${h.matched!.from}:${h.matched!.to}`, h.matched!])).values()]
    .sort((a, b) => a.from - b.from);
  if (spans.length) return spans.slice(0, 3).map(formatSpan).join(', ') + (spans.length > 3 ? '…' : '');
  return hits.every((h) => h.link.timeType === 'undated') ? 'Undated' : 'Across eras';
}
function where(hits: Hit[]): string {
  const w = [...new Set(hits.map((h) => h.link.fictionalName ?? h.link.place))];
  return esc(w.slice(0, 4).join(', ')) + (w.length > 4 ? ` +${w.length - 4}` : '');
}

export function renderList(root: HTMLElement, count: HTMLElement, hits: Hit[], undated: Game[], onPick: (hits: Hit[]) => void, opts: ListOptions) {
  const games = [...byGame(hits)];
  const places = new Set(hits.map((h) => h.link.placeWikidata ?? `${h.link.lat},${h.link.lon}`)).size;
  count.textContent = `${games.length} game${games.length === 1 ? '' : 's'} · ${places} place${places === 1 ? '' : 's'}`;
  count.dataset.games = String(games.length);
  const undatedNote = undated.length
    ? `<p class="note">Undated, shown under &ldquo;All time&rdquo; or with the undated switch: ${undated.map((g) => esc(g.title)).join(', ')}.</p>`
    : '';
  if (!games.length) {
    root.innerHTML = `<p class="empty">No verified games in this range with these filters.</p>${undatedNote}`;
    return;
  }
  const picks: Hit[][] = [];
  const AUTO_TAG = '<span class="tag-auto" title="Passed the automatic source checks; not yet checked by hand">auto</span>';
  const gameRow = ([game, gh]: [Game, Hit[]], nested = false) => {
    picks.push(gh);
    return `<li${nested ? ' class="nested"' : ''}><button type="button" data-i="${picks.length - 1}">
      ${slot(logoHtml(gameLogo(opts.logos, game), game.title, LIST_LOGO))}
      <span class="li-title">${esc(game.title)}${nested && game.year ? ` <span class="muted">(${game.year})</span>` : ''}</span>
      <span class="li-meta">${when(gh)}${gh.some((h) => h.link.auto) ? AUTO_TAG : ''}</span>
      <span class="li-where">${where(gh)}</span>
    </button></li>`;
  };

  let html = '';
  if (!opts.collapse) html = games.map((g) => gameRow(g)).join('');
  else {
    // Series in the order their first game appears; games without a series stay single rows.
    const groups = new Map<string, [Game, Hit[]][]>();
    for (const g of games) {
      const key = g[0].series ? `s:${g[0].series}` : `g:${g[0].id}`;
      groups.set(key, [...(groups.get(key) ?? []), g]);
    }
    for (const [key, members] of groups) {
      if (key.startsWith('g:') || members.length === 1) { html += gameRow(members[0]); continue; }
      const all = members.flatMap(([, gh]) => gh);
      picks.push(all);
      const name = opts.seriesName(key.slice(2)) ?? key.slice(2);
      html += `<li class="series"><button type="button" data-i="${picks.length - 1}">
        ${slot(logoHtml(opts.logos?.series[key.slice(2)], name, LIST_LOGO))}
        <span class="li-title">${esc(name)} <span class="muted">· ${members.length} games</span></span>
        <span class="li-meta">${when(all)}</span>
        <span class="li-where">${where(all)}</span>
      </button><ul>${[...members].sort((a, b) => (a[0].year ?? 0) - (b[0].year ?? 0)).map((m) => gameRow(m, true)).join('')}</ul></li>`;
    }
  }
  root.innerHTML = html + (undatedNote ? `<li>${undatedNote}</li>` : '');
  root.querySelectorAll<HTMLButtonElement>('button[data-i]').forEach((b) =>
    b.addEventListener('click', () => onPick(picks[Number(b.dataset.i)])),
  );
}
