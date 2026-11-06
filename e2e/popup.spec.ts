import { test, expect } from '@playwright/test';
import { atlas, filters, open } from './helpers.ts';
import { visiblePlacements } from '../src/filter.ts';


test('choosing a game in the list opens a popup with its place, period and sources', async ({ page }) => {
  const hit = visiblePlacements(atlas().games, filters()).find((h) => h.link.span && !h.link.bbox);
  test.skip(!hit, 'no dated verified game in the default view');
  const errors = await open(page);
  await page.locator('#list button', { hasText: hit!.game.title }).first().click();
  const popup = page.locator('.maplibregl-popup');
  await expect(popup).toContainText(hit!.game.title);
  await expect(popup).toContainText(/confidence/);
  await expect(popup.locator('a[href^="http"]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('a game with a logo shows it in the list and in its popup, linked to Commons', async ({ page }) => {
  const data = atlas();
  const hit = visiblePlacements(data.games, filters()).find((h) => !h.link.bbox && data.logos?.games[h.game.id]);
  test.skip(!hit, 'no game with its own logo in the default view');
  const errors = await open(page);
  const row = page.locator('#list button', { hasText: hit!.game.title }).first();
  await expect(row.locator('img')).toHaveAttribute('src', new RegExp(data.logos!.games[hit!.game.id].src));
  await row.click();
  const logo = page.locator('.maplibregl-popup a.pop-logo').first();
  await expect(logo).toHaveAttribute('href', /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
  expect(await logo.locator('img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.fineprint')).toContainText('not affiliated');
  expect(errors).toEqual([]);
});
