import {io} from 'socket.io-client';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {createStatusSampler,parseStatusIntervalSeconds} from './status.js';
import {createTerminalManager} from './terminal.js';
import {createWorkflowClient,bindWorkflowSocket} from './workflow.js';
const url=process.env.SERVER_URL||'http://localhost:4000';
const statusIntervalSeconds=parseStatusIntervalSeconds();
function terminalSeconds(name,fallback,min,max){const raw=process.env[name];if(raw===undefined||raw==='')return fallback;const value=Number(raw);if(!Number.isInteger(value)||value<min||value>max)throw Error(`${name} doit être entre ${min} et ${max} secondes`);return value}
const terminalMaxSeconds=terminalSeconds('TERMINAL_MAX_SECONDS',1800,60,3600),terminalIdleSeconds=terminalSeconds('TERMINAL_IDLE_SECONDS',600,60,1800);
const endpoint=new URL(url);if(endpoint.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)&&process.env.ALLOW_INSECURE_REMOTE!=='true')throw Error('Kết nối VPS bắt buộc HTTPS');
const file=resolve(process.env.CREDENTIALS_PATH||'./data/credentials.json');
const rl=createInterface({input:process.stdin,output:process.stdout});
let credential;
if(existsSync(file)){credential=JSON.parse(readFileSync(file,'utf8'));if(credential.server!==url)throw Error('Credential thuộc server khác; ghép cặp lại bằng file mới')}else{
 const code=process.env.PAIR_CODE;if(!code)throw Error('Điền PAIR_CODE trong local-agent/.env');
 const answer=await rl.question(`Cho phép ghép cặp máy này với ${url}? Gõ YES: `);if(answer!=='YES')throw Error('Đã từ chối ghép cặp');
 const res=await fetch(url+'/api/agents/enroll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});const data=await res.json();if(!res.ok)throw Error(data.error);
 credential={...data,server:url};mkdirSync(dirname(file),{recursive:true,mode:0o700});writeFileSync(file,JSON.stringify(credential),{mode:0o600});console.log('Ghép cặp thành công; xóa PAIR_CODE khỏi .env.');
}
const socket=io(url,{auth:{kind:'agent',credential:credential.credential},transports:['websocket'],reconnectionDelay:1000,reconnectionDelayMax:10000,randomizationFactor:.5});
let active=null,offered=null,promptAbort=null,statusTimer=null,statusBusy=false,statusErrorLogged=false,disconnectCleanup=Promise.resolve();
const workflowClient=createWorkflowClient();
const workflowSocket=bindWorkflowSocket({socket,getSession:()=>active,client:workflowClient});
const statusSampler=createStatusSampler({maxSampleGapMs:statusIntervalSeconds*2000});
const terminalManager=createTerminalManager({maxSeconds:terminalMaxSeconds,idleSeconds:terminalIdleSeconds,
 onOpened:payload=>socket.emit('terminal:opened',payload),
 onOutput:payload=>socket.emit('terminal:output',payload),
 onExited:payload=>socket.emit('terminal:exited',payload),
 onError:payload=>socket.emit('terminal:error',payload),
});
async function reportStatus(){
 if(!socket.connected||statusBusy)return;
 statusBusy=true;
 try{
  const status=await statusSampler.sample();
  if(status&&socket.connected)socket.timeout(5000).emit('agent:status',status,(err,result)=>{if(err||result?.error){if(!statusErrorLogged)console.error('Không gửi được status thiết bị tới VPS');statusErrorLogged=true}else statusErrorLogged=false});
  else statusErrorLogged=false;
 }catch{if(!statusErrorLogged)console.error('Không đọc được status CPU/RAM/mạng trên máy này');statusErrorLogged=true}
 finally{statusBusy=false}
}
socket.on('connect',async()=>{console.log('Đã kết nối VPS');await disconnectCleanup;if(!socket.connected)return;socket.emit('agent:terminal-capabilities',{platform:process.platform,shells:process.platform==='win32'?['cmd','powershell']:[]});socket.emit('agent:workflow-capabilities',workflowClient.capabilities());socket.emit('agent:terminal-state',terminalManager.activeSessions,state=>{if(state?.error)console.error('Không đồng bộ được trạng thái Terminal')});statusSampler.reset();void reportStatus();statusTimer=setInterval(()=>void reportStatus(),statusIntervalSeconds*1000)});
socket.on('connect_error',e=>console.error('Lỗi kết nối:',e.message));
socket.on('disconnect',()=>{disconnectCleanup=terminalManager.closeAll('agent.disconnected');if(statusTimer)clearInterval(statusTimer);statusTimer=null;statusSampler.reset();active=null;offered=null;promptAbort?.abort();console.log('Mất kết nối; phiên điều khiển đã hủy')});
socket.on('session:offer',async p=>{
 promptAbort?.abort();offered=p.sessionId;let accept=process.env.AUTO_APPROVE_SESSIONS==='true';
 if(!accept){const controller=new AbortController();promptAbort=controller;const timer=setTimeout(()=>controller.abort(),Math.max(1,p.expires-Date.now()));try{accept=(await rl.question(`\n${p.userName}${p.owner?' [OWNER]':''} xin điều khiển. Gõ YES để chấp nhận: `,{signal:controller.signal}))==='YES'}catch{accept=false}finally{clearTimeout(timer);if(promptAbort===controller)promptAbort=null}}
 if(offered!==p.sessionId||Date.now()>=p.expires||!socket.connected)return;
 socket.emit('session:ack',{sessionId:p.sessionId,nonce:p.nonce,accept},r=>{if(r?.error)console.error(r.error)});
});
socket.on('session:active',p=>{active=p;offered=null;console.log('Phiên được cấp hoặc gia hạn:',p.sessionId)});
socket.on('session:revoked',p=>{for(const terminal of terminalManager.activeSessions)if(terminal.sessionId===p.sessionId)terminalManager.close(terminal.terminalId,p.sessionId,'lease.revoked');if(active?.sessionId===p.sessionId)active=null;if(offered===p.sessionId){offered=null;promptAbort?.abort()}console.log('Phiên bị thu hồi:',p.reason)});
socket.on('terminal:open',(p,ack)=>{try{if(process.platform!=='win32'||!p||active?.sessionId!==p.sessionId||Date.now()>=active.expires)throw Error('Lease không còn hiệu lực');const result=terminalManager.open(p);ack?.({ok:true,...result})}catch(e){ack?.({error:e.message||'Không thể mở Terminal'})}});
socket.on('terminal:input',(p,ack)=>{try{if(!p||active?.sessionId!==p.sessionId||Date.now()>=active.expires)throw Error('Lease không còn hiệu lực');ack?.(terminalManager.input(p))}catch(e){ack?.({error:e.message||'Không thể gửi input Terminal'})}});
socket.on('terminal:resize',(p,ack)=>{try{if(!p||active?.sessionId!==p.sessionId||Date.now()>=active.expires)throw Error('Lease không còn hiệu lực');ack?.(terminalManager.resize(p))}catch(e){ack?.({error:e.message||'Không thể resize Terminal'})}});
socket.on('terminal:close',(p,ack)=>{const closed=!!p&&terminalManager.close(p.terminalId,p.sessionId,'user.closed');ack?.({ok:true,closing:closed})});
const beat=setInterval(()=>{if(socket.connected)socket.emit('agent:heartbeat',{},()=>{});if(active&&Date.now()>=active.expires){for(const terminal of terminalManager.activeSessions)if(terminal.sessionId===active.sessionId)terminalManager.close(terminal.terminalId,terminal.sessionId,'lease.expired');active=null;console.log('Lease hết hạn tại local')}},5000);
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,async()=>{clearInterval(beat);if(statusTimer)clearInterval(statusTimer);workflowSocket.close();await terminalManager.closeAll('agent.shutdown');socket.disconnect();rl.close();process.exit(0)});
