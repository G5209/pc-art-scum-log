process.env.WEB_ORIGIN='http://127.0.0.1:5199';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createRequire}=require('node:module');
const apiRequire=createRequire(path.resolve(__dirname,'../apps/api/package.json'));
const Database=apiRequire('better-sqlite3');
const {createApp}=require('../apps/api/dist/app');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scum-browser-')),dbPath=path.join(dir,'test.db');
const seedDb=new Database(dbPath);require('../apps/api/dist/migrations').migrate(seedDb);seedDb.close();
const db=new Database(dbPath);
// Sanitized contract examples live only in the disposable browser-test database.
const {parseFileLine}=require('../packages/parser/dist/dispatch');
const examples=[
 ['gameplay_browser.log','[LogBaseBuilding] [Flag] Created. FlagId: 42. Owner: 90000098000000002 (2, 测试物主). Location: X=0 Y=1 Z=2'],
 ['gameplay_browser.log','[LogBunkerLock] B1 Bunker is Locked. Locked 1h 0m 0s ago, next Activation in 2h 0m 0s. X=0 Y=1 Z=2'],
 ['economy_browser.log','[Bank] 测试操作者(ID:90000098000000001)(Account Number:1) deposited 10(9 was added) to Account Number: 2(测试物主)(90000098000000002) at X=0 Y=1 Z=2'],
 ['violations_browser.log','[Speed] Action: move, Desc: artificial example, ServerLocation: X=0 Y=1 Z=2, ClientLocation: X=3 Y=4 Z=5, Distance: 5 m, User: 测试操作者 (1, 90000098000000001)'],
 ['gameplay_browser.log','[LogMinigame] [BP_LockBombDefusalMinigame_C] User: 阶段十九排爆测试 (19, 90000098000000019). Success: No. Elapsed time: 7.25. Failed attempts: 0. Target object: BP_KillboxSmallDoors_01_C (ID: N/A). Lock type: Basic. User owner: 0(World). Location: X=0 Y=1 Z=2'],
 ['gameplay_browser.log','[LogMinigame] [BP_LockBombDefusalMinigame_C] User: 阶段十九实例标记测试 (19, 90000098000000019). Success: No. Elapsed time: 7.25. Failed attempts: 0. Target object: BP_KillboxSmallDoors_01_C_123. Lock type: Basic. User owner: 0(World). Location: X=0 Y=1 Z=2'],
 ['kill_browser.log','Committed suicide. User: 阶段十九自杀测试 (19, 90000098000000019), [浏览器测试]. Location: X=0 Y=1 Z=2'],
 ['gameplay_browser.log','[LogMisc] BrowserFixtureOpaqueRecord'],
 ['gameplay_browser.log','[LogMinigame] [DialPadMinigame] User: 阶段十九密码测试 (19, 90000098000000019). Location: X=1 Y=2 Z=3. Guessed Combination: 034. First try. Room Id: TV_Bunker.Abandoned.Floor -02.Sector_G. Dial Pad Location: X=4 Y=5 Z=6'],
 ['gameplay_browser.log','[LogExplosives] Pin pulled. User: 阶段十九爆炸测试 (19, 90000098000000019). Grenade name: Grenade. Location: X=1 Y=2 Z=3'],
 ['gameplay_browser.log','[LogBaseBuilding] Item attached. User: 阶段十九安装测试 (19, 90000098000000019). Grenade name: TNT. Location: X=1 Y=2 Z=3'],
 ['kill_browser.log','Died: 阶段十九同源测试 (90000098000000019), Killer: 阶段十九同源测试 (90000098000000019) Weapon: Claymore [Explosion] S:[KillerLoc : 0, 0, 0 VictimLoc: 300, 400, 0, Distance: 5 m]'],
 ['gameplay_browser.log','[LogChest] [Bury] ChestId: 42 Owner: 90000098000000002 (2, 测试物主) Location: X=0 Y=1 Z=2 Burier: 90000098000000001 (1, 测试操作者)'],
 ['gameplay_browser.log','[LogMinigame] [BP_BombDefusalMinigame_C] User: 测试操作者 (1, 90000098000000001). Success: No. Elapsed time: 5.68. Failed attempts: 0. Target object: ImprovisedMine_C_123. User owner: 0(). Location: X=0 Y=1 Z=2'],
 ['gameplay_browser.log','[LogMinigame] [AbandonedBunkerSlaveSwitchboardMinigame_01_C] User: 测试操作者 (1, 90000098000000001). Success: Yes. Elapsed time: 2.21. Failed attempts: 0.'],
 ['admin_browser.log',"Deleted player '90000098000000002 (测试物主)' that last logged in 7 days ago"],
 ['economy_browser.log','[Trade] Before selling to trader TestTrader, player 测试操作者(90000098000000001) had 0 cash, -20 account balance and 0 gold and trader had 0 funds.']
];
for(let i=0;i<25;i++)examples.push(['login_browser.log',`'192.0.2.1 90000098000000001:测试操作者(1)' logged in at: X=${i} Y=1 Z=2`]);
// Sanitized regression fixtures follow the stage 22 raw-type mapping.
for(const [i,[lock,owner,target]] of [
 ['Basic','N/A','BPLockpick_Weapon_Locker_Military_C'],
 ['Medium','0()','BP_Full_Set_02_Door_01_C'],
 ['Advanced','12([90000098000000012] 测试物主)','BPLockpick_Weapon_Locker_Military_C'],
 ['Medium','0(World)','Improvised_Metal_Chest_C'],
 ['Basic','unrecognized-owner','UnverifiedObject_C']
].entries())examples.push(['gameplay_browser.log',`[LogMinigame] [LockpickingMinigame_C] User: 阶段二十撬锁测试${i} (12, 90000098000000012). Success: No. Elapsed time: 0.0. Failed attempts: 0. Target object: ${target}(ID: N/A). Lock type: ${lock}. User owner: ${owner}. Location: X=0 Y=1 Z=2`]);
// Stage 22 contracts and the eleven requested translations, never written to the real database.
const stage22Targets=require('../packages/shared/dist/lockpick-translations').STAGE21_TARGET_TOKENS;
for(const [i,target] of [...stage22Targets,'Improvised_Metal_Chest_C','UnverifiedObject_C','UnverifiedObject_C'].entries()){
 const lock=i===0?'Advanced':i===1?'Medium':i===2?'VeryEasy':i===11?'DialLock':i===12?'N/A':i===13?'NewLock':'Basic';
 const kind=i===11?'BP_DialLockMinigame_C':'LockpickingMinigame_C';
 examples.push(['gameplay_browser.log',`[LogMinigame] [${kind}] User: 阶段二十二锁测试${i} (22, 90000098000000022). Success: No. Elapsed time: 0.0. Failed attempts: 0. Target object: ${target}(ID: N/A). Lock type: ${lock}. User owner: N/A. Location: X=0 Y=1 Z=2`]);
}
const insert=db.prepare('INSERT INTO events(ts,server_id,family,event_type,actor_steam_id,actor_name,actor_char_id,target_steam_id,target_name,target_char_id,x,y,z,metadata,raw,source_file,source_line_no,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
for(const [i,[file,body]] of examples.entries()){
 const e=parseFileLine('2026.10.13-00.00.00: '+body,file,i+1,{});
 insert.run(e.ts,'default',e.family,e.event_type,e.actor_steam_id??null,e.actor_name??null,e.actor_char_id??null,e.target_steam_id??null,e.target_name??null,e.target_char_id??null,e.x??null,e.y??null,e.z??null,JSON.stringify(e.metadata),e.raw,file,i+1,new Date().toISOString());
}
const app=createApp(db,{dbPath,rawDir:path.resolve('data/raw/events'),bootstrapPassword:'browser-test-only-password'});
// Failure injection exists only in this disposable test server, never production.
app.post('/__stage24/disconnect',(_req,res)=>{app.locals.streams.disconnect();res.json({ok:true});});
const server=app.listen(3199,'127.0.0.1');
function cleanup(){app.locals.close();server.closeAllConnections();server.close(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});process.exit(0);});}
process.on('SIGINT',cleanup);process.on('SIGTERM',cleanup);
