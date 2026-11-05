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
