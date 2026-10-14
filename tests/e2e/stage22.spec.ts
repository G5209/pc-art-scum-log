import {test,expect} from '@playwright/test';
test('挂锁品质与密码锁分类展示正确，新增译名及筛选可恢复',async({page})=>{
 await page.goto('/login');await page.getByLabel('账号',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('browser-test-only-password');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page).not.toHaveURL(/\/login$/);
 if(new URL(page.url()).pathname==='/welcome')await page.getByRole('button',{name:'稍后配置',exact:true}).click();
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const route='/logs/lockpick?q='+encodeURIComponent('阶段二十二锁测试')+'&pageSize=30';
 await page.goto(route);await expect(page.locator('.lockpick-card')).toHaveCount(14);
 const card=(i:number)=>page.locator('.lockpick-card').filter({has:page.locator('.player-link').filter({hasText:new RegExp('^阶段二十二锁测试'+i+'22$')})});
 const field=(i:number,name:string)=>card(i).locator('.structured-fields > div').filter({has:page.locator('dt').filter({hasText:new RegExp('^'+name+'$')})}).locator('dd');
 const targets=['Rager_Item_Container_C','Laika_Item_Container_C','Barba_Item_Container_C','BP_StoneStable_A_Door_L_C','BP_ToolShed_Doors_C','Improvised_Wooden_Chest_C','Wolfswagen_Item_Container_C','Asian_Chest_Metal_C','BPLockpick_Hazmat_Suit_Locker_01_C','BPLockpick_Hazmat_Suit_Locker_02_C','BPLockpick_Medical_Container_TEC01_C'];
 const names=['Rager 物品容器','Laika 物品容器','Barba 物品容器','石厩左门','工具棚门','简易木箱','Wolfswagen 物品容器','中式金属宝箱','防化服柜（一号）','防化服柜（二号）','医疗容器'];
 for(let i=0;i<11;i++){await expect(field(i,'目标物品')).toHaveText(names[i]);await expect(field(i,'目标物品').locator('span')).toHaveAttribute('title',targets[i]);await expect(field(i,'锁类别')).toHaveText('挂锁');}
 for(const [i,name] of [[0,'金锁'],[1,'银锁'],[2,'简易锁'],[3,'铁锁']] as const)await expect(field(i,'锁品质')).toHaveText(name);
 await expect(field(11,'锁类别')).toHaveText('密码锁');await expect(field(11,'锁品质')).toHaveText('—');
 for(const i of [12,13]){await expect(field(i,'锁类别')).toHaveText('未知');await expect(field(i,'锁品质')).toHaveText('未知');}
 await expect(field(13,'锁类别').locator('span')).toHaveAttribute('title','NewLock');await expect(field(11,'失败次数')).toHaveText('0');
 expect(await page.title()).toBe('PC艺术网页日志');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/stage22-lockpick-${test.info().project.name}.png`});
 const quality=page.locator('[data-multi-name="lock_quality"]');await quality.locator('[data-multi-toggle]').click();await quality.locator('[value="Gold"][data-multi-option]').check();await expect(page.locator('.lockpick-card')).toHaveCount(1);await expect(field(0,'锁品质')).toHaveText('金锁');await expect(page).toHaveURL(/lock_quality=Gold/);
 await page.reload();await expect(page.locator('.lockpick-card')).toHaveCount(1);await expect(quality.locator('[data-multi-toggle]')).toContainText('已选 1 个');
 await page.goto(route);await expect(page.locator('.lockpick-card')).toHaveCount(14);
 const category=page.locator('[data-multi-name="lock_category"]');await category.locator('[data-multi-toggle]').click();await category.locator('[value="combination"][data-multi-option]').check();await expect(page.locator('.lockpick-card')).toHaveCount(1);await expect(field(11,'锁类别')).toHaveText('密码锁');await expect(page).toHaveURL(/lock_category=combination/);
 await page.reload();await expect(page.locator('.lockpick-card')).toHaveCount(1);await expect(category.locator('[data-multi-toggle]')).toContainText('已选 1 个');await page.getByRole('heading',{name:'撬锁日志',exact:true}).first().click();await expect(category).not.toHaveClass(/open/);
 await card(11).locator('[data-event]').click();await expect(page.locator('#drawer details')).not.toHaveAttribute('open');await page.locator('#drawer summary').click();await expect(page.locator('#drawer pre')).toContainText('BP_DialLockMinigame_C');await page.getByRole('button',{name:'关闭详情',exact:true}).click();
 await page.screenshot({path:`test-results/stage22-password-${test.info().project.name}.png`});
 await page.goto('/logs/gameplay-other?q='+encodeURIComponent('阶段二十二锁测试11'));await expect(page.locator('.structured-card')).toHaveCount(0);expect(errors).toEqual([]);
});
