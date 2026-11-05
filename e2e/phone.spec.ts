import { test, expect } from '@playwright/test';
import { open } from './helpers.ts';

test('phone layout has no horizontal scroll and shows map, timeline and list', async ({ page }) => {
  const errors = await open(page, 'from=1500&to=1800');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  for (const sel of ['#map', '#timeline', '#list']) await expect(page.locator(sel)).toBeVisible();
  expect(errors).toEqual([]);
});
