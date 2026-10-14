import { test, expect, type Page } from '@playwright/test';

const password = 'browser-test-only-password';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('账号', { exact: true }).fill('admin');
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  if(new URL(page.url()).pathname==='/welcome')await page.getByRole('button',{name:'稍后配置',exact:true}).click();
}

test('原生中文页面核心流程', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await login(page);
  await expect(page.getByRole('heading', { name: '服务器总览', exact: true })).toBeVisible();
  await expect(page.locator('#kill-chart')).toBeVisible();
  await expect(page.locator('#type-chart')).toBeVisible();

  for (const route of ['/logs/login', '/logs/kill', '/logs/chat', '/live', '/online', '/map', '/stats', '/settings']) {
    await page.goto(route);
    await expect(page.locator('body')).not.toBeEmpty();
  }

  await page.goto('/map');
  await expect(page.locator('.map-canvas img')).toBeVisible();
  await page.goto('/live');
  await expect(page.locator('#live-status')).toBeVisible();
  await page.screenshot({ path: `test-results/native-${test.info().project.name}.png`, fullPage: true });

  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('未知路径回退与页面骨架', async ({ page }) => {
  await login(page);
  await page.goto('/does-not-exist');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.shell')).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).some((key) => /cat|daju|miao/i.test(key)))).toBe(false);
});
