# Workflow Control Server

App server độc lập: web đăng nhập, pairing thiết bị, cấp quyền, hàng đợi chạy/dừng scenario và SQLite. Node.js 24+, không cần npm install, Chrome, Playwright hoặc MongoDB.

```powershell
cd control-server
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# Điền CONTROL_PUBLIC_URL và các biến cần thiết trong .env.
node index.js
```

Tạo user bằng `node index.js user email@example.com`, mật khẩu truyền qua stdin. Không đặt mật khẩu trên command line. Chi tiết tại [hướng dẫn remote](../docs/README.md).

```text
control-server/
├── index.js, package.json   Bootstrap/lệnh chạy riêng
├── src/                    HTTP/auth, commands, SQLite, proxy, healthcheck
├── web/                    UI server
├── shared/                 Protocol HTTP đi kèm app
├── scripts/publish-image.ps1
├── deploy/                 Docker, Compose, proxy, systemd
├── .env.example            Mẫu cấu hình process
└── data/                   SQLite mặc định, không commit
```

Build từ **thư mục control-server**:

```powershell
docker build -f deploy/Dockerfile -t workflow-control:local .
```

Chỉ source server vào build context; `.env`/SQLite không vào image. Deploy Traefik dùng `deploy/docker-compose.yml` và `deploy/.env.example`; xem [DEPLOY](deploy/README.md). `.env` trong `deploy/` là biến Compose, khác `.env` process trong app.

Launcher gốc `node remote-control.js` vẫn hoạt động. App ưu tiên `.env` riêng, fallback `.env.control` cũ. SQLite cũ `data/control/control.sqlite` ở gốc tiếp tục được dùng nếu có; standalone dùng `control-server/data/control.sqlite`. Override bằng `CONTROL_ENV_FILE`, `CONTROL_DATABASE`.

Đây là server HTTP polling, không phải server Socket.IO Corebase. Video/Chrome chạy trên local; server chỉ điều phối.
