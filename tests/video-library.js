const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium } = require('playwright');
const { fixture } = require('./helpers/remote');
const { createCommandApi } = require('../control-server/src/commands');
const { evaluate, topicsFrom } = require('../local-workflow-agent/src/scanner/checks');
const { settings } = require('../local-workflow-agent/src/scanner/scanner');
const { createRemoteClient } = require('../local-workflow-agent/src/integrations/remote/remote-client');
const { createScenarioStore } = require('../local-workflow-agent/src/workflow/scenario-store');
const { overrideVariables } = require('../local-workflow-agent/src/workflow/variables');
const c = require('../control-server/shared/remote-protocol');

(async () => {
  const f = await fixture(createCommandApi), dir = fs.mkdtempSync(path.join(os.tmpdir(),'listen-local-'));
  let remote, browser;
  function device(owner) {
    const id = randomUUID(), token = c.token();
    f.store.put('device',{ id,name:'Máy '+id.slice(0,4),owner:owner.id,tokenHash:c.hash(token),metadata:{},lastSeen:0 },owner.id);
    return {id,token};
  }
  const first=device(f.alice), second=device(f.alice), isolated=device(f.bob);
  const push=(d,payload)=>c.post(f.origin,'/api/scanner/videos',{...payload,id:d.id},d.token,{allowHttp:true});
  const id='aB12Cd34Ef5';
  const cfg=settings({minViews:10,minDays:0,maxDays:40,minDurationSeconds:60});
  const input={id,title:'Gia đình',published:new Date(Date.now()-3600000).toISOString(),views:20};
  const checked=evaluate(input,topicsFrom('[family]\ngia đình'),cfg,{duration:60,formats:[
    {language:'vi',width:1920,height:1080,acodec:'aac',vcodec:'h264',url:'fixture'}],subtitles:{vi:[{url:'fixture'}]}});
  assert.equal(checked.verdict,'pass');
  const payload={...checked.payload,submission_id:randomUUID(),content_hash:{algorithm:'sha256',value:c.hash('media bytes'),verified:true}};
  try {
    const pair=await Promise.all([push(first,payload),push(second,{...payload,video_url:'https://youtu.be/'+id})]);
    assert.deepEqual(pair.map(r=>r.status).sort(),['accepted','duplicate']);
    const record_id=pair[0].record_id;
    assert.equal(pair[1].record_id,record_id);
    for (const [index,d] of [first,second].entries()) {
      assert.equal((await push(d,payload)).status,pair[index].status==='accepted'?'replayed':'duplicate');
    }
    function otherVideo(id) {
      return {...payload,submission_id:randomUUID(),video_id:id,video_url:'https://youtu.be/'+id};
    }
    const alias=otherVideo('abcdef12345');
    assert.equal((await push(second,alias)).reason,'same_sha256');
    assert.equal((await push(second,{...alias,submission_id:randomUUID(),content_hash:undefined})).record_id,record_id);
    const similar={...otherVideo('abcdef12346'),content_hash:undefined};
    assert.equal((await push(first,similar)).status,'accepted');
    await assert.rejects(push(first,{...similar,title:'changed'}),/reused/);
    await assert.rejects(push(first,{...similar,video_url:'https://example.com'}),/YouTube/);
    await assert.rejects(push(first,{...similar,checks:{}}),/checks/);
    await assert.rejects(push({...first,token:second.token},payload),/credential/);
    assert.equal((await push(isolated,payload)).status,'accepted');
    const client=f.browser(), bob=f.browser();
    await client('/api/login',{email:'alice@example.test',password:'long-password-alice'});
    await bob('/api/login',{email:'bob@example.test',password:'long-password-bob'});
    const rows=(await client('/api/scanner/videos')).videos;
    const tags = [first,second].map(d => '#Máy_' + d.id.slice(0,4));
    assert.deepEqual(rows.find(v => v.id === record_id).tags.sort(), [...new Set(tags)].sort());
    assert((await client('/api/scanner/videos?q=' + encodeURIComponent(tags[1]))).videos.some(v => v.id === record_id));
    assert.equal(rows.length,2); assert(rows.every(r=>!r.used && r.similar_title && !r.job_ids.length));
    assert.equal((await client('/api/scanner/videos?q=no-match')).total,0);
    assert.equal((await bob('/api/scanner/videos')).total,1);
    const scenario={variables:{video_url:'',reels_url:'https://example.test/reels',thu_muc_tai:dir,ten_phim:'{{download_title}}',ten_file:'{{download_file_name}}'},
      steps:[{action:'downloadVideo',url:'{{video_url}}',directory:'{{thu_muc_tai}}'}, {action:'type',selector:'#title',text:'{{ten_phim}}'}]};
    const scenarios=createScenarioStore(dir); scenarios.save('target',scenario);
    c.atomicJson(path.join(dir,'remote.json'),{url:f.origin,device:{id:first.id},token:first.token,policy:{scenarios:['target'],profiles:['Default'],variables:{target:['video_url']}}});
    let scanning=false,running=false;
    const runId=randomUUID();
    const options={dataDir:dir,profiles:()=>[{name:'Default',directory:'Default'}],scenarios,allowHttp:true,
      workflows:{status:()=>({running,executionId:runId,scenario:'target',extensionConnected:true})},
      scanActivity:()=>({enabled:true,scanning})};
    remote=createRemoteClient(options);
    await remote.tick();
    const get=()=>f.store.get('device',first.id);
    assert.equal(get().activity.canAccept,true);
    running=scanning=true;
    remote.activityChanged();
    for (let n=0;n<60 && !get().activity.scanning;n++) await new Promise(r=>setTimeout(r,20));
    assert.equal(get().activity.active[0].id,runId);
    assert.equal(get().activity.canAccept,false);
    remote.close();
    const offline=get(); offline.lastSeen=Date.now()-46000; offline.leaseUntil=0; f.store.put('device',offline,offline.owner);
    assert.equal((await client('/api/devices')).devices.find(d=>d.id===first.id).online,false);
    running=scanning=false; remote=createRemoteClient(options); await remote.tick();
    assert.equal(get().activity.runningCount,0); assert.equal(get().activity.scanning,false);
    assert.equal((await client('/api/devices')).devices.find(d=>d.id===first.id).online,true);
    const target={record_id,device_id:first.id,scenario:'target'};
    const pasted=await client('/api/scanner/variables',target);
    await bob('/api/scanner/variables',target,404);
    assert.equal(pasted.variables.thu_muc_tai,dir);
    assert.equal(pasted.variables.video_url,'https://www.youtube.com/watch?v='+id);
    assert.equal(pasted.variables.reels_url,scenario.variables.reels_url);
    assert.equal(pasted.variables.ten_file,'{{download_file_name}}');
    assert.equal(scenarios.prepare(overrideVariables(scenario,pasted.variables)).steps[1].text,'{{download_title}}');
    const job = await client('/api/commands', {requestId:randomUUID(),deviceId:first.id,type:'run',profile:'Default',scenario:'target',
      scheduledAt:Date.now()+3600000, variables:{video_url:alias.video_url}});
    const linked = (await client('/api/scanner/videos')).videos.find(v=>v.id===record_id);
    assert.deepEqual(linked.job_ids,[job.command.id]);
    assert.equal(linked.used,false);
    browser=await chromium.launch({channel:'chrome',headless:true});
    const ctx=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
    const page=await ctx.newPage(); await page.goto(f.origin);
    await page.locator('[name=email]').fill('alice@example.test'); await page.locator('[name=password]').fill('long-password-alice');
    await page.locator('#login-form button').click(); await page.getByRole('link',{name:'Kho video'}).click();
    await page.getByLabel('Tự tạo và giao job từ kho video').check();
    await page.getByLabel('Chờ khi hết slot (giờ)').fill('2.5');
    await page.getByRole('button',{name:'Lưu cài đặt'}).click();
    await page.getByText('Đã lưu cài đặt giao job.').waitFor();
    await page.reload();
    await page.locator('#assignment:visible').waitFor();
    assert.equal(await page.locator('#autoEnabled').isChecked(),true);
    assert.equal(await page.locator('#retryHours').inputValue(),'2.5');
    await page.locator('#device').selectOption(first.id);
    await page.locator('#scenario').selectOption('target');
    await page.locator('#query').fill(id);
    await page.waitForFunction(()=>document.querySelectorAll('#videos article').length===1);
    await page.getByRole('button',{name:'Copy biến scenario'}).click();
    await page.getByText('Đã sao chép.').waitFor();
    assert.deepEqual(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText())),pasted);
    console.log('Video library: authenticated concurrency, replay, duplicate aliases, isolated owners, heartbeat/reconnect and scenario clipboard passed');
  } finally { remote?.close(); await browser?.close(); await f.close(); fs.rmSync(dir,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1;});
