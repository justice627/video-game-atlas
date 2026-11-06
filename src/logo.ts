// Logos in popups and the list (docs/data-rules.md, section 8). Pure: no DOM or MapLibre, so tests run it in Node.
import type { Atlas, Logo } from './types.ts';

export type Logos = NonNullable<Atlas['logos']>;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A game's own logo, else its series' logo. */
export const gameLogo = (logos: Logos | undefined, g: { id: string; series?: string }): Logo | undefined =>
  logos?.games[g.id] ?? (g.series ? logos?.series[g.series] : undefined);

export const credit = (l: Logo) => `Logo via Wikimedia Commons: ${l.licence}${l.author ? `, ${l.author}` : ''}`;

/**
 * The logo image on a plate that keeps it readable in either theme. In popups it links to its Commons
 * file page (attribution); in the list it sits inside a button, so it carries the credit as a tooltip only.
 */
export function logoHtml(l: Logo | undefined, name: string, o: { base: string; link: boolean; cls: string }): string {
  if (!l) return '';
  const img = `<img src="${esc(o.base + l.src)}" alt="${esc(name)} logo" loading="lazy" decoding="async">`;
  const attrs = `class="logo ${o.cls}" data-tone="${l.tone ?? 'opaque'}" title="${esc(credit(l))}"`;
  return o.link
    ? `<a ${attrs} href="${esc(l.page)}" target="_blank" rel="noopener">${img}</a>`
    : `<span ${attrs}>${img}</span>`;
}
