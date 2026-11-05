import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { open } from './helpers.ts';

// A fixed two-game series sharing one stadium under two names (see fixtures/series-atlas.json),
// so the grouping is tested independently of what the real data holds.
const fixture = readFileSync(new URL('./fixtures/series-atlas.json', import.meta.url), 'utf8');

test.beforeEach(async ({ page }) => {
  await page.route('**/atlas.json', (r) => r.fulfill({ contentType: 'application/json', body: fixture }));
});

test('grouping by series nests games and merges a shared stadium into one popup', async ({ page }) => {
  // Old role names in the URL (before the 2026-11 taxonomy) still work: setting -> world, arena -> venue.
  const errors = await open(page, 'roles=setting,level,arena,inspiration');
  await expect(page.locator('#count')).toHaveAttribute('data-games', '3');
  await page.locator('#group').check();
  await expect(page).toHaveURL(/series=1/);
  const row = page.locator('#list li.series');
  await expect(row).toContainText('FIFA (fixture)');
  await expect(row).toContainText('2 games');
  await expect(page.locator('#list li.nested')).toHaveCount(2);

  await row.locator('> button').click();
  const popup = page.locator('.maplibregl-popup');
  await expect(popup).toContainText('(2 games)');
  await expect(popup).toContainText('as "Amsterdam ArenA"');
  await expect(popup).toContainText('Fixture FIFA 20');

  await page.locator('#group').uncheck();
  await expect(page.locator('#list li.nested')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('venue games stay hidden until the venues chip is on', async ({ page }) => {
  await open(page);
  await expect(page.locator('#count')).toHaveAttribute('data-games', '1');
  await expect(page.locator('.chip[data-kind=venue] .chip-n')).toHaveText('2');
});
