const {spawn}=require('node:child_process');const npm=process.platform==='win32'?'npm.cmd':'npm';
const api=spawn(npm,['run','dev:api'],{stdio:'inherit',shell:process.platform==='win32'});const web=spawn(npm,['--workspace','apps/web','run','serve'],{stdio:'inherit',shell:process.platform==='win32',env:{...process.env,API_PROXY_TARGET:'http://127.0.0.1:3000',PORT:'5173'}});const children=[api,web];
let stopping=false;
function stop(){if(stopping)return;stopping=true;for(const child of children){if(process.platform==='win32')spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else child.kill('SIGTERM');}}
process.on('SIGINT',stop);process.on('SIGTERM',stop);for(const child of children)child.on('exit',code=>{stop();process.exitCode=code??0;});
