import { PageHeader, Field } from "../components.jsx";

export default function Scenarios() {
  return (
    <>
      <ClipPicker />
      <main className="shell">
        <PageHeader
          title="Kịch bản"
          description="Tạo và chạy kịch bản trên Chrome profile đã chọn."
        >
          <div className="status">
            <span className="dot" id="connectionDot"></span>
            <span id="connectionText">Đang kết nối agent...</span>
          </div>
        </PageHeader>

        <ScenarioToolbar />
        <StepEditor />
        <SchedulePanel />
        <p>
          Cài extension trong từng profile, mở Extension options và chọn đúng
          thư mục profile. Mỗi profile có thể chạy một kịch bản riêng.
        </p>
        <p id="automationStatus">
          CLI/API: node local-agent.js --help. Hướng dẫn cấu hình token trong
          guides-local.md ở gốc repo.
        </p>
        <div
          id="profilesSummary"
          className="profiles-summary"
          aria-live="polite"
        ></div>
        <nav className="variables" aria-label="Biến kịch bản">
          <p>
            Kết quả tải: {"{{download_title}}"} = tiêu đề / tên phim;{" "}
            {"{{download_file_name}}"} = tên file; {"{{download_file_path}}"} =
            đường dẫn clip; {"{{download_id}}"} = ID. Dùng trong các bước sau
            downloadVideo.
          </p>
          <strong>Danh sách biến</strong>{" "}
          <span>
            Tham chiếu bằng {"{{ten_bien}}"} trong các input. Khi chạy sẽ lấy
            giá trị hiện tại; JSON giữ tên tham chiếu.
          </span>
          <div id="variables"></div>
          <button className="btn ghost" id="addVariableBtn">
            ＋ Thêm biến
          </button>
        </nav>
        <div
          id="performance"
          className="performance"
          aria-label="Hiệu suất agent"
        ></div>

        <div className="progress">
          <strong>Trạng thái:</strong> <span id="progress">Chưa chạy</span>
        </div>
        <div
          id="runSteps"
          className="profiles-summary"
          style={{ whiteSpace: "pre-wrap" }}
          aria-live="polite"
        ></div>
        <p id="storageStatus"></p>
        <button className="btn ghost" id="historyBtn" type="button">
          Xem / làm mới lịch sử profile
        </button>
        <div id="runHistory" className="profiles-summary"></div>
      </main>
    </>
  );
}

function ClipPicker() {
  return (
    <>
      <dialog id="clipPicker" aria-labelledby="clipPickerTitle">
        <h2 id="clipPickerTitle">Chọn clip đã lưu</h2>
        <form id="clipSearch">
          <Field label="Tìm theo tên">
            <input name="query" maxLength="255" />
          </Field>
          <button className="btn ghost" type="submit">
            Tìm clip
          </button>
        </form>
        <p id="clipStatus" aria-live="polite"></p>
        <Field label="File trong thư mục lưu trữ">
          <select id="clipNames"></select>
        </Field>
        <button className="btn" id="useClip" type="button">
          Dùng clip
        </button>
        <button className="btn ghost" id="cancelClip" type="button">
          Hủy
        </button>
      </dialog>
    </>
  );
}

function ScenarioToolbar() {
  return (
    <>
      <section className="toolbar" aria-label="Quản lý kịch bản">
        <div className="tool-group">
          <Field label="Chrome profile">
            <select id="profileSelect" aria-label="Chrome profile"></select>
          </Field>
          <button className="btn ghost" id="openProfileBtn">
            Mở profile
          </button>
        </div>
        <div className="tool-group">
          <Field label="Kịch bản đã lưu">
            <select id="scenarioSelect"></select>
          </Field>
          <button className="btn ghost" id="loadBtn">
            Mở
          </button>
          <button className="btn ghost" id="cloneBtn">
            Clone kịch bản
          </button>
          <button className="btn danger" id="deleteBtn">
            Xóa kịch bản
          </button>
        </div>
        <div className="tool-group">
          <Field label="Tên file mới">
            <input
              id="fileName"
              placeholder="vi-du: facebook-reels"
              spellCheck="false"
            />
          </Field>
          <button className="btn ghost" id="newBtn">
            Tạo mới
          </button>
          <button className="btn ghost" id="renameBtn" disabled>
            Đổi tên file
          </button>
        </div>
        <div className="tool-group">
          <label>
            File upload cho lần chạy
            <span className="file-path-control">
              <input
                id="uploadPath"
                placeholder="C:\\...\\anh.jpg (tùy chọn)"
                spellCheck="false"
              />
              <button className="btn ghost" id="chooseRunFile" type="button">
                Chọn file…
              </button>
            </span>
          </label>
        </div>
        <div className="run-actions">
          <button className="btn success" id="saveBtn">
            Lưu
          </button>
          <button className="btn success" id="runBtn">
            ▶ Chạy kịch bản
          </button>
          <button className="btn danger" id="stopBtn">
            Dừng
          </button>
        </div>
      </section>
    </>
  );
}

function StepEditor() {
  return (
    <>
      <section className="editor">
        <div className="editor-head">
          <div>
            <h2>Các bước thực hiện</h2>
            <p>Dùng ↑ ↓ để đổi thứ tự. Mở chi tiết để sửa từng bước.</p>
          </div>
          <Field label="Tên hiển thị">
            <input id="scenarioName" placeholder="Tên kịch bản" />
          </Field>
          <Field label="Chrome profile của kịch bản">
            <select
              id="scenarioProfile"
              aria-label="Chrome profile của kịch bản"
            ></select>
          </Field>
        </div>
        <div className="two">
          <Field label="Topic tự nhận (cách nhau bằng dấu phẩy)">
            <input id="acceptedTopics" placeholder="gia-dinh, am-thuc" />
          </Field>
          <Field label="Ưu tiên giao job (số lớn trước)">
            <input
              id="assignmentPriority"
              type="number"
              step="1"
              defaultValue="0"
            />
          </Field>
        </div>
        <div className="steps" id="steps"></div>
        <button className="add" id="addBtn">
          ＋ Thêm bước
        </button>
        <div className="bottom">
          <div className="message" id="message" role="status"></div>
          <span id="stepCount"></span>
        </div>
      </section>
    </>
  );
}

function SchedulePanel() {
  return (
    <>
      <section id="schedules" aria-label="Lên lịch">
        <h2>Lịch chạy kịch bản</h2>
        <div className="toolbar">
          <Field label="Ngày và giờ chạy">
            <input id="schedule-at" type="datetime-local" step="60" />
          </Field>
          <button className="btn ghost" id="schedule-now" type="button">
            Bây giờ
          </button>
          <button className="btn ghost" id="schedule-later" type="button">
            Sau 15 phút
          </button>
          <button className="btn success" id="schedule-create">
            Đặt lịch
          </button>
        </div>
        <div id="schedule-list"></div>
        <dialog id="schedule-dialog">
          <h2>Chạy kịch bản theo lịch?</h2>
          <p id="schedule-question"></p>
          <button className="btn success" id="schedule-yes">
            Yes · Chạy
          </button>{" "}
          <button className="btn danger" id="schedule-no">
            No · Hủy
          </button>
        </dialog>
      </section>
    </>
  );
}
