import { createRoot } from 'react-dom/client';
import { CommandList } from './CommandList.jsx';

export function createHistory({ $, api, submit, popup, message, refresh, getDevice }) {
  const list = createRoot($('history'));
  const reportedResults = new Map(),
    historyPages = new Map();
  const historyPageSize = 8;
  let historyCommands = [];
  function resetHistory(message) {
    historyCommands = [];
    list.render(message ? <p className="history-empty">{message}</p> : null);
    $('history-pagination').hidden = true;
  }
  function updateHistory(commands, deviceId) {
    const previousResults = reportedResults.get(deviceId);
    const withResults = commands.filter((cmd) => cmd.result?.message);
    reportedResults.set(deviceId, new Set(withResults.map((cmd) => cmd.id)));
    if (previousResults)
      for (const cmd of withResults) {
        if (!previousResults.has(cmd.id)) popup(`${cmd.payload.scenario || cmd.type}: ${cmd.result.message}`);
      }
    historyCommands = [...commands].sort((a, b) => b.created - a.created);
    renderHistory(deviceId);
  }
  function renderHistory(deviceId) {
    const total = historyCommands.length;
    const pages = Math.ceil(total / historyPageSize);
    const page = Math.max(0, Math.min(historyPages.get(deviceId) ?? 0, pages - 1));
    historyPages.set(deviceId, page);
    const start = page * historyPageSize;
    const visible = historyCommands.slice(start, start + historyPageSize);
    const pageLabel = total
      ? `Trang ${page + 1}/${pages} · ${start + 1}–${start + visible.length}/${total} lệnh`
      : '';
    if ($('history-page').textContent !== pageLabel) $('history-page').textContent = pageLabel;
    $('history-pagination').hidden = pages <= 1;
    $('history-prev').disabled = page === 0;
    $('history-next').disabled = page >= pages - 1;

    list.render(
      <CommandList
        commands={visible}
        onDecision={(button, runId, decision) =>
          submit(button, async () => {
            await api('/api/schedule-decision', { deviceId, runId, ...decision });
            await refresh();
          })
        }
        onStop={(button, runId) =>
          submit(button, async () => {
            await api('/api/commands', { requestId: crypto.randomUUID(), deviceId, type: 'stop', runId });
            message('Đã gửi lệnh dừng.');
            await refresh();
          })
        }
      />,
    );
  }
  for (const [id, offset] of [
    ['history-prev', -1],
    ['history-next', 1],
  ]) {
    $(id).addEventListener('click', () => {
      const selected = getDevice();
      historyPages.set(selected, historyPages.get(selected) + offset);
      renderHistory(selected);
    });
  }
  function clearHistory() {
    historyPages.clear();
    reportedResults.clear();
    resetHistory();
  }
  return { resetHistory, updateHistory, clearHistory };
}
