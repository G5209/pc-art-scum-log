import type express from 'express';
import type Database from 'better-sqlite3';
// This installation has one collector and shared session/online aggregates.
// Reject other owners rather than exposing these aggregates across sites.
export function initializeTenancy(db:Database.Database){
 const users=db.prepare('SELECT id,created_by FROM users ORDER BY id').all() as {id:number;created_by:number|null}[];
 const owner=(id:number,seen=new Set<number>()):number=>{if(seen.has(id))throw new Error('账号归属循环');seen.add(id);const u=users.find(u=>u.id===id);return u?.created_by?owner(u.created_by,seen):id;};
 for(const u of users)db.prepare('INSERT OR IGNORE INTO account_tenants(account_id,owner_account_id) VALUES (?,?)').run(u.id,owner(u.id));
 const primary=db.prepare("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='super_admin' ORDER BY u.id LIMIT 1").get() as {id:number}|undefined;
 if(primary){db.prepare('INSERT OR IGNORE INTO server_tenants VALUES (?,?)').run('default',primary.id);db.prepare('INSERT OR IGNORE INTO server_tenants(server_id,owner_account_id) SELECT DISTINCT server_id,? FROM events').run(primary.id);}
}
export function tenantIsActive(db:Database.Database,userId:number,ownerId:number|undefined){const row=db.prepare('SELECT owner_account_id FROM account_tenants WHERE account_id=?').get(userId) as {owner_account_id:number}|undefined;const owners=db.prepare('SELECT DISTINCT owner_account_id FROM server_tenants').all() as {owner_account_id:number}[];return row?.owner_account_id===ownerId&&owners.length===1&&owners[0].owner_account_id===ownerId&&!db.prepare('SELECT 1 FROM events WHERE server_id NOT IN (SELECT server_id FROM server_tenants) LIMIT 1').get();}
export function installTenantBoundary(app:express.Express,db:Database.Database){
 app.use('/api',(req,res,next)=>{
  const row=db.prepare('SELECT owner_account_id FROM account_tenants WHERE account_id=?').get(req.auth!.id) as {owner_account_id:number}|undefined;
  if(!row)return res.status(403).json({error:'账号尚未分配站点'});
  req.auth!.owner_id=row.owner_account_id;
  if(/^\/(auth|users|roles|permissions)(\/|$)/.test(req.path))return next();
  const owners=db.prepare('SELECT DISTINCT owner_account_id FROM server_tenants').all() as {owner_account_id:number}[];
  if(owners.length>1||db.prepare('SELECT 1 FROM events WHERE server_id NOT IN (SELECT server_id FROM server_tenants) LIMIT 1').get())return res.status(503).json({error:'本安装尚未启用多站点采集，请按站点独立部署'});
  if(owners.length===1&&owners[0].owner_account_id!==row.owner_account_id)return res.status(403).json({error:'当前站点不属于此账号'});
  if(!owners.length){const primary=db.prepare("SELECT MIN(id) id FROM users WHERE created_by IS NULL").get() as {id:number};if(primary.id!==row.owner_account_id)return res.status(403).json({error:'站点尚未分配数据源'});}
  next();
 });
}
