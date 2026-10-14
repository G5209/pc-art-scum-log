import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const dir=path.resolve('test-results/screenshots/stage17');
async function login(page:Page){
 await page.goto('/login');
 await page.getByLabel('账号',{exact:true}).fill('admin');
 await page.getByLabel('密码',{exact:true}).fill('browser-test-only-password');
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await expect(page).not.toHaveURL(/\/login$/);
 if(new URL(page.url()).pathname==='/welcome')await page.getByRole('button',{name:'稍后配置',exact:true}).click();
}
async function shot(page:Page,name:string){fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,`${name}-${test.info().project.name}.png`),fullPage:await page.locator('.drawer').count()===0,animations:'disabled'});}

test('深色工作台、配色持久化、手机导航与键盘详情',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(!sessionStorage.getItem('theme-test-seeded')){localStorage.setItem('pc-theme','ivory');sessionStorage.setItem('theme-test-seeded','1');}});
 await login(page);await expect(page.locator('#kill-chart canvas')).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('data-theme','graphite');
 await shot(page,'仪表盘');
 if(test.info().project.name==='mobile'){
  await page.getByRole('button',{name:'展开导航',exact:true}).click();await expect(page.locator('.shell')).toHaveClass(/nav-open/);
  await page.locator('.main-nav a[href="/live"]').click();await expect(page).toHaveURL(/\/live$/);await expect(page.locator('.shell')).not.toHaveClass(/nav-open/);
 }
 await page.goto('/logs/lockpick');await expect(page.locator('.lockpick-card').first()).toBeVisible();
 expect(await page.locator('#event-table').innerText()).not.toMatch(/VeryEasy|LockpickingMinigame|actor_name/);
 await page.locator('.lockpick-card [data-event]').first().click();
 await expect(page.locator('#drawer')).toBeVisible();await expect(page.locator('#drawer details')).not.toHaveAttribute('open');
 expect(await page.locator('#drawer .metadata-list').first().innerText()).not.toMatch(/actor_name|elapsed_time_sec|VeryEasy/);
 await shot(page,'撬锁详情');await page.keyboard.press('Escape');await expect(page.locator('#drawer')).toHaveCount(0);
 await page.getByRole('button',{name:'切换配色',exact:true}).click();await page.locator('[data-theme="night"]').filter({has:page.locator('i')}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','night');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','night');
 expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('查询工具、筛选、错误状态与危险操作取消',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await login(page);
 for(const [route,marker] of [['/active?date=2026-10-06','#activity-chart'],['/relations?type=kill','#relations-chart'],['/reports?date=2026-10-06&period=daily','.report-grid'],['/notifications','#extra-content .panel'],['/stats','#daily-chart'],['/online','#online-page .online-summary']]){
  await page.goto(route);await expect(page.locator(marker)).toBeVisible();await expect(page.locator('#content .error-box')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await shot(page,route.split('?')[0].slice(1));
 }
 await page.goto('/notifications');await expect(page.locator('#extra-content .panel')).toBeVisible();
 await page.goto('/players');await page.locator('#player-filter input[name=q]').fill('没有这个测试玩家');await page.locator('#player-filter button').click();await expect(page.locator('#players-page')).toContainText('暂无符合条件的玩家');await expect(page).toHaveURL(/q=/);
 await page.goto('/settings');await expect(page.locator('#source-clear')).toBeVisible();
 let deleted=false;page.on('request',r=>{if(r.url().endsWith('/api/datasource')&&r.method()==='DELETE')deleted=true;});
 await page.locator('#source-clear').click();await expect(page.locator('dialog')).toBeVisible();await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);expect(deleted).toBe(false);
 await page.route('**/api/players?*',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'暂时无法加载玩家，请稍后重试'})}));await page.goto('/players');await expect(page.locator('.error-box')).toContainText('暂时无法加载玩家');
 expect(errors).toEqual([]);
});


test('全部日志菜单可进入，等待反馈与中文详情一致',async({page})=>{
 test.setTimeout(60000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await login(page);
 const routes=await page.locator('.sidebar a[href^="/logs/"]').evaluateAll(links=>links.map(x=>x.getAttribute('href')!));
 expect(routes.length).toBeGreaterThan(15);
 for(const route of routes){
  await page.goto(route);await expect(page.locator('#event-total')).not.toContainText('加载中');
  await expect(page.locator('#event-table')).not.toBeEmpty();await expect(page.locator('#content .error-box')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.goto('/settings');await expect(page.locator('#source-clear')).toBeVisible();
 let release:()=>void=()=>{};const waiting=new Promise<void>(r=>{release=r;});
 await page.route('**/api/datasource/test',async route=>{await waiting;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({message:'连接测试完成'})});});
 await page.locator('#source-test').click();await expect(page.locator('#source-test')).toBeDisabled();await expect(page.locator('#source-result')).toContainText('正在处理');release();await expect(page.locator('#source-test')).toBeEnabled();await expect(page.locator('#source-result')).toContainText('连接测试完成');
 await shot(page,'设置');
 await page.goto('/live');await expect(page.locator('#live-list .event-row').first()).toBeVisible();await shot(page,'实时事件');
 expect(errors).toEqual([]);
});
