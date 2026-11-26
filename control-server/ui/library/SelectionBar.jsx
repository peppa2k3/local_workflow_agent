import { applyVideoAction } from './videoActions.js';
﻿import { useRef, useState } from 'react';

export function SelectionBar({ videos, selected, setSelected, api, refresh }) {
  const menu = useRef(null);
  const count = selected.size;
  const [busy, setBusy] = useState(false);
  async function apply(operation) {
    if (busy || !count) return;
    if (operation === 'delete' && !confirm('Xóa ' + count + ' video đã chọn khỏi kho?')) return;
    setBusy(true);
    let completed = 0;
    try {
      for (const id of selected) {
        await applyVideoAction(api, id, operation);
        completed++;
      }
      toast.success('Đã cập nhật ' + completed + ' video.');
    } catch (error) {
      toast.error('Đã cập nhật ' + completed + '/' + count + ' video. ' + error.message);
    } finally {
      menu.current.open = false;
      try {
        await refresh();
      } catch (error) {
        toast.error(error.message);
      }
      setBusy(false);
    }
  }
  return (
    <div className="library-selection">
      <label>
        <input
          id="selectAll"
          type="checkbox"
          disabled={!videos.length || busy}
          ref={(input) => {
            if (input) input.indeterminate = count > 0 && count < videos.length;
          }}
          checked={count > 0 && count === videos.length}
          onChange={(e) => setSelected(new Set(e.target.checked ? videos.map((v) => v.id) : []))}
        />{' '}
        Chọn tất cả
      </label>
      <span id="selectedCount" role="status">
        Đã chọn {count} video
      </span>
      <details id="bulkMenu" ref={menu} className={!count ? 'is-disabled' : ''}>
        <summary
          aria-disabled={!count}
          onClick={(e) => {
            if (!count) e.preventDefault();
          }}
        >
          ⋮ &nbsp; Thao tác hàng loạt
        </summary>
        <div className="bulk-actions">
          {[
            ['used', 'Đánh dấu đã dùng'],
            ['unused', 'Đánh dấu chưa dùng'],
            ['delete', 'Xóa video đã chọn'],
          ].map(([op, label]) => (
            <button key={op} type="button" data-bulk={op} disabled={!count || busy} onClick={() => apply(op)}>
              {label}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
