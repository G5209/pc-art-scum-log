import fs from 'node:fs/promises';
import path from 'node:path';
export interface OnlinePlayer {steam_id:string;name:string}
// The existing IPC listplayers result uses `steam_id | display_name` lines.
export function parseListPlayers(payload:any):OnlinePlayer[]{
 const value=payload?.result??payload;
 if(payload?.ok===false||typeof value?.output!=='string'||!Number.isInteger(value?.count)||value.count<0)throw new Error('invalid RCON response');
 const rows=value.output.split(/\r?\n/).filter((s:string)=>s.trim()).map((line:string)=>{const m=/^(7656119\d{10})\s*\|\s*(.+)$/.exec(line);if(!m)throw new Error('unconfirmed RCON player format');return {steam_id:m[1],name:m[2].trim()};});
 if(rows.length!==value.count||new Set(rows.map((p:OnlinePlayer)=>p.steam_id)).size!==rows.length)throw new Error('incomplete RCON response');return rows;
}
export class RconClient {
 get source():'rcon'|'http_api'{return this.options.url?'http_api':'rcon';}
 constructor(private options:{url?:string;token?:string;responseDir?:string}={url:process.env.RCON_READ_URL,token:process.env.RCON_READ_TOKEN,responseDir:process.env.RCON_RESPONSE_DIR??path.resolve('SCUM_RCON_IPC/data/ipc/responses')}){}
 async listPlayers():Promise<OnlinePlayer[]>{
  if(this.options.url){const url=new URL(this.options.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('invalid bridge URL');const res=await fetch(url,{method:'GET',headers:this.options.token?{Authorization:'Bearer '+this.options.token}:{},signal:AbortSignal.timeout(3000),redirect:'error'});if(!res.ok)throw new Error('RCON bridge unavailable');const text=await res.text();if(text.length>65536)throw new Error('response too large');return parseListPlayers(JSON.parse(text));}
  if(!this.options.responseDir)throw new Error('RCON unavailable');
  const files=(await fs.readdir(this.options.responseDir)).filter(n=>/^\d{8}-\d{6}-[a-f0-9]{4}\.json$/.test(n));
  const ordered=await Promise.all(files.map(async name=>({name,stat:await fs.stat(path.join(this.options.responseDir!,name))})));ordered.sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs);
  for(const f of ordered.slice(0,8)){if(f.stat.size>65536||Date.now()-f.stat.mtimeMs>30000)continue;const payload=JSON.parse(await fs.readFile(path.join(this.options.responseDir,f.name),'utf8'));if(payload?.ok===true&&payload?.result?.count!==undefined&&Number.isFinite(payload.timestamp)&&Math.abs(Date.now()-payload.timestamp*1000)<30000)return parseListPlayers(payload);}
  throw new Error('no fresh listplayers response');
 }
}
