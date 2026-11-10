# Remote Control Server

Server VPS riêng, dùng Node.js 24 và SQLite tích hợp sẵn; không cần `npm install`, Chrome, Playwright hoặc MongoDB driver.

- `index.js`: cấu hình `.env.control`, CLI tạo tài khoản, khởi động server.
- `src/`: HTTP/auth/pairing, queue lệnh, SQLite, proxy và healthcheck.
- `web/`: giao diện điều khiển trên VPS.
- `../shared/remote-protocol.js`: giao thức dùng chung với agent.

Chạy từ gốc repository bằng `node remote-control.js` hoặc `node control-server/index.js`. Cấu hình `.env.control` và `data/control/` vẫn ở gốc; có thể override bằng biến môi trường như trước.

Docker chỉ chép `remote-control.js`, `control-server/` và `shared/`. Xem [triển khai Docker/Traefik](../deploy/control/README.md) và [hướng dẫn vận hành](../docs/REMOTE_CONTROL.md).
