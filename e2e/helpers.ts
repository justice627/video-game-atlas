import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import type { Atlas, Role } from '../src/types.ts';
import { ROLES, DEFAULT_ROLES as APP_DEFAULT_ROLES } from '../src/types.ts';
import { visiblePlacements, byGame, undatedGames, type Filters } from '../src/filter.ts';
import { MIN_YEAR, MAX_YEAR, type Range } from '../src/timeline.ts';

/** The data the build just wrote; expectations are computed from it, never hard-coded. */
export const atlas = (): Atlas => JSON.parse(readFileSync(new URL('../public/atlas.json', import.meta.url), 'utf8'));

/** Mirrors the page's defaults (src/main.ts): venues and strategy off, approximate pins on, all of time. */
export const DEFAULT_ROLES: Role[] = APP_DEFAULT_ROLES;
export function filters(o: Partial<Filters> = {}): Filters {
  return { range: { from: MIN_YEAR, to: MAX_YEAR }, roles: new Set(DEFAULT_ROLES), showCoarse: true, showStrategy: false, showUndated: false, ...o };
}
export const ALL_ROLES = new Set<Role>(ROLES);

/** Game titles the list should show for these filters, by the app's own filter logic. */
export function expectedTitles(data: Atlas, f: Filters): string[] {
  return [...byGame(visiblePlacements(data.games, f)).keys()].map((g) => g.title).sort();
}
export const undatedTitles = (data: Atlas) => undatedGames(data.games).map((g) => g.title);
export const range = (from: number, to: number): Range => ({ from, to });

/**
 * Blocks basemap tiles, styles and fonts so tests never depend on OpenFreeMap: the page falls
 * back to a plain background. Collects page errors and console errors, minus network noise.
 */
export async function open(page: Page, hash = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|AJAXError|openfreemap/i.test(m.text())) errors.push(m.text()); });
  await page.route(/tiles\.openfreemap\.org/, (r) => r.abort());
  await page.goto('/' + (hash ? `#${hash}` : ''));
  await expect(page.locator('#count')).toHaveAttribute('data-games', /\d+/);
  // The map's data layer runs in a worker; if it fails to start, the map never settles.
  await expect(page.locator('#map')).toHaveAttribute('data-map-ready', '1', { timeout: 15_000 });
  return errors;
}

export const listedCount = async (page: Page) => Number(await page.locator('#count').getAttribute('data-games'));
export async function listedTitles(page: Page): Promise<string[]> {
  return (await page.locator('#list .li-title').allInnerTexts()).map((t) => t.replace(/\s*\(\d{4}\)$/, '').trim()).sort();
}
/**
 * Waits for the list to show exactly these titles. The page renders the list in the next
 * animation frame after a filter change (src/main.ts, update()), while controls such as the
 * timeline label update at once, so a single read right after a change can see the old list.
 */
export async function expectListed(page: Page, titles: string[]) {
  await expect.poll(() => listedTitles(page)).toEqual(titles);
}
