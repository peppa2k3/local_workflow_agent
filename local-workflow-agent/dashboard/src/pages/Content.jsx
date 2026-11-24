import { PageHeader, Field } from "../components.jsx";

export default function Content() {
  return (
    <>
      <div>
        <main className="main">
          <PageHeader
            title="Kho nội dung"
            description="Theo dõi clip, trang đích và các lượt đăng."
          >
            <button id="refresh">Làm mới dữ liệu</button>
          </PageHeader>
          <DatabaseConnection />
          <div className="metrics" aria-label="Tổng quan">
            <div className="metric">
              <span className="muted">Clip đã tải</span>
              <strong id="countDownloads">—</strong>
            </div>
            <div className="metric">
              <span className="muted">Lượt upload</span>
              <strong id="countUploads">—</strong>
            </div>
            <div className="metric">
              <span className="muted">Asset nội dung</span>
              <strong id="countAssets">—</strong>
            </div>
            <div className="metric">
              <span className="muted">Publication</span>
              <strong id="countPublications">—</strong>
            </div>
          </div>
          <div
            className="tabs"
            id="tabs"
            role="tablist"
            aria-label="Loại dữ liệu"
          ></div>
          <form className="filters" id="searchForm">
            <label className="search">
              Tìm kiếm
              <input
                id="search"
                placeholder="Tiêu đề, URL hoặc mã nội dung…"
                maxLength="256"
              />
            </label>
            <label id="activeFilterLabel" hidden>
              Trạng thái page
              <select id="activeFilter">
                <option value="">Tất cả</option>
                <option value="true">Đang hoạt động</option>
                <option value="false">Đã ngừng</option>
              </select>
            </label>
            <button type="submit">Tìm kiếm</button>
            <button id="newPage" type="button" className="primary" hidden>
              ＋ Thêm page
            </button>
          </form>
          <div id="message" className="message" role="status"></div>
          <div className="table-wrap">
            <table id="catalogTable">
              <thead id="tableHead"></thead>
              <tbody id="tableBody"></tbody>
            </table>
            <div id="empty" className="empty" hidden>
              Chưa có dữ liệu.
            </div>
          </div>
          <div className="footer">
            <span id="tableStatus"></span>
            <div className="actions">
              <button id="previous">← Trước</button>
              <button id="next">Sau →</button>
            </div>
          </div>
        </main>
      </div>
      <PageDialog />
      <PublicationDialog />
      <RecordDetails />
    </>
  );
}

function DatabaseConnection() {
  return (
    <>
      <section className="connection" aria-label="Kết nối MongoDB Atlas">
        <div className="connection-head">
          <div>
            <h2>
              MongoDB Atlas{" "}
              <span className="badge" id="connectionBadge">
                Đang kiểm tra
              </span>
            </h2>
            <p id="connectionInfo" className="muted">
              Database: team_content
            </p>
          </div>
          <div className="actions">
            <button id="ping">Kiểm tra kết nối</button>
            <button id="reconnect">Đọc lại .env / kết nối</button>
            <button id="sync" className="primary">
              Đồng bộ ngay
            </button>
          </div>
        </div>
        <p id="connectionHelp" className="muted" style={{ marginTop: 12 }}></p>
      </section>
    </>
  );
}

function PageDialog() {
  return (
    <>
      <dialog id="pageDialog">
        <form id="pageForm">
          <h2 id="pageTitle">Thêm page</h2>
          <p className="muted">
            Page được lưu trong database dùng chung. Các lượt upload có thể chọn
            trực tiếp page này.
          </p>
          <Field label="Tên page">
            <input id="pageName" required maxLength="256" />
          </Field>
          <Field label="Nền tảng">
            <input
              id="pagePlatform"
              required
              maxLength="64"
              defaultValue="Facebook"
            />
          </Field>
          <Field label="URL page">
            <input
              id="pageUrl"
              type="url"
              placeholder="https://www.facebook.com/..."
            />
          </Field>
          <Field label="Trạng thái">
            <select id="pageActive">
              <option value="true">Đang hoạt động</option>
              <option value="false">Ngừng hoạt động</option>
            </select>
          </Field>
          <p id="pageError" className="message error" role="alert"></p>
          <div className="actions">
            <button type="button" data-close="pageDialog">
              Hủy
            </button>
            <button id="savePage" className="primary" type="submit">
              Lưu page
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function PublicationDialog() {
  return (
    <>
      <dialog id="publicationDialog">
        <form id="publicationForm">
          <h2>Sửa publication</h2>
          <p className="muted">
            Cập nhật metadata của bản ghi hiện tại. Để trống ngày đăng nếu chưa
            xác nhận bài đã xuất bản.
          </p>
          <label>
            Mô tả<textarea id="publicationDesc" maxLength="20000"></textarea>
          </label>
          <Field label="Link bài đã đăng">
            <input id="postUrl" type="url" />
          </Field>
          <Field label="Ngày đăng (Asia/Bangkok, UTC+7)">
            <input id="publishedAt" type="datetime-local" />
          </Field>
          <p id="publicationError" className="message error" role="alert"></p>
          <div className="actions">
            <button type="button" data-close="publicationDialog">
              Hủy
            </button>
            <button id="savePublication" className="primary" type="submit">
              Lưu publication
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function RecordDetails() {
  return (
    <>
      <dialog id="detailDialog">
        <h2 id="detailTitle">Chi tiết</h2>
        <div id="detailBody"></div>
        <div className="actions" style={{ marginTop: 18 }}>
          <button id="copyId">Sao chép ID</button>
          <button data-close="detailDialog">Đóng</button>
        </div>
      </dialog>
    </>
  );
}
