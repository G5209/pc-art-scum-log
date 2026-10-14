import {test,expect,type Page} from '@playwright/test';
async function login(page:Page){await page.goto('/login');await page.getByLabel('账号',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('browser-test-only-password');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page).not.toHaveURL(/\/login$/);if(new URL(page.url()).pathname==='/welcome')await page.getByRole('button',{name:'稍后配置',exact:true}).click();}
async function navigate(page:Page,path:string){await page.goto(path);}
test('events and options retry once; persistent failure keeps shell and manual retry keeps filters',async({page})=>{
 await login(page);let options=0,events=0,fail=false;
 await page.route('**/api/events/options?*',route=>++options===1?route.fulfill({status:503,json:{error:'暂时无法读取选项'}}):route.continue());
 await page.route(/\/api\/events\?/,route=>{events++;return events===1||fail?route.fulfill({status:503,json:{error:'记录暂时无法加载'}}):route.continue();});
 await page.goto('/logs/kill?actor_name='+encodeURIComponent('阶段十二')+'&pageSize=10');await expect(page.locator('#event-total')).toContainText('共');expect(options).toBe(2);expect(events).toBe(2);
 fail=true;await page.getByRole('button',{name:'筛选',exact:true}).click();await expect(page.locator('.error-box')).toContainText('加载失败，点击重试');await expect(page.locator('.sidebar')).toBeAttached();
 fail=false;await page.getByRole('button',{name:'重新加载',exact:true}).click();await expect(page.locator('#event-total')).toContainText('共');await expect(page.locator('.error-box')).toHaveCount(0);await expect(page.locator('[name=actor_name]')).toHaveValue('阶段十二');
});
test('bootstrap network failure preserves login; charts load only on chart pages; stale routes do not resurrect SSE',async({page})=>{
	 await login(page);let fail=true;await page.route('**/api/menus',r=>fail?r.fulfill({status:503,json:{error:'菜单暂时无法加载'}}):r.continue());
	 await page.goto('/logs/kill');await expect(page.locator('.boot-error')).toContainText('加载失败');await expect(page.locator('#login-form')).toHaveCount(0);
	 fail=false;await page.getByRole('button',{name:'重新加载',exact:true}).click();await expect(page.locator('#event-total')).toContainText('共');
 expect(await page.evaluate(()=>!!(window as any).echarts)).toBe(false);
 const streams=await page.evaluate(()=>({online:(window as any).eval('state.onlineStream?.readyState'),event:(window as any).eval('state.eventStream?.readyState')}));expect(streams.online).not.toBe(2);expect(streams.event).not.toBe(2);
 await page.route('**/api/events/options?*',async r=>{await new Promise(resolve=>setTimeout(resolve,250));await r.continue();});
	 await navigate(page,'/logs/chat');await navigate(page,'/settings');await expect(page.locator('#source-form')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>!!(window as any).eval('state.eventStream'))).toBe(false);
	 await navigate(page,'/');await expect(page.locator('#kill-chart canvas')).toBeAttached();expect(await page.evaluate(()=>!!(window as any).echarts)).toBe(true);
	 await page.getByRole('button',{name:'退出',exact:true}).click();await expect(page.locator('#login-form')).toBeVisible();expect(await page.evaluate(()=>!!(window as any).eval('state.onlineStream||state.onlineRetry||state.eventStream'))).toBe(false);
});
test('eight second timeout covers body; authentication failures do not retry; compressed assets validate cache',async({page,request})=>{
 await login(page);let calls=0;await page.route('**/api/events?timeout-test*',async r=>{calls++;await new Promise(resolve=>setTimeout(resolve,300));await r.fulfill({json:{data:[]}}).catch(()=>{});});
 const error=await page.evaluate(async()=>{try{await (window as any).eval("request('/api/events?timeout-test=1',{timeoutMs:40})");return '';}catch(e:any){return e.message;}});expect(error).toContain('请求超过');expect(calls).toBe(2);
 let denied=0;await page.route('**/api/events?denied-test*',r=>{denied++;return r.fulfill({status:403,json:{error:'没有该项查询权限'}});});
 await page.evaluate(async()=>{try{await (window as any).eval("request('/api/events?denied-test=1')");}catch{}});expect(denied).toBe(1);
 const asset=await request.get('/app.js?v=23',{headers:{'accept-encoding':'gzip'}});expect(asset.headers()['content-encoding']).toBe('gzip');expect(asset.headers()['cache-control']).toContain('max-age=31536000');
 expect((await request.get('/app.js?v=23',{headers:{'accept-encoding':'gzip','if-none-match':asset.headers().etag}})).status()).toBe(304);
 expect((await request.get('/')).headers()['cache-control']).toBe('no-cache');expect((await request.get('/missing-stage23.js')).status()).toBe(404);
 const perf=await page.evaluate(()=>(window as any).pcPerformance);expect(perf.requests.some((r:any)=>r.timed_out)).toBe(true);expect(perf.requests.every((r:any)=>!r.path.includes('?'))).toBe(true);
});
