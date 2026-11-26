import { applyVideoAction } from './videoActions.js';
﻿import { useRef, useState } from 'react';

function duration(seconds) {
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.floor(seconds / 60) + ':' + String(Math.floor(seconds) % 60).padStart(2, '0')
    : '—';
}
function age(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '—';
  const days = Math.floor((Date.now() - time) / 86400000);
  return days > 0 ? days + ' ngày trước' : 'Hôm nay';
}
function RecordDetails({ video: v }) {
  const date = (value) => new Date(value).toLocaleString('vi-VN');
  const fields = [
    ['Chủ đề', v.type_topic],
    ['Nguồn', v.source_name],
    ['Thời điểm đo', date(v.measured_at)],
    ['Tiếp nhận', date(v.received_at)],
    ['Job', v.job_ids.join(', ') || 'Chưa có'],
  ];
  if (v.next_attempt_at && !v.used) fields.push(['Xét lại lúc', date(v.next_attempt_at)]);
  if (v.assignment_job)
    fields.push(['Job tự động', [v.assignment_job, v.assignment_state].filter(Boolean).join(' · ')]);
  return (
    <>
      <dl>
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || '—'}</dd>
          </div>
        ))}
      </dl>
      <details>
        <summary>Kết quả kiểm tra</summary>
        {Object.entries(v.checks).map(([key, check]) => (
          <p key={key}>
            {key} · {check.status} · {check.reason}
          </p>
        ))}
      </details>
    </>
  );
}

export function VideoCard({ video: v, selected, onSelect, onTag, target, api, refresh }) {
  const [busy, setBusy] = useState(false);
  const menu = useRef(null);
  async function perform(fn) {
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }
  function copy(getValue) {
    return perform(async () => {
      await navigator.clipboard.writeText(await getValue());
      toast.success('Đã sao chép.');
    });
  }
  function request(route) {
    const destination = target();
    if (!destination.scenario) throw Error('Chọn máy và kịch bản đích.');
    return api('/api/scanner/' + route, { record_id: v.id, ...destination });
  }
  function change(remove) {
    if (remove && !confirm('Xóa video “' + v.title + '” khỏi kho?')) return;
    return perform(async () => {
      const operation = remove ? 'delete' : v.used ? 'unused' : 'used';
      await applyVideoAction(api, v.id, operation);
      toast.success(remove ? 'Đã xóa video.' : 'Đã cập nhật trạng thái video.');
      if (menu.current) menu.current.open = false;
      await refresh();
    });
  }
  return (
    <article className={'video-card' + (selected ? ' is-selected' : '')}>
      <input
        type="checkbox"
        className="video-select"
        aria-label={'Chọn video ' + (v.title || v.video_id)}
        checked={selected}
        onChange={(e) => onSelect(e.target.checked)}
      />
      <div className="video-thumb">
        <img
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          src={'https://i.ytimg.com/vi/' + encodeURIComponent(v.video_id) + '/mqdefault.jpg'}
          onError={(e) => (e.currentTarget.hidden = true)}
        />
        <small>{duration(v.duration_seconds)}</small>
      </div>
      <div className="video-title">
        <h3>
          <a href={v.video_url} target="_blank" rel="noopener">
            {v.title || v.video_url}
          </a>
        </h3>
        <div className="video-tags">
          {v.tags.map((tag) => (
            <button key={tag} onClick={() => onTag(tag)}>
              {tag}
            </button>
          ))}
        </div>
      </div>
      <div className="video-facts">
        <span>{age(v.published_at)}</span>
        <span>
          {Number.isFinite(v.view_count) ? v.view_count.toLocaleString('vi-VN') + ' lượt xem' : '—'}
        </span>
      </div>
      <span className="video-source">{v.source_name || '—'}</span>
      <div className="video-badges">
        <span className={v.used ? 'used' : 'available'}>{v.used ? 'Đã dùng' : 'Chưa dùng'}</span>
        {v.similar_title && <span>Nghi trùng tiêu đề</span>}
      </div>
      <details className="video-options" ref={menu}>
        <summary>Tùy chọn</summary>
        <div className="video-expanded">
          <div className="video-actions">
            <button
              disabled={busy || v.used}
              onClick={() =>
                perform(async () => {
                  const job = await request('assign');
                  toast.success('Đã giao job ' + job.id);
                  await refresh();
                })
              }
            >
              Giao job cho máy đã chọn
            </button>
            <button onClick={() => copy(() => v.video_url)}>Copy URL</button>
            <button onClick={() => copy(() => JSON.stringify(v, null, 2))}>Copy JSON bản ghi</button>
            <button onClick={() => copy(async () => JSON.stringify(await request('variables'), null, 2))}>
              Copy biến scenario
            </button>
            <button disabled={busy} onClick={() => change(false)}>
              {v.used ? 'Đánh dấu chưa dùng' : 'Đánh dấu đã dùng'}
            </button>
            <button disabled={busy} className="remove-video" onClick={() => change(true)}>
              Xóa video
            </button>
          </div>
          <RecordDetails video={v} />
        </div>
      </details>
    </article>
  );
}
