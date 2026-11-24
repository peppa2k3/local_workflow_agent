import ScannerEditor from "../ScannerEditor.jsx";
import { PageHeader, Field } from "../components.jsx";

export default function Scanner() {
  return (
    <>
      <main className="shell">
        <PageHeader title="Quét YouTube">
          <button id="toggle" className="primary" disabled>
            Bật quét
          </button>
        </PageHeader>
        <p id="state" className="muted"></p>
        <div id="scanner-settings">
          <ScannerEditor />
        </div>
        <section className="panel">
          <div className="row">
            <h2>Kết quả gần nhất</h2>
            <button id="export">Xuất kho JSON</button>
          </div>
          <ResultFilters />
          <details className="scanner-check-filters">
            <summary>
              Lọc theo từng điều kiện{" "}
              <span id="activeChecks" className="badge" hidden></span>
            </summary>
            <div id="checkFilters" className="scanner-check-grid"></div>
            <button id="clearChecks" type="button" disabled>
              Xóa lọc điều kiện
            </button>
          </details>
          <p id="feedback" role="status"></p>
          <SelectionToolbar />
          <div id="rows"></div>
          <nav className="row scanner-pages" aria-label="Phân trang kết quả">
            <button id="prevPage" disabled>
              Trang trước
            </button>
            <span id="pageInfo" role="status"></span>
            <button id="nextPage" disabled>
              Trang sau
            </button>
          </nav>
        </section>
      </main>
    </>
  );
}

function ResultFilters() {
  return (
    <>
      <div className="scanner-filters">
        <Field label="Tìm video">
          <input
            id="resultQuery"
            type="search"
            placeholder="Tiêu đề, chủ đề hoặc ID"
          />
        </Field>
        <Field label="Trạng thái">
          <select id="filter">
            <option value="all">Mọi kết quả</option>
            <option value="pass">Đạt điều kiện</option>
            <option value="pending">Đang chờ gửi</option>
            <option value="synced">Đã đồng bộ</option>
            <option value="reject">Không đạt</option>
            <option value="unknown">Chưa đủ dữ liệu</option>
          </select>
        </Field>
        <Field label="Kết quả mỗi trang">
          <select id="pageSize">
            <option value="5">5</option>
            <option value="10">10</option>
          </select>
        </Field>
      </div>
    </>
  );
}

function SelectionToolbar() {
  return (
    <>
      <div className="row scanner-selection">
        <label>
          <input id="selectPage" type="checkbox" disabled /> Chọn cả trang
        </label>
        <span id="selectionCount" role="status">
          Đã chọn 0
        </span>
        <Field label="Thao tác với mục đã chọn">
          <select id="bulkOperation">
            <option value="">Chọn thao tác</option>
          </select>
        </Field>
        <button id="applyBulk" type="button" disabled>
          Áp dụng
        </button>
        <button id="clearSelection" type="button" disabled>
          Bỏ chọn
        </button>
      </div>
    </>
  );
}
