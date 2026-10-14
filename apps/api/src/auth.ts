import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import type Database from 'better-sqlite3';
import {LOG_MENUS} from '@scum/shared';

type Row=Record<string,any>;
export interface Principal {id:number;username:string;display_name:string;role:string;role_id:number;permissions:string[];csrf_token:string;session_id:number;owner_id?:number}
declare global {namespace Express {interface Request {auth?:Principal}}}
export const SYSTEM_PERMISSIONS=['system.datasource.manage','user.manage','role.manage','system.settings','system.ingest','log.raw.view','field.steam.view','field.ip.view','field.geography.view','field.region.view','field.coordinates.view','log.export'];
export const ALL_PERMISSIONS=[...LOG_MENUS.map(m=>m.permission),...SYSTEM_PERMISSIONS];
const cookieName='scum_session',sessionMs=8*3600000;
export function migrateAuth(db:Database.Database,options:{bootstrapPassword?:string;bootstrapLog?:boolean;firstAdminPath?:string}={}) {
 db.exec(`CREATE TABLE IF NOT EXISTS roles(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL,description TEXT,is_system INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS permissions(id INTEGER PRIMARY KEY,code TEXT UNIQUE NOT NULL,description TEXT);
 CREATE TABLE IF NOT EXISTS role_permissions(role_id INTEGER NOT NULL REFERENCES roles(id),permission_id INTEGER NOT NULL REFERENCES permissions(id),PRIMARY KEY(role_id,permission_id));
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,display_name TEXT NOT NULL,role_id INTEGER NOT NULL REFERENCES roles(id),is_active INTEGER NOT NULL DEFAULT 1,created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL,last_login_at TEXT);
 CREATE TABLE IF NOT EXISTS user_permissions(user_id INTEGER NOT NULL REFERENCES users(id),permission_id INTEGER NOT NULL REFERENCES permissions(id),granted INTEGER NOT NULL CHECK(granted IN (0,1)),PRIMARY KEY(user_id,permission_id));
 CREATE TABLE IF NOT EXISTS sessions_auth(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),token TEXT UNIQUE NOT NULL,csrf_token TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL,ip TEXT,user_agent TEXT);
 CREATE INDEX IF NOT EXISTS idx_auth_expiry ON sessions_auth(expires_at);`);
 db.transaction(()=>{
  const labels:Record<string,string>={'system.datasource.manage':'管理日志源','user.manage':'管理子账号','role.manage':'管理角色','system.settings':'查看系统设置','system.ingest':'导入本地日志','log.raw.view':'查看日志原文','field.steam.view':'查看完整玩家编号','field.ip.view':'查看网络地址','field.geography.view':'查看地址归属地','field.region.view':'查看区域','field.coordinates.view':'查看坐标','log.export':'导出记录'};for(const code of ALL_PERMISSIONS)db.prepare('INSERT INTO permissions(code,description) VALUES (?,?) ON CONFLICT(code) DO UPDATE SET description=excluded.description').run(code,LOG_MENUS.find(m=>m.permission===code)?.label??labels[code]??'其他权限');
  const defaults:Record<string,string[]>={super_admin:ALL_PERMISSIONS,admin:ALL_PERMISSIONS.filter(p=>p!=='role.manage'&&p!=='system.datasource.manage'&&!p.startsWith('field.')&&p!=='log.export'),moderator:LOG_MENUS.filter(m=>!['admin','bank','economy','network_objects','server_notifications','unknown'].includes(m.key)).map(m=>m.permission),viewer:['log.kill.view','log.login.view','log.chat.view','log.famepoints.view','log.quests.view']};
  for(const [name,permissions] of Object.entries(defaults)){
   const result=db.prepare('INSERT OR IGNORE INTO roles(name,description,is_system) VALUES (?,?,1)').run(name,{super_admin:'超级管理员（不可更改）',admin:'日志与用户管理员',moderator:'日志巡查员',viewer:'基础日志查看者'}[name]);
   if(result.changes||name==='super_admin')for(const code of permissions)db.prepare('INSERT OR IGNORE INTO role_permissions SELECT r.id,p.id FROM roles r,permissions p WHERE r.name=? AND p.code=?').run(name,code);
  }
  if(!(db.prepare('SELECT COUNT(*) n FROM users').get() as Row).n){
   const password=options.bootstrapPassword??crypto.randomBytes(9).toString('base64url');
   const created=new Date().toISOString(),filename=options.firstAdminPath??path.resolve('logs/first-admin.txt');
   // Write credentials before committing the account, so a failed write can be retried.
   if(!options.bootstrapPassword){fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,`SCUM 首次管理员\n用户名：admin\n密码：${password}\n创建时间：${created}\n首次登录后请修改密码。\n`,{mode:0o600,flag:'wx'});}
   db.prepare("INSERT INTO users(username,password_hash,display_name,role_id,created_at) VALUES ('admin',?,'超级管理员',(SELECT id FROM roles WHERE name='super_admin'),?)").run(bcrypt.hashSync(password,12),created);
   if(options.bootstrapLog)console.log('首次管理员已创建，请查看受保护的首次密码文件并立即改密。');
  }
 })();
}
export function effectivePermissions(db:Database.Database,userId:number):string[] {
 const role=db.prepare('SELECT r.name FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?').get(userId) as Row|undefined;
 if(role?.name==='super_admin')return [...ALL_PERMISSIONS];
 const granted=new Set((db.prepare('SELECT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id JOIN users u ON u.role_id=rp.role_id WHERE u.id=?').all(userId) as Row[]).map(r=>r.code));
 for(const p of db.prepare('SELECT p.code,up.granted FROM user_permissions up JOIN permissions p ON p.id=up.permission_id WHERE user_id=?').all(userId) as Row[])p.granted?granted.add(p.code):granted.delete(p.code);
 return [...granted];
}
export const requireAuth:express.RequestHandler=(req,res,next)=>req.auth?next():res.status(401).json({error:'请先登录'});
export const requirePermission=(code:string):express.RequestHandler=>(req,res,next)=>!req.auth?res.status(401).json({error:'请先登录'}):req.auth.permissions.includes(code)?next():res.status(403).json({error:'没有访问权限'});
export function installAuth(app:express.Express,db:Database.Database){
 const attempts=new Map<string,{count:number;until:number}>();let lastSessionCleanup=0;
 app.use('/api',(req,res,next)=>{
  if(Date.now()-lastSessionCleanup>=60000){db.prepare('DELETE FROM sessions_auth WHERE expires_at<?').run(new Date().toISOString());lastSessionCleanup=Date.now();}
  const token=(req.headers.cookie??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(token&&/^[\w-]{43}$/.test(token)){
   const row=db.prepare('SELECT u.id,u.username,u.display_name,u.role_id,r.name role,s.id session_id,s.csrf_token,t.owner_account_id owner_id FROM sessions_auth s JOIN users u ON u.id=s.user_id JOIN roles r ON r.id=u.role_id JOIN account_tenants t ON t.account_id=u.id WHERE s.token=? AND u.is_active=1 AND s.expires_at>?').get(crypto.createHash('sha256').update(token).digest('hex'),new Date().toISOString()) as Row|undefined;
   if(row)req.auth={...row,permissions:effectivePermissions(db,row.id)} as Principal;
  }
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   const origin=req.get('origin'),allowed=new Set([`${req.protocol}://${req.get('host')}`,'http://127.0.0.1:5173','http://localhost:5173',process.env.WEB_ORIGIN??'']);
   if(origin&&!allowed.has(origin))return res.status(403).json({error:'请求来源不允许'});
   if(req.path!=='/auth/login'&&req.auth&&req.get('x-csrf-token')!==req.auth.csrf_token)return res.status(403).json({error:'请求校验失败，请刷新页面'});
  }
  next();
 });
 const publicUser=(a:Principal)=>({id:a.id,username:a.username,display_name:a.display_name,role:a.role,role_id:a.role_id});
 app.post('/api/auth/login',async(req,res)=>{
  const key=req.socket.remoteAddress??'local',now=Date.now();for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
  const attempt=attempts.get(key);if(attempt&&attempt.count>=10&&attempt.until>now)return res.status(429).json({error:'登录尝试过多，请稍后再试'});
  const {username,password}=req.body??{};if(typeof username!=='string'||typeof password!=='string'||password.length>72)return res.status(400).json({error:'请输入有效用户名和密码'});
  const user=db.prepare('SELECT * FROM users WHERE username=? AND is_active=1').get(username) as Row|undefined;
  const valid=await bcrypt.compare(password,user?.password_hash??'$2b$12$C6UzMDM.H6dfI/f/IKcEe.OtfUbnBhVP.xPmTr/WDyFDgRLbxqDrK');
  if(!user||!valid){attempts.set(key,{count:(attempt?.count??0)+1,until:attempt?.until??now+15*60000});return res.status(401).json({error:'用户名或密码错误'});}
  attempts.delete(key);const token=crypto.randomBytes(32).toString('base64url'),csrf=crypto.randomBytes(24).toString('base64url'),created=new Date().toISOString();
  db.prepare('INSERT INTO sessions_auth(user_id,token,csrf_token,expires_at,created_at,ip,user_agent) VALUES (?,?,?,?,?,?,?)').run(user.id,crypto.createHash('sha256').update(token).digest('hex'),csrf,new Date(now+sessionMs).toISOString(),created,key,req.get('user-agent')?.slice(0,512)??null);
  db.prepare('UPDATE users SET last_login_at=? WHERE id=?').run(created,user.id);
  res.cookie(cookieName,token,{httpOnly:true,sameSite:'strict',secure:req.secure,maxAge:sessionMs,path:'/'});res.json({ok:true});
 });
 app.get('/api/auth/me',requireAuth,(req,res)=>res.json({user:publicUser(req.auth!),permissions:req.auth!.permissions,csrfToken:req.auth!.csrf_token}));
 app.post('/api/auth/logout',requireAuth,(req,res)=>{db.prepare('DELETE FROM sessions_auth WHERE id=?').run(req.auth!.session_id);res.clearCookie(cookieName,{path:'/',httpOnly:true,sameSite:'strict',secure:req.secure});res.json({ok:true});});
 app.post('/api/auth/change-password',requireAuth,async(req,res)=>{
  const {old_password,new_password}=req.body??{};if(!validPassword(new_password)||typeof old_password!=='string')return res.status(400).json({error:'新密码需为 12–72 字节'});
  const user=db.prepare('SELECT password_hash FROM users WHERE id=?').get(req.auth!.id) as Row;
  if(!await bcrypt.compare(old_password,user.password_hash))return res.status(400).json({error:'当前密码错误'});
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await bcrypt.hash(new_password,12),req.auth!.id);db.prepare('DELETE FROM sessions_auth WHERE user_id=?').run(req.auth!.id);res.clearCookie(cookieName,{path:'/'});res.json({ok:true,relogin:true});
 });
 const listUsers=(req:express.Request)=>db.prepare('SELECT u.id,u.username,u.display_name,u.role_id,r.name role,u.is_active,u.created_by,u.created_at,u.last_login_at FROM users u JOIN roles r ON r.id=u.role_id JOIN account_tenants t ON t.account_id=u.id WHERE t.owner_account_id=? ORDER BY u.id').all(req.auth!.owner_id);
 const manageable=(req:express.Request,res:express.Response):Row|null=>{const u=db.prepare('SELECT u.*,r.name role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?').get(req.params.id) as Row|undefined;if(!u){res.status(404).json({error:'账号不存在'});return null;}if(!(db.prepare('SELECT 1 FROM account_tenants WHERE account_id=? AND owner_account_id=?').get(u.id,req.auth!.owner_id))){res.status(404).json({error:'账号不存在'});return null;}if(u.role==='super_admin'||u.id===req.auth!.id){res.status(403).json({error:'此处不可修改超级管理员或自己的权限；请使用修改密码入口'});return null;}if(req.auth!.role!=='super_admin'&&effectivePermissions(db,u.id).some(p=>!req.auth!.permissions.includes(p))){res.status(403).json({error:'不能管理权限高于自己的账号'});return null;}return u;};
 const allowedRole=(req:express.Request,id:unknown)=>{const role=db.prepare('SELECT * FROM roles WHERE id=?').get(Number(id)) as Row|undefined;if(!role||role.name==='super_admin')return false;const codes=(db.prepare('SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE role_id=?').all(role.id) as Row[]).map(r=>r.code);return codes.every(p=>req.auth!.permissions.includes(p));};
 app.get('/api/users',requirePermission('user.manage'),(req,res)=>res.json({data:listUsers(req)}));
 app.post('/api/users',requirePermission('user.manage'),async(req,res)=>{
  const {username,password,display_name,role_id}=req.body??{};if(typeof username!=='string'||! /^[a-zA-Z0-9_.-]{3,40}$/.test(username)||!validPassword(password)||typeof display_name!=='string'||!display_name.trim()||display_name.length>80||!allowedRole(req,role_id))return res.status(400).json({error:'检查用户名、显示名、密码长度及可分配角色'});
  if(db.prepare('SELECT 1 FROM users WHERE username=?').get(username))return res.status(409).json({error:'用户名已存在'});
  const hash=await bcrypt.hash(password,12);const result=db.prepare('INSERT INTO users(username,password_hash,display_name,role_id,created_by,created_at) VALUES (?,?,?,?,?,?)').run(username,hash,display_name.trim(),role_id,req.auth!.id,new Date().toISOString());db.prepare('INSERT INTO account_tenants(account_id,owner_account_id) VALUES (?,?)').run(Number(result.lastInsertRowid),req.auth!.owner_id);res.status(201).json({id:Number(result.lastInsertRowid)});
 });
 app.patch('/api/users/:id',requirePermission('user.manage'),(req,res)=>{const u=manageable(req,res);if(!u)return;const b=req.body??{};if(b.role_id!==undefined&&!allowedRole(req,b.role_id))return res.status(403).json({error:'不能分配该角色'});if(b.display_name!==undefined&&(typeof b.display_name!=='string'||!b.display_name.trim()||b.display_name.length>80))return res.status(400).json({error:'显示名无效'});if(b.is_active!==undefined&&![true,false,0,1].includes(b.is_active))return res.status(400).json({error:'状态无效'});db.prepare('UPDATE users SET display_name=?,role_id=?,is_active=? WHERE id=?').run(b.display_name?.trim()??u.display_name,b.role_id??u.role_id,b.is_active===undefined?u.is_active:Number(Boolean(b.is_active)),u.id);db.prepare('DELETE FROM sessions_auth WHERE user_id=?').run(u.id);res.json({ok:true});});
 app.delete('/api/users/:id',requirePermission('user.manage'),(req,res)=>{const u=manageable(req,res);if(!u)return;db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(u.id);db.prepare('DELETE FROM sessions_auth WHERE user_id=?').run(u.id);res.json({ok:true});});
 app.post('/api/users/:id/reset-password',requirePermission('user.manage'),async(req,res)=>{const u=manageable(req,res);if(!u)return;const password=req.body?.password;if(!validPassword(password))return res.status(400).json({error:'密码需为 12–72 字节'});db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await bcrypt.hash(password,12),u.id);db.prepare('DELETE FROM sessions_auth WHERE user_id=?').run(u.id);res.json({ok:true});});
 const manageCatalog:express.RequestHandler=(req,res,next)=>!req.auth?res.status(401).json({error:'请先登录'}):req.auth.permissions.some(p=>['user.manage','role.manage'].includes(p))?next():res.status(403).json({error:'没有管理权限'});
 app.get('/api/roles',manageCatalog,(_req,res)=>res.json({data:db.prepare('SELECT * FROM roles ORDER BY id').all().map(r=>({...r as Row,permissions:(db.prepare('SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=?').all((r as Row).id) as Row[]).map(p=>p.code)}))}));
 app.get('/api/permissions',manageCatalog,(_req,res)=>res.json({data:db.prepare('SELECT * FROM permissions ORDER BY code').all()}));
 app.get('/api/users/:id/permissions',requirePermission('user.manage'),(req,res)=>{const user=db.prepare('SELECT u.id FROM users u JOIN account_tenants t ON t.account_id=u.id WHERE u.id=? AND t.owner_account_id=?').get(req.params.id,req.auth!.owner_id) as Row|undefined;if(!user)return res.status(404).json({error:'账号不存在'});res.json({effective:effectivePermissions(db,user.id),overrides:db.prepare('SELECT p.code,up.granted FROM user_permissions up JOIN permissions p ON p.id=up.permission_id WHERE user_id=?').all(user.id)});});
 const parseGrants=(req:express.Request,res:express.Response)=>{const grants=req.body?.permissions;if(!Array.isArray(grants)||grants.some(p=>!p||typeof p.code!=='string'||!ALL_PERMISSIONS.includes(p.code)||typeof p.granted!=='boolean'||!req.auth!.permissions.includes(p.code))||new Set(grants.map(p=>p.code)).size!==grants.length){res.status(400).json({error:'权限列表无效或超出可分配范围'});return null;}return grants as {code:string;granted:boolean}[];};
 app.put('/api/users/:id/permissions',requirePermission('user.manage'),(req,res)=>{const u=manageable(req,res);if(!u)return;const grants=parseGrants(req,res);if(!grants)return;db.transaction(()=>{db.prepare('DELETE FROM user_permissions WHERE user_id=?').run(u.id);for(const p of grants)db.prepare('INSERT INTO user_permissions SELECT ?,id,? FROM permissions WHERE code=?').run(u.id,Number(p.granted),p.code);db.prepare('DELETE FROM sessions_auth WHERE user_id=?').run(u.id);})();res.json({ok:true,effective:effectivePermissions(db,u.id)});});
 // Role edits are separate from user management. Super-admin is immutable.
 const rootRoleBoundary:express.RequestHandler=(req,res,next)=>req.auth?.role==='super_admin'&&req.auth.id===req.auth.owner_id?next():res.status(403).json({error:'共享角色只能由主账号管理，请使用子账号独立权限'});
 app.get('/api/roles/manage',requirePermission('role.manage'),rootRoleBoundary,(_req,res)=>res.json({data:db.prepare('SELECT * FROM roles').all()}));
 app.put('/api/roles/:id/permissions',requirePermission('role.manage'),rootRoleBoundary,(req,res)=>{const role=db.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id) as Row|undefined;if(!role)return res.status(404).json({error:'角色不存在'});if(role.name==='super_admin')return res.status(403).json({error:'超级管理员角色不可更改'});if(req.auth!.role!=='super_admin'&&(role.id===req.auth!.role_id||(db.prepare('SELECT id FROM users WHERE role_id=?').all(role.id) as Row[]).some(u=>effectivePermissions(db,u.id).some(p=>!req.auth!.permissions.includes(p)))))return res.status(403).json({error:'不可修改自己的角色或更高权限账号使用的角色'});const grants=parseGrants(req,res);if(!grants)return;db.transaction(()=>{db.prepare('DELETE FROM role_permissions WHERE role_id=?').run(role.id);for(const p of grants.filter(p=>p.granted))db.prepare('INSERT INTO role_permissions SELECT ?,id FROM permissions WHERE code=?').run(role.id,p.code);db.prepare('DELETE FROM sessions_auth WHERE user_id IN (SELECT id FROM users WHERE role_id=?)').run(role.id);})();res.json({ok:true});});
 app.post('/api/roles',requirePermission('role.manage'),rootRoleBoundary,(req,res)=>{const {name,description}=req.body??{};if(typeof name!=='string'||! /^[a-z][a-z0-9_]{2,40}$/.test(name)||typeof description!=='string'||description.length>120)return res.status(400).json({error:'角色名或描述无效'});if(db.prepare('SELECT id FROM roles WHERE name=?').get(name))return res.status(409).json({error:'角色已存在'});const r=db.prepare('INSERT INTO roles(name,description,is_system) VALUES (?,?,0)').run(name,description);res.status(201).json({id:Number(r.lastInsertRowid)});});
 app.delete('/api/roles/:id',requirePermission('role.manage'),rootRoleBoundary,(req,res)=>{const role=db.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id) as Row|undefined;if(!role)return res.status(404).json({error:'角色不存在'});if(role.is_system)return res.status(403).json({error:'预置角色不可删除'});if(db.prepare('SELECT id FROM users WHERE role_id=?').get(role.id))return res.status(409).json({error:'仍有账号使用该角色'});db.transaction(()=>{db.prepare('DELETE FROM role_permissions WHERE role_id=?').run(role.id);db.prepare('DELETE FROM roles WHERE id=?').run(role.id);})();res.json({ok:true});});
}
function validPassword(p:unknown):p is string{return typeof p==='string'&&Buffer.byteLength(p)>=12&&Buffer.byteLength(p)<=72;}
