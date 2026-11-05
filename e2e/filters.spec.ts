import { test, expect } from '@playwright/test';
import { atlas, filters, expectedTitles, undatedTitles, open, listedCount, listedTitles, ALL_ROLES, DEFAULT_ROLES } from './helpers.ts';
import type { Role } from '../src/types.ts';


test('default view lists exactly the games the filter logic selects, without errors', async ({ page }) => {
  const errors = await open(page);
  expect(await listedTitles(page)).toEqual(expectedTitles(atlas(), filters()));
  expect(errors).toEqual([]);
});

test('undated games are named in the panel but never on the timeline', async ({ page }) => {
  const undated = undatedTitles(atlas());
  test.skip(!undated.length, 'no undated verified games in the data');
  await open(page);
  const note = page.locator('#list .note');
  for (const t of undated) await expect(note).toContainText(t);
  expect(await listedTitles(page)).not.toEqual(expect.arrayContaining([undated[0]]));
});

test('strategy and sandbox games appear only with their switch on', async ({ page }) => {
  await open(page);
  await page.locator('#strategy').check();
  expect(await listedTitles(page)).toEqual(expectedTitles(atlas(), filters({ showStrategy: true })));
  await expect(page).toHaveURL(/strategy=1/);
});

test('venues chip is off by default and adds venue games when switched on', async ({ page }) => {
  await open(page);
  const chip = page.locator('.chip[data-kind=arena]');
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  const roles = new Set<Role>([...DEFAULT_ROLES, 'arena']);
  expect(await listedTitles(page)).toEqual(expectedTitles(atlas(), filters({ roles })));
});

test('each role chip count matches the data', async ({ page }) => {
  await open(page);
  for (const role of ['setting', 'level', 'arena', 'inspiration'] as Role[]) {
    const n = expectedTitles(atlas(), filters({ roles: new Set([role]) })).length;
    await expect(page.locator(`.chip[data-kind=${role}] .chip-n`)).toHaveText(String(n));
  }
});

test('hiding approximate locations removes games that only have approximate pins', async ({ page }) => {
  await open(page);
  await page.locator('#coarse').uncheck();
  expect(await listedTitles(page)).toEqual(expectedTitles(atlas(), filters({ showCoarse: false })));
  await expect(page).toHaveURL(/coarse=0/);
});

test('all roles and switches together list every timeline game', async ({ page }) => {
  await open(page, 'roles=setting,level,arena,inspiration&strategy=1');
  expect(await listedCount(page)).toBe(expectedTitles(atlas(), filters({ roles: ALL_ROLES, showStrategy: true })).length);
});
