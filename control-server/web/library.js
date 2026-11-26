const $ = id => document.getElementById(id);
let csrf, devices = [], page = 0, generation = 0, debounce;
let visibleVideos = [];
const selectedVideos = new Set();
async function api(route, data) {
  const response = await fetch(route,{method:data?'POST':'GET',headers:{'content-type':'application/json','x-csrf-token':csrf || ''},
    body:data ? JSON.stringify(data) : undefined});
  if (response.status === 401) throw Error('Mở trang Thiết bị và đăng nhập để xem kho video.');
  const body = await response.json();
  if (!response.ok) throw Error(body.error);
  return body;
}
function action(fn) { Promise.resolve().then(fn).catch(e=>{ toast.error(e.message); }); }
function node(tag,text) { const n=document.createElement(tag); n.textContent=text; return n; }
function options(select, pairs) {
  const saved = select.value;
  select.replaceChildren(...pairs.map(([value,label])=>new Option(label,value)));
  if (pairs.some(([value])=>value===saved)) select.value=saved;
}
let quotaData = {quotas:[]};
function selectedScenario() {
  return devices.find(d=>d.id===$('device').value)?.metadata.scenarios?.find(s=>s.name===$('scenario').value);
}
function showQuota() {
  const scenario=selectedScenario();
  const id=scenario?.assignment?.id ?? scenario?.name;
  const quota=quotaData.quotas.find(q=>q.scenarioId===id);
  $('dailyLimit').value=quota?.limit ?? '';
  $('saveLimit').disabled=!id;
  $('quotaStatus').textContent=id ? id+' · Đã giao hôm nay: '+(quota && quota.day===quotaData.day ? quota.count : 0) : '';
}
function targets() {
  const device=devices.find(d=>d.id===$('device').value);
  options($('scenario'),(device?.metadata.scenarios || []).filter(s=>s.libraryTarget || s.assignment).map(s=>[s.name,s.name]));
  showQuota();
}
function row(v) {
  const article=node('article',''); article.className='video-card';
  const header=node('div',''); header.className='video-badges';
  const status=node('span',v.used?'Đã dùng':'Chưa dùng');
  status.className=v.used?'used':'available'; header.append(status);
  if (v.similar_title) header.append(node('span','Nghi trùng tiêu đề'));
  const link=node('a',v.title || v.video_url); link.href=v.video_url; link.target='_blank'; link.rel='noopener';
  const heading=node('h3',''); heading.append(link);
  const meta=node('dl','');
  function field(label,value) {
    const group=node('div',''); group.append(node('dt',label),node('dd',value)); meta.append(group);
  }
  function date(value) { return new Date(value).toLocaleString('vi-VN'); }
  field('Chủ đề',v.type_topic || '—'); field('Nguồn',v.source_name || '—');
  field('Thời điểm đo',date(v.measured_at)); field('Tiếp nhận',date(v.received_at));
  field('Job',v.job_ids.join(', ') || 'Chưa có');
  if (v.next_attempt_at && !v.used) field('Xét lại lúc',date(v.next_attempt_at));
  if (v.assignment_job) field('Job tự động',[v.assignment_job,v.assignment_state].filter(Boolean).join(' · '));
  const selection=node('input',''); selection.type='checkbox'; selection.className='video-select'; selection.setAttribute('aria-label','Chọn video '+(v.title || v.video_id));
  selection.checked=selectedVideos.has(v.id);
  selection.onchange=()=>{ if (selection.checked) selectedVideos.add(v.id); else selectedVideos.delete(v.id); updateSelection(); };
  article.classList.toggle('is-selected',selection.checked);
  const thumb=node('div',''); thumb.className='video-thumb';
  const image=document.createElement('img'); image.alt=''; image.loading='lazy'; image.referrerPolicy='no-referrer';
  image.onerror=()=>image.remove();
  image.src='https://i.ytimg.com/vi/'+encodeURIComponent(v.video_id)+'/mqdefault.jpg';
  const seconds=Math.floor(v.duration_seconds);
  thumb.append(image,node('small',Number.isFinite(seconds) && seconds>=0 ? Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0') : '—'));
  const title=node('div',''); title.className='video-title'; title.append(heading);
  const facts=node('div',''); facts.className='video-facts';
  const published=v.published_at ? Date.parse(v.published_at) : NaN;
  const days=Number.isFinite(published) ? Math.max(0,Math.floor((Date.now()-published)/86400000)) : null;
  facts.append(node('span',days===null ? '—' : days===0 ? 'Hôm nay' : days+' ngày trước'));
  facts.append(node('span',Number.isFinite(v.view_count) ? v.view_count.toLocaleString('vi-VN')+' lượt xem' : '—'));
  const source=node('span',v.source_name || '—'); source.className='video-source';
  article.append(selection,thumb,title,facts,source,header);
  const tags=node('div',''); tags.className='video-tags';
  for (const tag of v.tags) {
    const badge=node('button',tag);
    badge.onclick=()=>{ $('query').value=tag; page=0; action(refresh); };
    tags.append(badge);
  }
  if (tags.childElementCount) title.append(tags);
  const details=node('details',''); details.append(node('summary','Kết quả kiểm tra'));
  for (const [key,check] of Object.entries(v.checks)) details.append(node('p',key+' · '+check.status+' · '+check.reason));

  const actions=node('div',''); actions.className='video-actions';
  function copy(label,get) {
    const btn=node('button',label);
    btn.onclick=()=>action(async()=>{ const text=await get(); await navigator.clipboard.writeText(text); toast.success('Đã sao chép.'); });
    actions.append(btn);
  }
  copy('Copy URL',()=>v.video_url);
  copy('Copy JSON bản ghi',()=>JSON.stringify(v,null,2));
  copy('Copy biến scenario',async()=>{
    if (!$('scenario').value) throw Error('Chọn máy và kịch bản có cấu hình tải/đăng.');
    const value=await api('/api/scanner/variables',{record_id:v.id,device_id:$('device').value,scenario:$('scenario').value});
    return JSON.stringify(value,null,2);
  });
  const assign=node('button','Giao job cho máy đã chọn');
  assign.disabled=v.used;
  assign.onclick=()=>action(async()=>{
    if (!selectedScenario()) throw Error('Chọn máy và kịch bản đích.');
    assign.disabled=true;
    try {
      const job=await api('/api/scanner/assign',{record_id:v.id,device_id:$('device').value,scenario:$('scenario').value});
      toast.success('Đã giao job '+job.id);
      await refresh();
    } finally { assign.disabled=v.used; }
  });
  actions.prepend(assign);
  const menu=node('details',''); menu.className='video-options';
  menu.append(node('summary','Tùy chọn'));
  const toggle=node('button',v.used?'Đánh dấu chưa dùng':'Đánh dấu đã dùng');
  const remove=node('button','Xóa video'); remove.className='remove-video';
  function submit(option) {
    toggle.disabled=remove.disabled=true;
    action(async()=>{
      try {
        await api('/api/scanner/videos/'+option,{record_id:v.id,used:!v.used});
        toast.success(option==='delete'?'Đã xóa video.':'Đã cập nhật trạng thái video.');
        await refresh();
      } finally { toggle.disabled=remove.disabled=false; }
    });
  }
  toggle.onclick=()=>submit('status');
  remove.onclick=()=>{ if (confirm('Xóa video “'+v.title+'” khỏi kho?')) submit('delete'); };
  actions.append(toggle,remove);
  const expanded=node('div',''); expanded.className='video-expanded'; expanded.append(actions,meta,details);
  menu.append(expanded); article.append(menu);
  return article;
}
function updateSelection() {
  const count=visibleVideos.filter(video=>selectedVideos.has(video.id)).length;
  const all=$('selectAll');
  all.disabled=!visibleVideos.length;
  all.checked=visibleVideos.length>0 && count===visibleVideos.length;
  all.indeterminate=count>0 && count<visibleVideos.length;
  $('selectedCount').textContent='Đã chọn '+count+' video';
  $('bulkMenu').classList.toggle('is-disabled',count===0);
  $('bulkMenu').querySelectorAll('button').forEach(button=>button.disabled=count===0);
  $('videos').querySelectorAll('.video-card').forEach((card,index)=>card.classList.toggle('is-selected',selectedVideos.has(visibleVideos[index].id)));
}
$('selectAll').onchange=event=>{
  for (const video of visibleVideos) {
    if (event.target.checked) selectedVideos.add(video.id);
    else selectedVideos.delete(video.id);
  }
  $('videos').querySelectorAll('.video-select').forEach(input=>input.checked=event.target.checked);
  updateSelection();
};
$('bulkMenu').onclick=event=>{
  if (selectedVideos.size===0 && event.target.closest('summary')) event.preventDefault();
};
$('bulkMenu').querySelectorAll('button').forEach(button=>button.onclick=()=>action(async()=>{
  const videos=visibleVideos.filter(video=>selectedVideos.has(video.id));
  const operation=button.dataset.bulk;
  if (operation==='delete' && !confirm('Xóa '+videos.length+' video đã chọn khỏi kho?')) return;
  $('bulkMenu').querySelectorAll('button').forEach(item=>item.disabled=true);
  let completed=0;
  try {
    for (const video of videos) {
      await api('/api/scanner/videos/'+(operation==='delete' ? 'delete' : 'status'),
        {record_id:video.id,used:operation==='used'});
      completed++;
    }
    toast.success('Đã cập nhật '+completed+' video.');
  } catch (error) {
    toast.error('Đã cập nhật '+completed+'/'+videos.length+' video. '+error.message);
  } finally {
    $('bulkMenu').open=false;
    await refresh();
  }
}));
async function refresh() {
  const pageSize=Number($('pageSize').value);
  const n=++generation, params=new URLSearchParams({q:$('query').value,used:$('used').value,page,pageSize});
  const [library,list,quotas]=await Promise.all([api('/api/scanner/videos?'+params),api('/api/devices'),api('/api/scanner/quotas')]);
  if(n!==generation) return;
  const pages=Math.ceil(library.total/pageSize);
  if (page >= Math.max(1,pages)) { page=Math.max(0,pages-1); return refresh(); }
  quotaData=quotas;
  devices=list.devices.filter(d=>!d.revoked);
  options($('device'),devices.map(d=>[d.id,d.name+(d.online ? '' : ' (offline)')])); targets();
  visibleVideos=library.videos;
  selectedVideos.clear();
  $('videos').replaceChildren(...library.videos.map(row));
  updateSelection();
  if (!library.videos.length) {
    $('videos').append(node('p', $('query').value || $('used').value
      ? 'Không có video khớp bộ lọc.' : 'Chưa nhận video nào từ scanner.'));
  }
  $('page').textContent=pages
    ? `Trang ${page+1}/${pages} · Video ${page*pageSize+1}–${page*pageSize+library.videos.length} trong ${library.total}`
    : '0 video';
  $('prev').disabled=page===0; $('next').disabled=page+1>=pages;
  const numbers=$('pageNumbers'); numbers.replaceChildren();
  const visible=[...new Set([0,page-1,page,page+1,pages-1])].filter(i=>i>=0 && i<pages).sort((a,b)=>a-b);
  visible.forEach((i,index)=>{
    if (index && i-visible[index-1]>1) numbers.append(node('span','…'));
    const button=node('button',String(i+1)); button.setAttribute('aria-label','Trang '+(i+1));
    if (i===page) button.setAttribute('aria-current','page');
    button.onclick=()=>goTo(i); numbers.append(button);
  });
}
function goTo(index) {
  page=index;
  action(async()=>{ await refresh(); $('page').scrollIntoView({block:'start'}); });
}
$('refresh').onclick=()=>action(refresh);
$('device').onchange=targets;
$('scenario').onchange=showQuota;
$('quotaForm').onsubmit=event=>{
  event.preventDefault();
  action(async()=>{
    const scenario=selectedScenario();
    if (!scenario) throw Error('Chọn kịch bản đích.');
    const value=$('dailyLimit').value;
    await api('/api/scanner/quotas',{scenarioId:scenario.assignment?.id ?? scenario.name,limit:value==='' ? null : Number(value)});
    await refresh();
    toast.success('Đã lưu hạn mức.');
  });
};
$('prev').onclick=()=>goTo(Math.max(0,page-1)); $('next').onclick=()=>goTo(page+1);
$('pageSize').onchange=()=>{page=0;action(refresh);};
$('used').onchange=()=>{page=0;action(refresh);};
$('query').oninput=()=>{page=0;clearTimeout(debounce);debounce=setTimeout(()=>action(refresh),200);};
$('assignment').onsubmit = event => {
  event.preventDefault();
  action(async () => {
    await api('/api/scanner/assignment',{enabled:$('autoEnabled').checked,retryHours:Number($('retryHours').value)});
    toast.success('Đã lưu cài đặt giao job.');
    await refresh();
  });
};
action(async()=>{csrf=(await api('/api/me')).csrf; const rule=await api('/api/scanner/assignment');
  $('autoEnabled').checked=rule.enabled; $('retryHours').value=rule.retryHours; $('library').hidden=false; await refresh();});
