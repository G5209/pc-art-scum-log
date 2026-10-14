import {LOG_MENUS} from '@scum/shared';
import type express from 'express';
export function visibleSql(req:express.Request){const allowed=LOG_MENUS.filter(m=>req.auth?.role==='super_admin'||req.auth?.permissions.includes(m.permission));const categories=allowed.length?allowed.map(m=>'('+m.sql+')').join(' OR '):'0';return req.auth?.owner_id?`(${categories}) AND server_id IN (SELECT server_id FROM server_tenants WHERE owner_account_id=${Number(req.auth.owner_id)})`:categories;}
export function visibleMenus(req:express.Request){
 const isSuperAdmin=req.auth?.role==='super_admin';
 return LOG_MENUS.filter(m=>isSuperAdmin||req.auth?.permissions.includes(m.permission));
}
