import { PageHeader, Field } from "../components.jsx";

export default function Remote() {
  return (
    <>
      <main className="shell">
        <PageHeader
          title="Điều khiển từ xa"
          description="Ghép nối tài khoản và cấp quyền chạy kịch bản cho từng profile."
        />
        <div id="message" role="status" className="notice" hidden></div>
        <div className="two">
          <section>
            <div className="panel">
              <h2>Kết nối VPS</h2>
              <div id="connection" className="muted">
                Đang đọc trạng thái…
              </div>
              <PairDevice />
              <div id="pending" hidden>
                <p>Đăng nhập web VPS và nhập mã sau:</p>
                <code id="code" className="code"></code>
                <small id="expires"></small>
                <p id="claim"></p>
                <button id="approve" className="primary" hidden>
                  Đồng ý cho tài khoản này kết nối
                </button>
              </div>
              <p>
                <button id="disconnect" className="danger" hidden>
                  Ngắt kết nối / hủy ghép nối
                </button>
              </p>
            </div>
            <div className="panel subtle">
              <h2>Máy local giữ quyền kiểm soát</h2>
              <p className="muted">
                Chỉ cấp quyền cho profile và kịch bản cần dùng. Tài khoản ghép
                nối có thể xem và quản lý tác vụ local của các profile và kịch
                bản đã cấp quyền. Mặc định tài khoản remote không được thay giá
                trị biến. Không gửi file video, mật khẩu hay cấu hình MongoDB
                lên VPS.
              </p>
              <small>
                Để chạy bước trên website, Chrome profile và extension phải hoạt
                động. Sau khi lưu quyền, VPS nhận thay đổi ở lần kết nối kế
                tiếp. Khi ngắt kết nối, các lượt chạy remote sẽ được dừng.
              </small>
            </div>
          </section>
          <section>
            <Permissions />
          </section>
        </div>
        <footer>
          Kết nối chủ động ra VPS · Không mở cổng 34719 ra Internet
        </footer>
      </main>
    </>
  );
}

function Permissions() {
  return (
    <>
      <form id="policy-form" className="panel">
        <h2>Quyền điều khiển trên máy này</h2>
        <h3>Chrome profiles</h3>
        <div id="profiles" className="choice-list"></div>
        <h3>Kịch bản được phép chạy</h3>
        <div id="scenarios" className="choice-list"></div>
        <p>
          <button className="primary" type="submit">
            Lưu quyền điều khiển
          </button>
        </p>
        <small>
          Thay đổi nội dung JSON local sẽ áp dụng cho lần chạy kế tiếp của kịch
          bản được cấp quyền.
        </small>
      </form>
    </>
  );
}

function PairDevice() {
  return (
    <>
      <form id="pair-form">
        <Field label="Địa chỉ web điều khiển">
          <input
            name="url"
            type="url"
            placeholder="https://control.example.com"
            required
          />
        </Field>
        <Field label="Tên máy hiển thị">
          <input
            name="name"
            required
            maxLength="80"
            placeholder="Máy đăng Reels văn phòng"
          />
        </Field>
        <button type="submit" className="primary">
          Tạo mã ghép nối
        </button>
      </form>
    </>
  );
}
