import { test, expect } from '@playwright/test';
import { atlas, filters, expectedTitles, open, listedTitles, range } from './helpers.ts';
import { PRESETS } from '../src/timeline.ts';


for (const p of PRESETS) {
  test(`preset "${p.label}" lists the games set in ${p.range.from}–${p.range.to}`, async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: p.label, exact: true }).click();
    expect(await listedTitles(page)).toEqual(expectedTitles(atlas(), filters({ range: p.range })));
  });
}

test('a range in the URL is restored on load and on a pasted hash', async ({ page }) => {
  await open(page, 'from=1500&to=1600');
  await expect(page.locator('.tl-value')).toHaveText('1500 – 1600');
  expect(await listedTitles(page)).toEqual(expectedTitles(atlas(), filters({ range: range(1500, 1600) })));
  await page.evaluate(() => { location.hash = 'from=1900&to=1950'; });
  await expect(page.locator('.tl-value')).toHaveText('1900 – 1950');
  expect(await listedTitles(page)).toEqual(expectedTitles(atlas(), filters({ range: range(1900, 1950) })));
});

test('the timeline knobs work from the keyboard', async ({ page }) => {
  await open(page);
  await page.locator('.tl-lo').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('PageUp');
  await expect(page.locator('.tl-value')).not.toHaveText(/^13\.8 bn BCE/);
  await expect(page).toHaveURL(/from=/);
});
