import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {db} from '../apps/api/src/db';
import {probeReport} from '../apps/api/src/probe';

function report(){
 const result=probeReport(db),filename=path.resolve('data/diagnostics/latency-results.json');
 fs.mkdirSync(path.dirname(filename),{recursive:true});
 fs.writeFileSync(filename,JSON.stringify(result,null,2),{mode:0o600});
 console.log(JSON.stringify({samples:result.samples,status:result.status,report:path.relative(process.cwd(),filename)}));
}
report();
if(process.argv.includes('--watch')){
 const timer=setInterval(report,60000);
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);db.close();process.exit(0);});
}else db.close();
