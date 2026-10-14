import {test,expect,type Page} from '@playwright/test';

async function login(page:Page){
 await page.goto('/login');
 await page.getByLabel('账号',{exact:true}).fill('admin');
 await page.getByLabel('密码',{exact:true}).fill('browser-test-only-password');
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await expect(page).not.toHaveURL(/\/login$/);
 if(new URL(page.url()).pathname==='/welcome')await page.getByRole('button',{name:'稍后配置',exact:true}).click();
}
const field=(card:ReturnType<Page['locator']>,name:string)=>card.locator('.structured-fields > div').filter({has:card.page().locator('dt').filter({hasText:new RegExp('^'+name+'$')})}).locator('dd');

test('自杀与排爆别名通过真实解析和接口展示，详情不露解析审计字段',async({page})=>{
 const errors:string[]=[];
 await login(page);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto('/logs/kill?q='+encodeURIComponent('阶段十九自杀测试'));
 const suicide=page.locator('.kill-card').filter({hasText:'阶段十九自杀测试'}).first();await expect(suicide).toBeVisible();
 await expect(suicide.locator('.event-chip')).toHaveText('自杀');await expect(field(suicide,'记录类型')).toHaveText('自杀');
 await expect(field(suicide,'击杀者')).toHaveText('—');await expect(field(suicide,'死者')).toContainText('阶段十九自杀测试');
 for(const label of ['武器','距离','爆头'])await expect(field(suicide,label)).toHaveText('—');
 expect(await page.locator('#content').innerText()).not.toMatch(/未确认|死亡原因未确认|字段待补/);
 await suicide.locator('[data-event]').click();await expect(page.locator('#drawer h2')).toHaveText('自杀');
 await expect(page.locator('#drawer')).toContainText('死者：');expect(await page.locator('#drawer').innerText()).not.toMatch(/未确认|字段待补|原文分类|游戏事件/);
 await expect(page.locator('#drawer details')).not.toHaveAttribute('open');await page.locator('#drawer summary').click();await expect(page.locator('#drawer pre')).toContainText('Committed suicide');
 await expect(page.locator('#drawer')).toHaveCSS('opacity','1');await page.screenshot({path:`test-results/stage19-suicide-${test.info().project.name}.png`,fullPage:false});
 await page.goto('/logs/disarm?q='+encodeURIComponent('阶段十九排爆测试'));const disarm=page.locator('.disarm-card').filter({hasText:'阶段十九排爆测试'}).first();
 await expect(disarm).toBeVisible();await expect(field(disarm,'失败次数')).toHaveText('0');await expect(field(disarm,'结果')).toContainText('失败');await expect(field(disarm,'目标物品')).toHaveText('击杀箱小门');await expect(field(disarm,'物品编号')).toHaveText('—');
 await expect(field(disarm,'锁类型')).toHaveText('基础锁');
 await disarm.locator('[data-event]').click();await expect(page.locator('#drawer h2')).toHaveText('排爆');await expect(page.locator('#drawer details')).not.toHaveAttribute('open');expect(await page.locator('#drawer').innerText()).not.toMatch(/未确认|字段待补|原文分类/);
 const categoryDetails=page.locator('#drawer > dl').first();await expect(categoryDetails.locator('dt').filter({hasText:/^日志类别$/}).locator('xpath=following-sibling::dd[1]')).toHaveText('排爆');await expect(categoryDetails.locator('dt').filter({hasText:/^来源$/}).locator('xpath=following-sibling::dd[1]')).toContainText('排爆 ·');expect(await categoryDetails.innerText()).not.toContain('其他游戏记录');
 await expect(page.locator('#drawer')).toHaveCSS('opacity','1');await page.screenshot({path:`test-results/stage19-disarm-${test.info().project.name}.png`,fullPage:false});
 await page.goto('/logs/disarm?q='+encodeURIComponent('阶段十九实例标记测试'));const instance=page.locator('.disarm-card').first();await expect(instance).toBeVisible();await expect(field(instance,'物品编号')).toHaveText('—');await expect(field(instance,'对象实例标记')).toHaveText('123');await instance.locator('[data-event]').click();await expect(page.locator('#drawer')).toContainText('对象名称中的实例标记');expect(await page.locator('#drawer').innerText()).not.toContain('object_instance_name');
 expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('新增游戏阶段字段在业务列表展示，密码保留前导零，同源损伤保留真实武器距离',async({page})=>{
 await login(page);await page.goto('/logs/bunker-minigame?q='+encodeURIComponent('阶段十九密码测试'));
 const pad=page.locator('.bunker-minigame-card').first();await expect(pad).toBeVisible();await expect(field(pad,'类别')).toHaveText('地堡密码面板');await expect(field(pad,'动作')).toHaveText('尝试地堡密码');await expect(field(pad,'尝试密码')).toHaveText('034');await expect(field(pad,'首次尝试')).toHaveText('是');await expect(field(pad,'密码面板坐标')).toContainText('横向：4');await expect(field(pad,'坐标')).toContainText('横向：1');
 await page.goto('/logs/gameplay-other?q='+encodeURIComponent('阶段十九爆炸测试'));const explosive=page.locator('.gameplay-other-card').first();await expect(explosive).toBeVisible();await expect(field(explosive,'动作')).toHaveText('拔出保险销');await expect(field(explosive,'爆炸物')).toHaveText('手榴弹');await explosive.locator('[data-event]').click();await expect(page.locator('#drawer h2')).toHaveText('拔出保险销');
 await page.goto('/logs/territory?q='+encodeURIComponent('阶段十九安装测试'));const attached=page.locator('.territory-card').first();await expect(attached).toBeVisible();await expect(field(attached,'动作')).toHaveText('安装物品');await expect(field(attached,'安装物品')).toHaveText('梯恩梯炸药');await expect(field(attached,'玩家')).toContainText('阶段十九安装测试');
 await page.goto('/logs/kill?q='+encodeURIComponent('阶段十九同源测试'));const damage=page.locator('.kill-card').first();await expect(damage).toBeVisible();await expect(field(damage,'击杀者')).toContainText('阶段十九同源测试');await expect(field(damage,'武器')).toContainText('阔剑地雷');await expect(field(damage,'距离')).toContainText('5.0 米');
});

test('其他事件保留原文，解析统计如实显示，三个空族不再有页面入口',async({page})=>{
 await login(page);for(const key of ['event_kill','armor_absorption','sentry']){
  await expect(page.locator(`.sidebar a[href="/logs/${key}"]`)).toHaveCount(0);
  await page.goto('/logs/'+key);await expect(page).toHaveURL(/\/$/);
 }
 await page.goto('/logs/gameplay-other?q=BrowserFixtureOpaqueRecord');const card=page.locator('.field-card').first();await expect(card).toBeVisible();await card.locator('[data-event]').click();
 await expect(page.locator('#drawer h2')).toHaveText(/其他/);expect(await page.locator('#drawer').innerText()).not.toMatch(/未确认|字段待补|原文分类/);await page.locator('#drawer summary').click();await expect(page.locator('#drawer pre')).toContainText('BrowserFixtureOpaqueRecord');
 await page.goto('/map');await expect(page.locator('#map-player')).toHaveAttribute('placeholder','输入玩家名或 SteamID');
 await page.goto('/settings');await expect(page.locator('#ingest-status')).toContainText('其他记录');expect(await page.locator('#content').innerText()).not.toMatch(/未确认|字段待补/);
 await page.goto('/stats');await expect(page.locator('.coverage-list')).toBeVisible();expect(await page.locator('#content').innerText()).not.toContain('未确认');
 await page.screenshot({path:`test-results/stage19-stats-${test.info().project.name}.png`,fullPage:true});
});
