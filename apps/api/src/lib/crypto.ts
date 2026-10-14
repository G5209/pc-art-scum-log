import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function dataKey(filename=path.resolve('data/.datakey')):Buffer {
 const configured=process.env.DATA_KEY;
 if(configured){const key=/^[a-f\d]{64}$/i.test(configured)?Buffer.from(configured,'hex'):Buffer.from(configured,'base64');if(key.length!==32)throw new Error('DATA_KEY 必须是 32 字节的十六进制或 Base64 密钥');return key;}
 fs.mkdirSync(path.dirname(filename),{recursive:true});
 if(!fs.existsSync(filename)){try{fs.writeFileSync(filename,crypto.randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(!fs.existsSync(filename))throw e;}}
 const key=fs.readFileSync(filename);if(key.length!==32)throw new Error('本地数据密钥无效');fs.chmodSync(filename,0o600);return key;
}
export function encrypt(value:string,key=dataKey()):string {
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');
}
export function decrypt(value:string,key=dataKey()):string {
 const bytes=Buffer.from(value,'base64');if(bytes.length<28)throw new Error('密文无效');
 const cipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(-16));
 return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString('utf8');
}
