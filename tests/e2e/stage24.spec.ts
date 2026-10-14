import {test,expect,type Page} from '@playwright/test';
async function login(page:Page){await page.goto('/login');await page.getByLabel('账号',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('browser-test-only-password');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page).not.toHaveURL(/\/login$/);if(new URL(page.url()).pathname==='/welcome')await page.getByRole('button',{name:'稍后配置',exact:true}).click();}
async function go(page:Page,path:string){await page.evaluate(path=>(window as any).eval(`go(${JSON.stringify(path)})`),path);}
test('dashboard blocks settle independently and a block can retry without replacing successful content',async({page})=>{
 await login(page);let fail=true;
 await page.route('**/api/stats/timeline?*',async r=>{await new Promise(resolve=>setTimeout(resolve,1000));if(fail)await r.fulfill({status:503,json:{error:'时间线暂时不可用'}});else await r.continue();});
 await go(page,'/');await expect(page.locator('#dash-events .event-row').first()).toBeVisible();await expect(page.locator('#num-active')).toBeAttached();await expect(page.locator('#dash-timeline .error-box')).toBeVisible();await expect(page.locator('#type-chart canvas')).toBeAttached();
 const content=await page.locator('#dash-events').innerHTML();fail=false;await page.locator('#dash-timeline [data-retry]').click();await expect(page.locator('#kill-chart canvas')).toBeAttached();expect(await page.locator('#dash-events').innerHTML()).toBe(content);
});
test('ten SPA visits connect, server close recovers within five seconds, leaving the page clears connections',async({page,request})=>{
 await login(page);
 for(let i=0;i<10;i++){await go(page,'/live');await expect(page.locator('#live-status')).toHaveText('实时连接已建立',{timeout:3000});await go(page,'/settings');expect(await page.evaluate(()=>(window as any).eval('!!(state.eventStream||state.eventRetry||state.eventPoll||state.eventWatch)'))).toBe(false);}
 await go(page,'/live');await expect(page.locator('#live-status')).toHaveText('实时连接已建立');const began=Date.now();await request.post('http://127.0.0.1:3199/__stage24/disconnect');await expect(page.locator('#live-status')).toContainText('实时连接失败');await expect(page.locator('#live-status')).toHaveText('实时连接已建立',{timeout:5000});expect(Date.now()-began).toBeLessThan(5000);
});
test('hung live connection falls back after three seconds without changing the list or scroll',async({page})=>{
 await login(page);let streams=0;
 await page.route('**/api/events/live',async r=>{streams++;await new Promise(resolve=>setTimeout(resolve,6500));await r.abort().catch(()=>{});});
 await go(page,'/live');await expect(page.locator('#live-list .event-row').first()).toBeVisible();const before=await page.locator('#live-list').innerHTML();await expect(page.locator('#live-status')).toContainText('实时连接失败',{timeout:4200});
 await page.evaluate(()=>window.scrollTo(0,300));const scroll=await page.evaluate(()=>window.scrollY);await page.waitForTimeout(5100);expect(await page.locator('#live-list').innerHTML()).toBe(before);expect(await page.evaluate(()=>window.scrollY)).toBe(scroll);expect(streams).toBeGreaterThan(1);
 await go(page,'/settings');expect(await page.evaluate(()=>(window as any).eval('state.eventPoll'))).toBe(null);
});
test('bootstrap outage displays an error and recovers automatically without losing the route',async({page})=>{
 await login(page);let fail=true;await page.route('**/api/**',r=>fail?r.abort('connectionrefused'):r.continue());
 await page.goto('/');await expect(page.locator('.boot-error')).toContainText('加载失败',{timeout:3000});fail=false;
 await expect(page.locator('#num-active')).toBeAttached({timeout:10000});await expect(page.locator('#kill-chart canvas')).toBeAttached();
});

test('a stalled dashboard block stops showing skeletons after three seconds',async({page})=>{
 await login(page);await page.route('**/api/stats/timeline?*',async r=>{await new Promise(resolve=>setTimeout(resolve,8500));await r.abort().catch(()=>{});});
 const began=Date.now();await go(page,'/');await expect(page.locator('#dash-events .event-row').first()).toBeVisible();await expect(page.locator('#dash-timeline .error-box')).toContainText('加载失败',{timeout:4000});expect(Date.now()-began).toBeLessThan(4200);await expect(page.locator('#dash-timeline [data-retry]')).toBeVisible();
});

test('three health failures show a top bar warning and recovery clears it',async({page})=>{
 await login(page);let fail=true;await page.route('**/api/health',r=>fail?r.abort('connectionrefused'):r.continue());
 await page.evaluate(()=>(window as any).eval('wakeHealth()'));await expect(page.locator('.topbar [data-health-warning]')).toHaveText('服务器无响应',{timeout:11000});fail=false;
 await expect(page.locator('.topbar [data-health-warning]')).toHaveCount(0,{timeout:7000});
});
