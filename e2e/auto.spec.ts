import { test, expect } from '@playwright/test';
import { open, listedTitles } from './helpers.ts';

// Two games, one place each: one verified by hand, one auto-verified (it passed the gate only).
const link = (o: object) => ({ placeType: 'city', approxPlace: false, role: 'world', timeType: 'fixed', span: { from: 1986, to: 1986 }, sources: ['https://en.wikipedia.org/wiki/X'], confidence: 'medium', flags: [], ...o });
const atlas = {
  built: '2026-11-08', series: [],
  games: [
    { id: 'hand', title: 'Checked By Hand', links: [link({ place: 'Miami', lat: 25.77, lon: -80.19 })] },
    { id: 'auto', title: 'Auto Only', links: [link({ place: 'Lisbon', lat: 38.72, lon: -9.14, auto: true })] },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/atlas.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(atlas) }));
});

test('auto-verified places are shown by default, tagged, and can be switched off', async ({ page }) => {
  const errors = await open(page);
  await expect.poll(() => listedTitles(page)).toEqual(['Auto Only', 'Checked By Hand']);
  await expect(page.locator('#list li', { hasText: 'Auto Only' }).locator('.tag-auto')).toHaveText('auto');
  await expect(page.locator('#list li', { hasText: 'Checked By Hand' }).locator('.tag-auto')).toHaveCount(0);
  await expect(page.locator('#auto')).toBeChecked();
  await expect(page.locator('#auto-n')).toHaveText('1');

  await page.locator('#list li', { hasText: 'Auto Only' }).locator('button').click();
  await expect(page.locator('.maplibregl-popup')).toContainText('Auto-verified, not yet checked by hand');

  await page.locator('#auto').uncheck();
  await expect.poll(() => listedTitles(page)).toEqual(['Checked By Hand']);
  await expect(page).toHaveURL(/auto=0/);
  expect(errors).toEqual([]);
});
