import { useState } from 'react';
import { useLibrary } from './useLibrary.js';
import { VideoCard } from './VideoCard.jsx';
import { Pagination } from './Pagination.jsx';
import { SelectionBar } from './SelectionBar.jsx';
import { AssignmentSettings } from './AssignmentSettings.jsx';

function QuotaForm({ scenario, data, api, refresh }) {
  const id = scenario?.assignment?.id ?? scenario?.name;
  const quota = data.quotas.find((q) => q.scenarioId === id);
  async function save(event) {
    event.preventDefault();
    const value = event.currentTarget.dailyLimit.value;
    try {
      await api('/api/scanner/quotas', { scenarioId: id, limit: value === '' ? null : Number(value) });
      await refresh();
      toast.success('Đã lưu hạn mức.');
    } catch (error) {
      toast.error(error.message);
    }
  }
  return (
    <form id="quotaForm" className="video-toolbar" onSubmit={save}>
      <label>
        Hạn mức job/ngày
        <input
          key={JSON.stringify([id, quota?.limit])}
          placeholder="Vô hạn"
          id="dailyLimit"
          type="number"
          min="0"
          step="1"
          defaultValue={quota?.limit ?? ''}
        />
      </label>
      <button id="saveLimit" disabled={!id}>
        Lưu hạn mức
      </button>
      <span id="quotaStatus">
        {id && id + ' · Đã giao hôm nay: ' + (quota && quota.day === data.day ? quota.count : 0)}
      </span>
    </form>
  );
}

export default function LibraryPage() {
  const { api, rule, query, setQuery, filter, setFilter, data, refresh, selected, setSelected } =
    useLibrary();
  const [deviceId, setDeviceId] = useState('');
  const [scenarioName, setScenarioName] = useState('');
  const device = data.devices.find((d) => d.id === deviceId) ?? data.devices[0];
  const scenarios = (device?.metadata.scenarios ?? []).filter((s) => s.libraryTarget || s.assignment);
  const scenario = scenarios.find((s) => s.name === scenarioName) ?? scenarios[0];
  function changeFilter(changes) {
    setFilter((old) => ({ ...old, page: 0, ...changes }));
  }
  function toggle(id, checked) {
    setSelected((old) => {
      const next = new Set(old);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  return (
    <>
      <h1 className="visually-hidden">Kho video</h1>
      {rule && (
        <div id="library">
          <AssignmentSettings rule={rule} api={api} refresh={refresh} />
          <section className="panel">
            <h2>Danh sách video</h2>
            <div className="library-filters">
              <label>
                Tìm video
                <input
                  id="query"
                  type="search"
                  placeholder="Tiêu đề, chủ đề, ID, máy gửi hoặc #tag"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label>
                Trạng thái sử dụng
                <select
                  id="used"
                  value={filter.used}
                  onChange={(e) => changeFilter({ used: e.target.value })}
                >
                  <option value="">Tất cả</option>
                  <option value="false">Chưa dùng</option>
                  <option value="true">Đã dùng</option>
                </select>
              </label>
              <label>
                Máy đích
                <select id="device" value={device?.id ?? ''} onChange={(e) => setDeviceId(e.target.value)}>
                  {data.devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {!d.online && ' (offline)'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kịch bản đích
                <select
                  id="scenario"
                  value={scenario?.name ?? ''}
                  onChange={(e) => setScenarioName(e.target.value)}
                >
                  {scenarios.map((s) => (
                    <option key={s.name}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="library-tools">
              <QuotaForm scenario={scenario} data={data} api={api} refresh={refresh} />
              <div className="video-toolbar">
                <label>
                  Video mỗi trang
                  <select
                    id="pageSize"
                    value={filter.pageSize}
                    onChange={(e) => changeFilter({ pageSize: Number(e.target.value) })}
                  >
                    {[12, 24, 48].map((size) => (
                      <option key={size}>{size}</option>
                    ))}
                  </select>
                </label>
                <button id="refresh" onClick={() => refresh().catch((error) => toast.error(error.message))}>
                  Làm mới
                </button>
              </div>
            </div>
            <SelectionBar
              videos={data.videos}
              selected={selected}
              setSelected={setSelected}
              api={api}
              refresh={refresh}
            />
            <div id="videos">
              {data.videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  selected={selected.has(video.id)}
                  onSelect={(checked) => toggle(video.id, checked)}
                  onTag={(tag) => {
                    setQuery(tag);
                    changeFilter({ q: tag });
                  }}
                  target={() => ({ device_id: device?.id, scenario: scenario?.name })}
                  api={api}
                  refresh={refresh}
                />
              ))}
              {!data.videos.length && (
                <p>
                  {filter.q || filter.used
                    ? 'Không có video khớp bộ lọc.'
                    : 'Chưa nhận video nào từ scanner.'}
                </p>
              )}
            </div>
            <Pagination
              page={data.pageIndex ?? 0}
              pageSize={data.size ?? filter.pageSize}
              total={data.total}
              length={data.videos.length}
              onChange={(page) => {
                changeFilter({ page });
                document.getElementById('page').scrollIntoView({ block: 'start' });
              }}
            />
          </section>
        </div>
      )}
    </>
  );
}
