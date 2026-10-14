import { test, expect } from '@playwright/test';

test('实时与可视化页面保持可用', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/login');
  await page.getByLabel('账号', { exact: true }).fill('admin');
  await page.getByLabel('密码', { exact: true }).fill('browser-test-only-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);

  await page.goto('/live');
  await expect(page.getByRole('heading', { name: '事件流', exact: true })).toBeVisible();
  await expect(page.locator('#live-list')).toBeVisible();
  await page.goto('/online');
  await expect(page.getByRole('heading', { name: '现在在线', exact: true })).toBeVisible();
  await page.goto('/map');
  await expect(page.locator('.map-grid')).toBeVisible();
  await page.goto('/stats');
  await expect(page.getByRole('heading', { name: '看见变化', exact: true })).toBeVisible();

  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
