const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.join(__dirname,'public'),argPort=process.argv.indexOf('--port'),port=Number(argPort>=0?process.argv[argPort+1]:(process.env.PORT||5173)),host=process.env.HOST||'127.0.0.1',api=process.env.API_PROXY_TARGET||'http://127.0.0.1:3000';
const buffers=new Map();
function proxy(req,res){const target=new URL(req.url,api),r=http.request({hostname:target.hostname,port:target.port,path:target.pathname+target.search,method:req.method,headers:{...req.headers,host:target.host}},up=>{res.writeHead(up.statusCode||502,up.headers);up.pipe(res);res.on('close',()=>up.destroy());});r.on('error',()=>{if(!res.headersSent){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'接口暂时不可用，请重试'}));}else res.end();});req.pipe(r);res.on('close',()=>r.destroy());}
async function file(req,res){try{
 const parsed=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(parsed.pathname),candidate=path.resolve(root,'.'+pathname);
 if(candidate!==root&&!candidate.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 let filePath=candidate;try{if(fs.statSync(filePath).isDirectory())filePath=path.join(root,'index.html');}catch{if(path.extname(pathname)){res.writeHead(404);return res.end();}filePath=path.join(root,'index.html');}
 const stat=await fs.promises.stat(filePath),extension=path.extname(filePath),type={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json'}[extension]||'application/octet-stream';
 const encoding=/\bgzip\b/.test(req.headers['accept-encoding']||'')&&/\.(js|css|html|json|svg)$/.test(filePath)&&stat.size>1024?'gzip':'identity';
 const key=filePath+':'+stat.mtimeMs+':'+encoding;let cached=buffers.get(key);
 if(!cached){const raw=await fs.promises.readFile(filePath),body=encoding==='gzip'?await new Promise((resolve,reject)=>zlib.gzip(raw,(e,b)=>e?reject(e):resolve(b))):raw;cached={body,etag:'"'+crypto.createHash('sha1').update(body).digest('hex')+'"'};if(buffers.size>64)buffers.clear();buffers.set(key,cached);}
 res.setHeader('Content-Type',type);res.setHeader('Vary','Accept-Encoding');res.setHeader('ETag',cached.etag);
 res.setHeader('Cache-Control',extension!=='.html'&&parsed.searchParams.has('v')?'public, max-age=31536000, immutable':'no-cache');
 if(encoding!=='identity')res.setHeader('Content-Encoding',encoding);
 if(req.headers['if-none-match']===cached.etag){res.writeHead(304);return res.end();}
 res.setHeader('Content-Length',cached.body.length);res.end(req.method==='HEAD'?undefined:cached.body);
 }catch{if(!res.headersSent)res.writeHead(500);res.end();}}
http.createServer((req,res)=>req.url.startsWith('/api/')?proxy(req,res):void file(req,res)).listen(port,host,()=>console.log(`网页服务已启动 ${host}:${port}`));
