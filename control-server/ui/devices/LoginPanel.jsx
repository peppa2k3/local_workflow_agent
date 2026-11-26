export function LoginPanel() {
  return (
    <section id="login" className="login" hidden>
      <div className="panel">
        <span className="eyebrow">Chào mừng trở lại</span>
        <h2>Đăng nhập tài khoản</h2>
        <p className="muted">Dùng tài khoản được quản trị viên VPS cấp để quản lý các máy đã ghép nối.</p>
        <form id="login-form">
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required maxLength="254" />
          </label>
          <label>
            Mật khẩu
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength="256"
            />
          </label>
          <button className="primary" type="submit">
            Đăng nhập
          </button>
        </form>
      </div>
    </section>
  );
}
