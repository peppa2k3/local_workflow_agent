const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createScanner, settings } = require('../local-workflow-agent/src/scanner/scanner');
const { youtubeId, topicsFrom, evaluate } = require('../local-workflow-agent/src/scanner/checks');
const { download } = require('../local-workflow-agent/src/scanner/media');
const { run, binary } = require('../local-workflow-agent/src/integrations/video/video-download');
const protocol = require('../local-workflow-agent/shared/remote-protocol');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-'));
  const ids = ['abcdefghij0','abcdefghij1','abcdefghij2','abcdefghij3'], receipts = [];
  const fixture = path.join(dir, 'video.mp4');
  const server = http.createServer(async (req,res) => {
    if (req.url === '/video.mp4') { fs.createReadStream(fixture).pipe(res); return; }
    assert.equal(req.url, '/api/scanner/videos');
    assert.equal(req.headers.authorization, 'Bearer fixture-token');
    const body = await protocol.body(req);
    receipts.push(body);
    const status = body.video_id === ids[1] ? 'duplicate' : receipts.filter(r => r.submission_id === body.submission_id).length > 1 ? 'replayed' : 'accepted';
    if (receipts.length === 1) { req.socket.destroy(); return; }
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ status, record_id:body.video_id }));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const title = 'Bé con và gia đình', published = new Date(Date.now()-86400000).toISOString();
  const groups = topicsFrom('[gia-dinh]\nbé con\nbé con\ngia đình');
  const cfg = settings({ minViews:100, minDays:0,maxDays:10,minResolution:128 });
  const info = { duration:14399, automatic_captions:{}, subtitles:{vi:[{url:origin+'/sub'}]}, formats:[{language:'vi',width:160,height:128,
    acodec:'aac',vcodec:'h264',url:origin+'/video.mp4'}] };
  const input = {id:ids[0],title,views:1000,published};
  const assess = data => evaluate(input,groups,cfg,data);
  assert.equal(assess(info).verdict,'pass');
  assert.equal(assess({...info,duration:14400}).verdict,'reject');
  assert.equal(assess({...info,duration:0}).verdict,'reject');
  assert.equal(assess({...info,formats:[{...info.formats[0],language:'en'}]}).verdict,'reject');
  assert.equal(assess({...info,formats:[{...info.formats[0],language:undefined}]}).verdict,'unknown');
  assert.equal(assess({...info,subtitles:{}}).verdict,'reject');
  assert.equal(assess({...info,formats:[{...info.formats[0],height:64}]}).verdict,'reject');
  assert.equal(youtubeId('https://youtu.be/'+ids[0]+'?si=x'),youtubeId('https://www.youtube.com/watch?v='+ids[0]+'&pp=x'));
  assert.equal(youtubeId('https://example.org/watch?v='+ids[0]),null);
  assert.equal(groups[0].phrases.length,2);
  const opts = { directory:dir, key:'fixture', submit:payload=>protocol.post(origin,'/api/scanner/videos',{...payload,id:'local-fixture'},'fixture-token',{allowHttp:true}),
    inspect:async()=>info, request:async url=>({ok:true,json:async()=>({items:url.pathname.endsWith('/search') ? ids.map(videoId=>({id:{videoId}}))
      : ids.map((id,i)=>({id,snippet:{title:i===2?'Ngoài chủ đề':title,publishedAt:published}, statistics:{viewCount:'1000'}}))})}) };
  let scanner = createScanner(opts);
  const clock = Date.now;
  try {
    const keywords = '# giữ ghi chú\n[gia-dinh]\nbé con\ngia đình';
    scanner.saveSettings('config',cfg);
    scanner.saveSettings('keywords',keywords);
    assert.throws(() => scanner.saveSettings('keywords','[bad group]'));
    assert.throws(() => scanner.saveSettings('config',{...cfg,minDays:20}));
    assert.deepEqual(scanner.editor(),{config:cfg, keywords});
    assert.equal(fs.readFileSync(path.join(dir,'keywords.txt'),'utf8'),keywords);
    scanner.toggle(true);
    await scanner.scan();
    assert.equal(scanner.status().rows.filter(r=>r.status==='pending').length,3);
    assert.equal(scanner.status().rows.find(r=>r.video_id===ids[2]).checks.keyword.status,'reject');
    await scanner.flush();
    await scanner.close(); scanner = createScanner(opts);
    assert.equal(scanner.status().enabled,true);
    Date.now = () => clock()+6000;
    await scanner.flush(); await scanner.flush(); await scanner.flush();
    assert.equal(receipts[0].submission_id,receipts.findLast(r=>r.video_id===ids[0]).submission_id);
    const row = scanner.status().rows.find(r=>r.status==='synced' && r.video_id===ids[0]);
    assert.equal(scanner.exportVideos().length,2);
    assert.deepEqual(scanner.exportVideos().map(r=>r.video_id),[ids[0],ids[3]]);
    assert(!scanner.status().rows.some(r=>r.video_id===ids[1]));
    scanner.toggle(false);
    await scanner.scan();
    assert.equal(scanner.status().quota.used,2);
    fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({ ...cfg, requestsPerDay:2 }));
    scanner.toggle(true);
    await scanner.scan();
    assert.match(scanner.status().error,/ngân sách/);
    assert.equal(scanner.status().quota.used,2);
    scanner.toggle(false);
    await run(binary('ffmpeg','FFMPEG_PATH'),['-v','error','-f','lavfi','-i','color=c=blue:s=160x128:r=10:d=1',
      '-f','lavfi','-i','sine=duration=1','-metadata:s:a:0','language=vie','-shortest',fixture]);
    const json = path.join(dir,'fixture.json');
    fs.writeFileSync(json,JSON.stringify({id:row.video_id,title:'CON: Bé con?',extractor:'generic',webpage_url:origin+'/video.mp4',duration:1,
      formats:[{...info.formats[0],ext:'mp4',format_id:'fixture'}]}));
    const actual = await download(row,path.join(dir,'files'),AbortSignal.timeout(60000),['--load-info-json',json]);
    assert.match(path.basename(actual),/^Video tiếng Việt - .+ \[abcdefghij0\]\.mp4$/u);
    assert(fs.statSync(actual).size>0);
    console.log('Scanner verified quota, checks, restart, lost ACK replay, duplicate tombstone and real fixture download:',path.basename(actual));
  } finally { Date.now=clock; await scanner.close(); server.closeAllConnections(); await new Promise(r=>server.close(r)); fs.rmSync(dir,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1;});
