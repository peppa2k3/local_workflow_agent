const $ = id => document.getElementById(id);
let csrf, devices = [], page = 0, generation = 0, debounce;
async function api(route, data) {
  const response = await fetch(route,{method:data?'POST':'GET',headers:{'content-type':'application/json','x-csrf-token':csrf || ''},
    body:data ? JSON.stringify(data) : undefined});
  if (response.status === 401) throw Error('Đăng nhập tại trang Điều khiển thiết bị để xem kho.');
  const body = await response.json();
  if (!response.ok) throw Error(body.error);
  return body;
}
function action(fn) { Promise.resolve().then(fn).catch(e=>{ $('feedback').textContent=e.message; }); }
function node(tag,text) { const n=document.createElement(tag); n.textContent=text; return n; }
function options(select, pairs) {
  const saved = select.value;
  select.replaceChildren(...pairs.map(([value,label])=>new Option(label,value)));
  if (pairs.some(([value])=>value===saved)) select.value=saved;
}
function targets() {
  const device=devices.find(d=>d.id===$('device').value);
  options($('scenario'),(device?.metadata.scenarios || []).filter(s=>s.libraryTarget).map(s=>[s.name,s.name]));
}
function row(v) {
  const article=node('article',''); article.className='run';
  const link=node('a',v.video_url); link.href=v.video_url; link.target='_blank'; link.rel='noopener';
  article.append(node('h2',v.title),link,node('p',[v.type_topic,v.source_name,v.used?'Đã dùng':'Chưa dùng',
    v.similar_title?'Nghi trùng tiêu đề':''].filter(Boolean).join(' · ')),
    node('p','Đo: '+new Date(v.measured_at).toLocaleString('vi-VN')+' · Nhận: '+new Date(v.received_at).toLocaleString('vi-VN')),
    node('p','Job: '+(v.job_ids.join(', ') || 'Chưa có')));
  if (v.next_attempt_at && !v.used) article.append(node('p','Xét lại lúc '+new Date(v.next_attempt_at).toLocaleString('vi-VN')));
  if (v.assignment_job) article.append(node('p','Job tự động: '+v.assignment_job+' · '+v.assignment_state));
  const details=node('details',''); details.append(node('summary','Kết quả kiểm tra'));
  for (const [key,check] of Object.entries(v.checks)) details.append(node('p',key+' · '+check.status+' · '+check.reason));
  article.append(details);
  function copy(label,get) {
    const btn=node('button',label);
    btn.onclick=()=>action(async()=>{ const text=await get(); await navigator.clipboard.writeText(text); $('feedback').textContent='Đã sao chép.'; });
    article.append(btn);
  }
  copy('Copy URL',()=>v.video_url);
  copy('Copy JSON bản ghi',()=>JSON.stringify(v,null,2));
  copy('Copy biến scenario',async()=>{
    if (!$('scenario').value) throw Error('Chọn máy và kịch bản có cấu hình tải/đăng.');
    const value=await api('/api/scanner/variables',{record_id:v.id,device_id:$('device').value,scenario:$('scenario').value});
    return JSON.stringify(value,null,2);
  });
  return article;
}
async function refresh() {
  const n=++generation, params=new URLSearchParams({q:$('query').value,used:$('used').value,page});
  const [library, list]=await Promise.all([api('/api/scanner/videos?'+params),api('/api/devices')]);
  if(n!==generation) return;
  devices=list.devices.filter(d=>!d.revoked);
  options($('device'),devices.map(d=>[d.id,d.name])); targets();
  $('videos').replaceChildren(...library.videos.map(row));
  $('page').textContent='Trang '+(page+1)+' · '+library.total+' video';
  $('prev').disabled=page===0; $('next').disabled=(page+1)*50>=library.total;
}
$('refresh').onclick=()=>action(refresh);
$('device').onchange=targets;
$('prev').onclick=()=>{page--;action(refresh);}; $('next').onclick=()=>{page++;action(refresh);};
$('used').onchange=()=>{page=0;action(refresh);};
$('query').oninput=()=>{page=0;clearTimeout(debounce);debounce=setTimeout(()=>action(refresh),200);};
$('assignment').onsubmit = event => {
  event.preventDefault();
  action(async () => {
    await api('/api/scanner/assignment',{enabled:$('autoEnabled').checked,retryHours:Number($('retryHours').value)});
    $('feedback').textContent='Đã lưu cài đặt giao job.';
    await refresh();
  });
};
action(async()=>{csrf=(await api('/api/me')).csrf; const rule=await api('/api/scanner/assignment');
  $('autoEnabled').checked=rule.enabled; $('retryHours').value=rule.retryHours; $('library').hidden=false; await refresh();});
