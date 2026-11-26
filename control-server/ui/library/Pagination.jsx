import { Fragment } from 'react';

export function Pagination({ page, pageSize, total, length, onChange }) {
  const pages = Math.ceil(total / pageSize);
  const numbers = [...new Set([0, page - 1, page, page + 1, pages - 1])]
    .filter((i) => i >= 0 && i < pages)
    .sort((a, b) => a - b);
  return (
    <nav className="video-pages" aria-label="Phân trang video">
      <span id="page" role="status">
        {pages
          ? `Trang ${page + 1}/${pages} · Video ${page * pageSize + 1}–${page * pageSize + length} trong ${total}`
          : '0 video'}
      </span>
      <button id="prev" disabled={!page} onClick={() => onChange(page - 1)}>
        Trang trước
      </button>
      <span id="pageNumbers">
        {numbers.map((n, index) => (
          <Fragment key={n}>
            {index > 0 && n - numbers[index - 1] > 1 && <span>…</span>}
            <button
              aria-label={'Trang ' + (n + 1)}
              aria-current={page === n ? 'page' : undefined}
              onClick={() => onChange(n)}
            >
              {n + 1}
            </button>
          </Fragment>
        ))}
      </span>
      <button id="next" disabled={page + 1 >= pages} onClick={() => onChange(page + 1)}>
        Trang sau
      </button>
    </nav>
  );
}
