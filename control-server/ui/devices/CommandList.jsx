import { Fragment } from 'react';
import { stateName } from './states.js';

const tones = {
  succeeded: 'success',
  failed: 'failure',
  rejected: 'failure',
  running: 'active',
  dispatched: 'active',
  queued: 'pending',
  pending: 'pending',
  scheduled: 'pending',
  confirming: 'pending',
  approved: 'pending',
  interrupted: 'pending',
  expired: 'pending',
  unknown: 'pending',
};

function CommandCard({ command, onDecision, onStop }) {
  const { id, type, payload, result, state } = command;
  const action = type === 'manageLocalTask' ? 'Yêu cầu quản lý tác vụ local' : 'Yêu cầu dừng tác vụ';
  const progress = result?.stoppedAtStep
    ? `Dừng tại bước ${result.stoppedAtStep}/${result.total}`
    : result?.total
      ? `Tiến độ ${state === 'succeeded' ? result.total : Math.min(result.index + 1, result.total)}/${result.total}`
      : '';
  const times = [
    ['Tạo lệnh', command.created],
    ['Giờ đã đặt', payload.scheduledAt],
    ['Bắt đầu', result?.startedAt],
    ['Kết thúc', result?.endedAt],
  ];
  return (
    <article className={'run history-task history-task--' + (tones[state] ?? 'neutral')}>
      <div className="history-task-heading">
        <div>
          <h3>{payload.scenario || action}</h3>
          {payload.profile && <p className="history-profile">Profile · {payload.profile}</p>}
          {type !== 'run' && payload.scenario && <small>{action}</small>}
        </div>
        <span className="badge history-status">{stateName[state] || state}</span>
      </div>
      <dl className="history-times">
        {times.map(([label, timestamp]) => {
          const date = new Date(timestamp);
          return (
            Number.isFinite(timestamp) &&
            Number.isFinite(date.getTime()) && (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <time dateTime={date.toISOString()}>{date.toLocaleString('vi-VN')}</time>
                </dd>
              </div>
            )
          );
        })}
      </dl>
      {state === 'scheduled' && (
        <Fragment>
          <button onClick={(e) => onDecision(e.currentTarget, id, { proceed: false })}>Hủy lịch</button>
          <details>
            <summary>Đổi giờ</summary>
            <input
              type="datetime-local"
              aria-label="Giờ chạy mới"
              key={payload.scheduledAt}
              defaultValue={new Date(
                payload.scheduledAt - new Date(payload.scheduledAt).getTimezoneOffset() * 60000,
              )
                .toISOString()
                .slice(0, 16)}
            />
            <button
              onClick={(e) =>
                onDecision(e.currentTarget, id, {
                  scheduledAt: new Date(e.currentTarget.previousElementSibling.value).getTime(),
                })
              }
            >
              Lưu giờ mới
            </button>
          </details>
        </Fragment>
      )}
      {!!result?.total && (
        <>
          <p className="history-progress">{progress}</p>
          <progress
            aria-label={progress}
            max={result.total}
            value={state === 'succeeded' ? result.total : result.index}
          />
        </>
      )}
      {result?.message && <p className="history-result">{result.message}</p>}
      <details className="history-details" data-id={id}>
        <summary>{result?.steps?.length ? 'Chi tiết từng bước' : 'Chi tiết lệnh'}</summary>
        <small>ID · {id}</small>
        {!!result?.steps?.length && (
          <ol>
            {result.steps.map((s, i) => (
              <li key={i}>
                {s.label || s.action} — {stateName[s.state] || s.state}
              </li>
            ))}
          </ol>
        )}
      </details>
      {type === 'run' && ['queued', 'dispatched', 'running', 'unknown'].includes(state) && (
        <button className="danger" onClick={(e) => onStop(e.currentTarget, id)}>
          Dừng lượt này
        </button>
      )}
    </article>
  );
}

export function CommandList({ commands, onDecision, onStop }) {
  return commands.length ? (
    commands.map((cmd) => <CommandCard key={cmd.id} command={cmd} onDecision={onDecision} onStop={onStop} />)
  ) : (
    <p className="history-empty">Chưa có lệnh điều khiển.</p>
  );
}
