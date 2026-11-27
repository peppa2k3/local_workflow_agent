import {RunScenarioForm} from './RunScenarioForm.jsx';
import {LoginPanel} from './LoginPanel.jsx';

export default function DevicesPage() {
  return (
    <>
      <header>
        <div>
          <h1>Điều khiển thiết bị</h1>
        </div>
        <div id="account" className="account" hidden>
          <span id="email"></span>
          <button id="logout">Đăng xuất</button>
        </div>
      </header>

      <LoginPanel />
      <section id="workspace" hidden>
        <div className="grid">
          <aside>
            <div className="panel subtle">
              <h2>Ghép thiết bị mới</h2>
              <small>
                Mở trang Remote trên máy local để tạo mã. Sau khi nhập mã tại đây, xác nhận tài khoản trên máy
                đó.
              </small>
              <form id="pair-form">
                <label>
                  Mã ghép nối
                  <input
                    name="code"
                    autoComplete="off"
                    maxLength="12"
                    required
                    placeholder="Mã gồm 12 ký tự"
                  />
                </label>
                <button type="submit">Gửi yêu cầu kết nối</button>
              </form>
            </div>
            <h2>Thiết bị của bạn</h2>
            <div id="devices" className="stack"></div>
          </aside>
          <div>
            <div id="empty" className="panel empty">
              Chọn một thiết bị để xem trạng thái và chạy kịch bản.
            </div>
            <section id="detail" hidden>
              <div className="panel">
                <div className="device-summary">
                  <h2 id="device-name"></h2>
                  <span id="device-status" className="badge"></span>
                  <p id="device-seen" className="muted"></p>
                  <p id="activity" className="muted"></p>
                </div>
                <div id="metrics" className="device-summary"></div>
                <p id="profiles" className="muted"></p>
                <button id="revoke" className="danger">
                  Thu hồi kết nối thiết bị
                </button>{' '}
                <button id="remove-device" className="danger" hidden>
                  Gỡ khỏi danh sách
                </button>
              </div>
              <RunScenarioForm />
              <section id="local-tasks" className="panel" hidden>
                <h2>Tác vụ từ máy local</h2>
                <p id="local-task-operation" role="status"></p>
                <p id="local-tasks-notice" className="muted"></p>
                <div className="task-columns">
                  <section>
                    <h3>Đang chạy</h3>
                    <div id="local-running"></div>
                  </section>
                  <section>
                    <h3>Đã lên lịch</h3>
                    <div id="local-schedules"></div>
                  </section>
                </div>
              </section>
              <section className="panel history-panel" aria-labelledby="history-title">
                <div className="history-heading">
                  <h2 id="history-title">Lịch sử điều khiển</h2>
                  <small>Mới nhất trước · Tự cập nhật</small>
                </div>
                <nav
                  id="history-pagination"
                  className="history-pagination"
                  aria-label="Phân trang lịch sử điều khiển"
                  hidden
                >
                  <button id="history-prev" type="button" aria-controls="history">
                    ‹ Trang trước
                  </button>
                  <span id="history-page" role="status"></span>
                  <button id="history-next" type="button" aria-controls="history">
                    Trang sau ›
                  </button>
                </nav>
                <div id="history" className="history-list"></div>
              </section>
            </section>
          </div>
        </div>
      </section>
      <footer>Local Agent Remote · Thiết bị giữ quyền quyết định kịch bản được phép chạy.</footer>
    </>
  );
}
