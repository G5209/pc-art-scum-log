import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
async function login(page:Page){await page.goto('/login');await page.getByLabel('账号',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('browser-test-only-password');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page).not.toHaveURL(/\/login$/);}
test('升级字段、独立页面和完整率在桌面及手机上可用',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await login(page);page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()===401)errors.push(`登录后请求未授权：${new URL(r.url()).pathname}`);});await expect(page).toHaveTitle(/PC艺术网页日志/);
 const dir=path.resolve('test-results/screenshots/stage15');fs.mkdirSync(dir,{recursive:true});
 for(const [route,labels] of [
  ['chest',['操作者角色','物主','箱子编号']],['disarm',['物品编号','失败次数','分类']],['bunker-minigame',['电压匹配','房间','组合','楼层']],['character-delete',['系统清理','被删除玩家','定期维护']],['bank',['净额','目标账户号','换汇后黄金']],['economy',['基础价格','商人资金','账户余额']],['violations',['玩家位置','服务器位置','距离']],['kill',['距离','爆头','击杀者参加活动']],['login',['本次在线时长','地址归属地','网络地址']]
 ] as const){
  await page.goto('/logs/'+route);await expect(page.locator('#event-total')).not.toContainText('加载中');await expect(page.locator('.field-card').first()).toBeVisible();
  const text=await page.locator('#event-table').innerText();for(const label of labels)expect(text).toContain(label);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(['chest','disarm','bank'].includes(route))await page.screenshot({path:path.join(dir,`${route}-${test.info().project.name}.png`),fullPage:true});
 }
 await page.goto('/logs/disarm');const card=page.locator('.disarm-card').first();await expect(card).toContainText('失败');await expect(card.locator('.structured-fields div').filter({has:page.locator('dt').filter({hasText:'失败次数'})}).locator('dd')).toHaveText('0');
 await card.locator('[data-event]').click();await expect(page.locator('#drawer details').filter({hasText:'查看原文'})).not.toHaveAttribute('open');
 await page.goto('/logs/economy');await expect(page.locator('.economy-card').first()).toContainText('-20');
 await page.goto('/logs/lock-install');await expect(page.locator('#event-table .empty')).toContainText('暂无记录');
 await page.goto('/players');await page.locator('#players-page a[data-route]').first().click();await expect(page.locator('h3').filter({hasText:'登录会话'})).toBeVisible();
 await page.goto('/settings');await expect(page.locator('#field-coverage tbody tr').first()).toBeVisible();await expect(page.locator('#ingest-status')).toContainText('字段完整率');
 await page.screenshot({path:path.join(dir,`coverage-${test.info().project.name}.png`),fullPage:true});expect(errors).toEqual([]);
});
