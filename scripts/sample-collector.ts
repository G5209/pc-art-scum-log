import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import 'dotenv/config';
import {configuredSource} from '../apps/api/src/lib/logsource';
import {db} from '../apps/api/src/db';
import {families} from '../apps/api/src/tail/config';
import {parseDocument} from '../packages/parser/src/document';

const dir=path.resolve('data/raw/samples');
fs.mkdirSync(dir,{recursive:true});
const statePath=path.join(dir,'.collector-state.json');
type Sample={family:string;file:string;line:number;raw:string;hash:string};
type State={seen:Record<string,string>;pending:Record<string,Sample[]>};
const state:State=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):{seen:{},pending:{}};
function clean(bytes:Buffer){let b=bytes;if(b.length%2)b=b.subarray(1);const text=b.toString('utf16le').replace(/^\uFEFF/,'');const first=text.indexOf('\n');return Buffer.from((first>=0?text.slice(first+1):text),'utf16le');}
async function main(){
 const t=configuredSource(db);let reviews=0;
 try{
  const files=await t.list();
  for(const family of families){
   if(family==='unknown')continue;
   const f=files.filter(x=>x.name.startsWith(family+'_')).sort((a,b)=>b.size-a.size)[0];
   if(!f||f.size<2048)continue;
   const bytes=await t.read(f.name,Math.max(0,f.size-5_000_000),5_000_000);
   const parsed=parseDocument(clean(bytes),f.name);
   const unknown:Sample[]=parsed.events.filter(e=>e.event_type==='unknown').map(e=>({family,file:f.name,line:e.source_line_no,raw:e.raw,hash:crypto.createHash('sha1').update(e.raw).digest('hex')}));
   const key=family+'|'+f.name+'|'+f.size;
   const fresh=unknown.filter(u=>state.seen[u.hash]!==key);
   for(const u of fresh)state.seen[u.hash]=key;
   const pending=state.pending[family]??[];pending.push(...fresh);
   if(pending.length>=50){
    const out=path.join(dir,`review-${family}-${new Date().toISOString().replace(/[:.]/g,'')}.json`);
    fs.writeFileSync(out,JSON.stringify({family,created_at:new Date().toISOString(),sample_count:pending.length,samples:pending},null,2),{mode:0o600});state.pending[family]=[];reviews++;
   }else state.pending[family]=pending;
  }
  fs.writeFileSync(statePath,JSON.stringify(state),{mode:0o600});
  console.log(JSON.stringify({families:families.length-1,reviews}));
 }finally{t.close();db.close();}
}
main().catch(()=>{process.exitCode=1});
