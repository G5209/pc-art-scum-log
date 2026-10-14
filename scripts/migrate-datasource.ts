import 'dotenv/config';
import {db} from '../apps/api/src/db';
import {SourceStore,importLegacy} from '../apps/api/src/lib/datasource';
async function main(){try{const imported=await importLegacy(new SourceStore(db));console.log(imported?'已导入旧日志源配置，密码已加密。':'无需导入旧配置。');}catch{console.error('旧配置导入失败，请在设置页配置日志源。');process.exitCode=1;}finally{db.close();}}
void main();
