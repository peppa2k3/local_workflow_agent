export function RunScenarioForm() {
  return (
    <div className="panel">
      <h2>Chạy kịch bản</h2>
      <p className="muted">Các kịch bản và biến bên dưới đã được máy local cho phép.</p>
      <form id="run-form">
        <div className="two">
          <label>
            Chrome profile<select id="run-profile" required></select>
          </label>
          <label>
            Kịch bản<select id="run-scenario" required></select>
          </label>
        </div>
        <div id="variables"></div>
        <button id="run" className="primary" type="submit">
          Chạy trên thiết bị
        </button>
        <div className="schedule-controls">
          <label>
            Ngày và giờ chạy
            <input id="schedule-at" type="datetime-local" step="60" />
          </label>
          <button id="schedule-now" type="button">
            Bây giờ
          </button>
          <button id="schedule-later" type="button">
            Sau 15 phút
          </button>
          <button id="schedule-create" type="submit">
            Đặt lịch
          </button>
        </div>
      </form>
    </div>
  );
}
