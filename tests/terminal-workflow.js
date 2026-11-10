const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {pathToFileURL}=require('node:url');
const {agentDirectory}=require('../scripts/test-terminal-workflow');
(async()=>{
  if(!agentDirectory)throw Error('Workflow bridge source directory not found');
  const {createWorkflowClient}=await import(pathToFileURL(path.join(agentDirectory,'src/workflow.js')));
  const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'terminal-workflow-'));
  let child;
  try {
    const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
    fs.writeFileSync(path.join(temp,'Local State'),JSON.stringify({profile:{info_cache:{Default:{name:'Fixture'}}}}));
    fs.writeFileSync(path.join(temp,'fixture.json'),JSON.stringify({variables:{delay:30},steps:[{action:'wait',ms:'{{delay}}'}]}));
    const token='terminal-workflow-fixture-token-123456';
    const env={...process.env,LOCAL_AGENT_ENV_FILE:path.join(temp,'missing.env'),MONGODB_URI:'',LOCAL_AGENT_API_TOKEN:token,LOCAL_AGENT_PORT:String(port),LOCAL_AGENT_DATA_DIR:path.join(temp,'data'),LOCAL_AGENT_SCENARIOS_DIR:temp,CHROME_USER_DATA_DIR:temp,CHROME_PROFILE:'Default'};
    child=spawn(process.execPath,[path.join(root,'local-agent.js'),'--daemon'],{env,cwd:os.tmpdir(),stdio:['ignore','pipe','pipe']});
    let logs='';child.stdout.on('data',b=>{logs+=b});child.stderr.on('data',b=>{logs+=b});
    const client=createWorkflowClient({settings:()=>({enabled:true,token,baseUrl:`http://127.0.0.1:${port}`})});
    let ready=false;for(let i=0;i<80;i++){try{await client.request('profiles');ready=true;break;}catch{}await new Promise(r=>setTimeout(r,50));}assert(ready,logs);
    assert.deepEqual(await client.request('scenarios'),{names:['fixture']});
    assert.equal((await client.request('describe',{scenario:'fixture'})).variables.delay,30);
    const params={scenario:'fixture',profile:'Default',variables:{delay:50}};
    const run=await client.request('run',params,{requestId:'fixture-once'});
    assert.equal((await client.request('run',params,{requestId:'fixture-once'})).runId,run.runId);
    await assert.rejects(client.request('run',{...params,variables:{delay:2}},{requestId:'fixture-once'}),e=>e.status===409);
    await new Promise(r=>setTimeout(r,100));assert.equal((await client.request('status',{runId:run.runId})).state,'succeeded');
    const slow=await client.request('run',{...params,variables:{delay:60000}},{requestId:'fixture-stop'});
    assert.equal((await client.request('stop',{runId:slow.runId})).state,'cancelled');
    assert((await client.request('runs')).runs.some(item=>item.runId===slow.runId));
    // The CLI runs from another cwd and uses a local env file, without VPS credentials.
    const settingsFile=path.join(temp,'cli.env');fs.writeFileSync(settingsFile,`LOCAL_AGENT_API_TOKEN=${token}\nLOCAL_AGENT_PORT=${port}\n`);
    const cli=spawn(process.execPath,[path.join(agentDirectory,'workflow.js'),'scenarios'],{cwd:os.tmpdir(),env:{...process.env,WORKFLOW_AGENT_ENV_FILE:settingsFile,WORKFLOW_AGENT_URL:`http://127.0.0.1:${port}`,LOCAL_AGENT_API_TOKEN:token},stdio:['ignore','pipe','pipe']});
    let output='',errors='';cli.stdout.on('data',b=>{output+=b});cli.stderr.on('data',b=>{errors+=b});const [code]=await once(cli,'close');assert.equal(code,0,errors);assert.deepEqual(JSON.parse(output),{names:['fixture']});
    console.log('Terminal workflow: real loopback engine auth, catalog, variables, retry dedupe/conflict, history, stop and standalone CLI passed');
  } finally {
    if(child&&child.exitCode===null){const closed=once(child,'close');child.kill();await closed;}
    fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1});
