import {it,expect} from 'vitest';
import express from 'express';
import {installStreams} from './sse';
it('real streams heartbeat, reject excess clients and release disconnected slots',async()=>{
 const app=express(),manager=installStreams(app,2,20);
 app.get('/api/events/live',(_req,res)=>{res.type('text/event-stream');res.flushHeaders();res.write('retry: 2000\n\n');});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const url=`http://127.0.0.1:${(server.address() as any).port}/api/events/live`,a=new AbortController(),b=new AbortController();
 try{
  const first=await fetch(url,{signal:a.signal}),second=await fetch(url,{signal:b.signal});expect(manager.status().active).toBe(2);
  expect((await fetch(url)).status).toBe(503);
  const reader=first.body!.getReader();let text='';while(!text.includes('心跳'))text+=new TextDecoder().decode((await reader.read()).value);expect(text).toContain(': 心跳');
  a.abort();await second.body!.cancel();b.abort();
  for(let i=0;i<30&&manager.status().active;i++)await new Promise(resolve=>setTimeout(resolve,10));
  expect(manager.status().active).toBe(0);
 }finally{a.abort();b.abort();manager.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
