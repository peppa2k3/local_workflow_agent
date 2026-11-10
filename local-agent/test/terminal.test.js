import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import os from 'node:os';
import {createTerminalManager,terminalLimits} from '../src/terminal.js';

class FakePty{
 onData(handler){this.dataHandler=handler}
 onExit(handler){this.exitHandler=handler}
 write(value){this.writes.push(value)}
 resize(cols,rows){this.dimensions=[cols,rows]}
 kill(signal){this.killed=signal||'SIGTERM';queueMicrotask(()=>this.exitHandler?.({exitCode:0,signal:0}))}
 data(value){this.dataHandler(value)}
 constructor(){this.writes=[]}
}
const ids=()=>({terminalId:randomUUID(),sessionId:randomUUID()});
async function withTimeout(promise,milliseconds,message){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds)})])}finally{clearTimeout(timer)}}

test('Terminal manager uses fixed Windows shells, filters environment and caps input/output',async()=>{
 const processMock=new FakePty(),output=[],exited=[];let invocation;
 const manager=createTerminalManager({platform:'win32',parentEnv:{USERPROFILE:process.cwd(),Path:'C:\\Windows\\System32',SystemRoot:'C:\\Windows',PRIVATE_TOKEN:'must-not-pass'},spawnPty:(...args)=>{invocation=args;return processMock},maxInputBytes:3,onOutput:event=>output.push(event),onExited:event=>exited.push(event)});
 const {terminalId,sessionId}=ids();assert.deepEqual(manager.open({terminalId,sessionId,shell:'cmd',cols:90,rows:24}),{terminalId,state:'connected'});
 assert.equal(invocation[0],'cmd.exe');assert.deepEqual(invocation[1],['/D']);assert.equal(invocation[2].name,'xterm-256color');assert.equal(invocation[2].cols,90);assert.equal(invocation[2].useConptyDll,true);assert.equal(invocation[2].env.Path,'C:\\Windows\\System32');assert.equal('PRIVATE_TOKEN' in invocation[2].env,false);
 assert.deepEqual(manager.input({terminalId,sessionId,data:'abc'}),{ok:true});assert.throws(()=>manager.input({terminalId,sessionId,data:'d'}),/input vượt giới hạn/);
 const closed=await new Promise(resolve=>{const poll=setInterval(()=>{if(exited.length){clearInterval(poll);resolve(exited[0])}},5)});assert.equal(closed.state,'closed');assert.equal(closed.reason,'input.limit');assert.equal(manager.activeSessions.length,0);
 assert.equal(terminalLimits.maxChunkBytes,4096);assert.throws(()=>manager.open({...ids(),shell:'powershell.exe'}),/Shell không được hỗ trợ/);
});

test('Terminal manager validates resize and emits output in bounded chunks',()=>{
 const processMock=new FakePty(),output=[];const manager=createTerminalManager({platform:'win32',parentEnv:{USERPROFILE:process.cwd()},spawnPty:()=>processMock,onOutput:event=>output.push(event)});const {terminalId,sessionId}=ids();manager.open({terminalId,sessionId,shell:'powershell'});
 assert.throws(()=>manager.resize({terminalId,sessionId,cols:1,rows:30}),/Kích thước/);assert.deepEqual(manager.resize({terminalId,sessionId,cols:120,rows:40}),{ok:true});assert.deepEqual(processMock.dimensions,[120,40]);
 processMock.data('x'.repeat(9000));assert.deepEqual(output.map(item=>Buffer.byteLength(item.text)),[4096,4096,808]);manager.close(terminalId,sessionId);assert.equal(processMock.killed,'SIGTERM');
});

function waitForOutput(output,predicate,timeoutMs=8000,start=0){return new Promise((resolve,reject)=>{const check=()=>{const text=output.slice(start).join('');if(predicate(text)){clearInterval(poll);clearTimeout(timer);resolve(text)}};const poll=setInterval(check,20);const timer=setTimeout(()=>{clearInterval(poll);reject(new Error('PTY output timeout'))},timeoutMs);check()})}

test('Windows PTY runs hostname, ipconfig, ping -t, Ctrl+C and closes CMD/PowerShell', {skip:process.platform!=='win32'}, async t=>{
 const output=[];let exitResolve;
 const exited=new Promise(resolve=>{exitResolve=resolve});
 const make=()=>createTerminalManager({maxSeconds:120,idleSeconds:60,onOutput:event=>output.push(event.text),onExited:event=>exitResolve(event)});
 const terminalManager=make();let powerShell,treeManager;const {terminalId,sessionId}=ids();terminalManager.open({terminalId,sessionId,shell:'cmd',cols:100,rows:30});
 const send=async(command,matcher)=>{terminalManager.input({terminalId,sessionId,data:command+'\r'});return waitForOutput(output,matcher)};
 try{
  await send('hostname',text=>text.toLowerCase().includes(os.hostname().toLowerCase()));
  await send('ipconfig',text=>text.toLowerCase().includes('windows ip configuration'));
  await send('ping -t 127.0.0.1',text=>text.includes('Reply from 127.0.0.1'));
  const beforeStop=output.length,stopped=waitForOutput(output,text=>text.includes('^C')||text.includes((process.env.USERPROFILE||'C:\\Users\\').replace(/\\$/,'')+'>'),8000,beforeStop);terminalManager.input({terminalId,sessionId,data:'\x03'});await stopped;
  terminalManager.close(terminalId,sessionId);assert.equal((await withTimeout(exited,5000,'CMD did not exit')).state,'closed');
  const second=ids();let secondExit;powerShell=createTerminalManager({maxSeconds:60,idleSeconds:30,onOutput:event=>output.push(event.text),onExited:event=>{secondExit=event}});powerShell.open({...second,shell:'powershell',cols:100,rows:30});const offset=output.length;powerShell.input({...second,data:'hostname\r'});await waitForOutput(output,text=>text.toLowerCase().includes(os.hostname().toLowerCase()),8000,offset);powerShell.close(second.terminalId,second.sessionId);const deadline=Date.now()+5000;while(!secondExit&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(secondExit?.state,'closed');
  const {spawnSync}=await import('node:child_process');const listPingPids=()=>{const result=spawnSync('tasklist.exe',['/FI','IMAGENAME eq ping.exe','/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);return [...result.stdout.matchAll(/"ping\.exe","(\d+)"/gi)].map(match=>Number(match[1]))};
  const baseline=listPingPids(),third=ids();const treeClosed=new Promise(resolve=>{treeManager=createTerminalManager({maxSeconds:60,idleSeconds:30,onOutput:event=>output.push(event.text),onExited:resolve})});treeManager.open({...third,shell:'cmd',cols:100,rows:30});const treeOffset=output.length;treeManager.input({...third,data:'ping -t 127.0.0.1\r'});await waitForOutput(output,text=>text.includes('Reply from 127.0.0.1'),8000,treeOffset);treeManager.close(third.terminalId,third.sessionId);await withTimeout(treeClosed,5000,'CMD process tree did not exit');
  const deadlineTree=Date.now()+3000;let remaining;do{await new Promise(resolve=>setTimeout(resolve,100));remaining=listPingPids().filter(pid=>!baseline.includes(pid))}while(remaining.length&&Date.now()<deadlineTree);try{assert.deepEqual(remaining,[],'ping.exe must not survive terminal close')}finally{for(const pid of remaining)spawnSync('taskkill.exe',['/PID',String(pid),'/T','/F'],{stdio:'ignore',windowsHide:true})}
 }finally{await terminalManager.closeAll('test.cleanup');await powerShell?.closeAll('test.cleanup');await treeManager?.closeAll('test.cleanup')}
 t.diagnostic(`Windows ${os.release()} PTY verified with Node ${process.version}`);
});
