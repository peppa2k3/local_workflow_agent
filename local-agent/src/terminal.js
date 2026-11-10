import * as pty from 'node-pty';
import {spawn} from 'node:child_process';
import {statSync} from 'node:fs';
import {resolve} from 'node:path';

const SHELLS=Object.freeze({
 cmd:{file:'cmd.exe',args:['/D']},
 powershell:{file:'powershell.exe',args:['-NoLogo','-NoProfile','-NoExit']},
});
const MAX_INPUT_BYTES=1024*1024,MAX_OUTPUT_BYTES=4*1024*1024,MAX_CHUNK_BYTES=4096;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message){throw new Error(message)}
function finiteRange(value,min,max){return Number.isInteger(value)&&value>=min&&value<=max}
function envForShell(parent){
 const allowed=new Set(['path','systemroot','windir','pathext','comspec','homedrive','homepath','userprofile','username','userdomain','computername','appdata','localappdata','programdata','temp','tmp','psmodulepath','sessionname','lang']);
 const env={};for(const [key,value]of Object.entries(parent))if(allowed.has(key.toLowerCase()))env[key]=value;
 env.TERM='xterm-256color';env.COLORTERM='truecolor';return env;
}
function killPtyHandle(session){try{session.pty.kill()}catch{};try{session.pty._agent?._conoutSocketWorker?.dispose()}catch{}}
function killWindowsProcessTree(session,parentEnv){
 const pid=Number(session.pty.pid);if(!Number.isSafeInteger(pid)||pid<=0){session.emitError?.();killPtyHandle(session);return}
 if(session.treeKillInFlight||session.treeKillSucceeded)return;
 const systemRoot=parentEnv.SystemRoot||parentEnv.SYSTEMROOT||process.env.SystemRoot||'C:\\Windows',taskkill=resolve(systemRoot,'System32','taskkill.exe');session.treeKillInFlight=true;
 const failed=()=>{session.treeKillInFlight=false;session.emitError?.();killPtyHandle(session)};
 try{const child=spawn(taskkill,['/PID',String(pid),'/T','/F'],{cwd:session.cwd,env:envForShell(parentEnv),stdio:'ignore',windowsHide:true,shell:false});child.once('error',failed);child.once('close',code=>{session.treeKillInFlight=false;if(code===0)session.treeKillSucceeded=true;else session.emitError?.();killPtyHandle(session)})}catch{failed()}
}

export function createTerminalManager({spawnPty=pty.spawn,platform=process.platform,parentEnv=process.env,maxSeconds=1800,idleSeconds=600,maxInputBytes=MAX_INPUT_BYTES,maxOutputBytes=MAX_OUTPUT_BYTES,onOpened=()=>{},onOutput=()=>{},onExited=()=>{},onError=()=>{}}={}){
 const sessions=new Map();
 const emit=fn=>{try{fn()}catch{}};
 function chunks(text){let result=[],chunk='',size=0;for(const character of text){const bytes=Buffer.byteLength(character,'utf8');if(size+bytes>MAX_CHUNK_BYTES){result.push(chunk);chunk='';size=0}chunk+=character;size+=bytes}if(chunk)result.push(chunk);return result}
 function finish(session,exitCode,signal){
  if(session.finished)return;session.finished=true;clearTimeout(session.idleTimer);clearTimeout(session.maxTimer);clearTimeout(session.killTimer);clearTimeout(session.treeKillTimer);sessions.delete(session.terminalId);
  const state=session.closeReason?'closed':'exited';emit(()=>onExited({terminalId:session.terminalId,sessionId:session.sessionId,state,reason:session.closeReason||'process.exit',exitCode:Number.isInteger(exitCode)?exitCode:null,signal:Number.isInteger(signal)?signal:null,durationMs:Math.max(0,Date.now()-session.startedAt)}));session.resolveClosed?.();
 }
 function close(session,reason='user.closed'){
  if(!session||session.finished||session.closeReason)return false;
  session.closeReason=reason;session.state='closing';clearTimeout(session.idleTimer);clearTimeout(session.maxTimer);
  if(platform==='win32')killWindowsProcessTree(session,parentEnv);else{try{session.pty.kill()}catch{}}
  session.killTimer=setTimeout(()=>{if(session.finished)return;if(platform==='win32')killWindowsProcessTree(session,parentEnv);else{try{session.pty.kill('SIGKILL')}catch{}}},2000);session.killTimer.unref?.();return true;
 }
 function touch(session){clearTimeout(session.idleTimer);session.idleTimer=setTimeout(()=>close(session,'idle.timeout'),idleSeconds*1000);session.idleTimer.unref?.()}
 function open({terminalId,sessionId,shell,cols=100,rows=30}){
  if(platform!=='win32')fail('Remote Terminal chỉ hỗ trợ Windows');
  if(!ID.test(terminalId||'')||!ID.test(sessionId||''))fail('Terminal identity không hợp lệ');
  if(!Object.hasOwn(SHELLS,shell))fail('Shell không được hỗ trợ');
  if(!finiteRange(cols,20,300)||!finiteRange(rows,5,120))fail('Kích thước terminal không hợp lệ');
  if(sessions.size)fail('Máy này đã có một Terminal session');
  const cwd=resolve(parentEnv.USERPROFILE||process.cwd());try{if(!statSync(cwd).isDirectory())fail('Working directory local không hợp lệ')}catch{fail('Working directory local không khả dụng')}
  const config=SHELLS[shell],child=spawnPty(config.file,config.args,{name:'xterm-256color',cols,rows,cwd,env:envForShell(parentEnv),useConptyDll:true});
  let resolveClosed;const closed=new Promise(resolve=>{resolveClosed=resolve});
  const session={terminalId,sessionId,shell,pty:child,cwd,startedAt:Date.now(),state:'connected',closeReason:null,finished:false,inputBytes:0,outputBytes:0,idleTimer:null,maxTimer:null,killTimer:null,treeKillInFlight:false,treeKillSucceeded:false,closed,resolveClosed,emitError:()=>emit(()=>onError({terminalId,sessionId,error:'Không thể dừng cây tiến trình Terminal'}))};sessions.set(terminalId,session);
  child.onData(data=>{if(session.finished||session.closeReason)return;const size=Buffer.byteLength(data,'utf8');if(session.outputBytes+size>maxOutputBytes){emit(()=>onError({terminalId,sessionId,error:'Terminal output vượt giới hạn'}));close(session,'output.limit');return}session.outputBytes+=size;for(const text of chunks(data))emit(()=>onOutput({terminalId,sessionId,text}))});
  child.onExit(({exitCode,signal})=>finish(session,exitCode,signal));
  session.maxTimer=setTimeout(()=>close(session,'session.timeout'),maxSeconds*1000);session.maxTimer.unref?.();touch(session);
  emit(()=>onOpened({terminalId,sessionId,shell,startedAt:session.startedAt}));
  return {terminalId,state:'connected'};
 }
 function input({terminalId,sessionId,data}){
  const session=sessions.get(terminalId);if(!session||session.sessionId!==sessionId||session.state!=='connected')fail('Terminal session chưa kết nối');
  if(typeof data!=='string'||!data||Buffer.byteLength(data,'utf8')>MAX_CHUNK_BYTES)fail('Terminal input không hợp lệ');
  const size=Buffer.byteLength(data,'utf8');if(session.inputBytes+size>maxInputBytes){close(session,'input.limit');fail('Terminal input vượt giới hạn')}
  session.inputBytes+=size;touch(session);session.pty.write(data);return {ok:true};
 }
 function resize({terminalId,sessionId,cols,rows}){
  const session=sessions.get(terminalId);if(!session||session.sessionId!==sessionId||session.state!=='connected')fail('Terminal session chưa kết nối');
  if(!finiteRange(cols,20,300)||!finiteRange(rows,5,120))fail('Kích thước terminal không hợp lệ');
  session.pty.resize(cols,rows);touch(session);return {ok:true};
 }
 function closeById(terminalId,sessionId,reason='user.closed'){
  const session=sessions.get(terminalId);if(!session||session.sessionId!==sessionId)return false;return close(session,reason);
 }
 async function closeAll(reason='agent.shutdown'){
  const current=[...sessions.values()];if(!current.length)return;for(const session of current)close(session,reason);
  let timer;try{await Promise.race([Promise.all(current.map(session=>session.closed)),new Promise(resolve=>{timer=setTimeout(resolve,3000)})])}finally{clearTimeout(timer)}
 }
 return {open,input,resize,close:closeById,closeAll,get activeSessions(){return [...sessions.values()].map(({terminalId,sessionId,shell,state,startedAt})=>({terminalId,sessionId,shell,state,startedAt}))}};
}

export const terminalLimits=Object.freeze({maxInputBytes:MAX_INPUT_BYTES,maxOutputBytes:MAX_OUTPUT_BYTES,maxChunkBytes:MAX_CHUNK_BYTES});
