import {test,expect} from '@playwright/test';
test('gameplay 子页面独立，旧链接保留筛选，物主不冒充执行者',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/login');await page.getByLabel('账号',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('browser-test-only-password');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page).not.toHaveURL(/\/login$/);
 for(const key of ['lockpick','disarm','bunker-minigame','chest','trap','territory','bunker-state','gameplay-other']){
  await page.goto('/logs/'+key);await expect(page.locator('#event-total')).not.toContainText('加载中');await expect(page.locator('#event-table .error-box')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(key==='territory')await expect(page.locator('#event-table')).toContainText('未记录执行者');
  if(key==='bunker-state')await expect(page.locator('#event-table')).toContainText('距下次激活');
 }
 await page.goto('/logs/gameplay?q=stage16-no-match&pageSize=10');await expect(page).toHaveURL(/\/logs\/gameplay-other\?/);await expect(page.locator('#event-total')).not.toContainText('加载中');expect(new URL(page.url()).searchParams.get('q')).toBe('stage16-no-match');await expect(page.locator('#event-table .empty')).toBeVisible();
 expect(errors).toEqual([]);
});
