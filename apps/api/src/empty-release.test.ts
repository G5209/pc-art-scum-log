import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';
import {it, expect} from 'vitest';
import {createApp} from './app';

it('boots with no logs or private configuration, creates a random admin and survives an unavailable source', async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scum-empty-release-'));
 const db=new Database(path.join(dir,'scum.db'));
 const credentials=path.join(dir,'first-admin.txt');
 const factory=()=>({async connect(){throw new Error('synthetic-disconnected');},async list(){return [];},async stat(){return {size:0,mtime:0};},async read(){return Buffer.alloc(0);},close(){}});
 const app=createApp(db,{dbPath:path.join(dir,'scum.db'),rawDir:path.join(dir,'raw'),firstAdminPath:credentials,dataKeyFile:path.join(dir,'.datakey'),sourceFactory:factory});
 try{
  for(const table of ['events','players','sessions','datasource'])expect((db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as any).n).toBe(0);
  expect((db.prepare('SELECT username FROM users').get() as any).username).toBe('admin');
  const password=fs.readFileSync(credentials,'utf8').match(/密码：([^\r\n]+)/)![1];
  expect(password.length).toBeGreaterThanOrEqual(12);
  const agent=request.agent(app);
  expect((await agent.post('/api/auth/login').send({username:'admin',password})).status).toBe(200);
  const me=await agent.get('/api/auth/me');
  const csrf=me.body.csrfToken;
  expect((await agent.get('/api/datasource/status')).body.configured).toBe(false);
  expect((await agent.get('/api/events')).body.data).toEqual([]);
  const config={name:'示例源',type:'sftp',host:'your-server.invalid',port:22,username:'your_username',password:'your_password',auth_type:'password',remote_log_dir:'/path/to/logs',enabled:0};
  expect((await agent.post('/api/datasource').set('X-CSRF-Token',csrf).send(config)).status).toBe(201);
  expect((await agent.post('/api/datasource/test').set('X-CSRF-Token',csrf).send({})).status).toBe(400);
  expect((await agent.get('/api/datasource/status')).body.last_test_status).toBe('failed');
  expect((await agent.get('/api/health')).status).toBe(200);
 }finally{app.locals.close();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
