# Control Server

Control Server quản lý thiết bị theo tài khoản. Người dùng đăng nhập qua HTTPS để chạy hoặc lên lịch scenario đã được local cấp quyền. Máy local nhận lệnh qua polling, thực thi trên profile được chọn và gửi tiến độ về server. [Cài và chạy trên VPS](../guides-server.md) · [Phát hành bằng GitHub Actions](../guides-deploy.md)

## Thiết bị và lịch sử

Trang chính hiển thị trạng thái online/offline, heartbeat, chỉ số tài nguyên, profile và tác vụ của thiết bị. Sau 45 giây thiếu heartbeat, máy chuyển offline và giao diện hiển thị trạng thái cuối. Có thể yêu cầu chạy, dừng, đổi giờ hoặc hủy lịch theo quyền và trạng thái tác vụ. **Lịch sử điều khiển** hiển thị 8 lệnh mỗi trang từ mới tới cũ, kèm profile, scenario, mốc thời gian và kết quả từng bước.

## Kho video

Trang `/library` nhận metadata từ các scanner đã ghép, hỗ trợ tìm kiếm, lọc đã dùng/chưa dùng, xem check và sao chép biến scenario. SQLite ghi nhận submission theo tài khoản, trả lại biên nhận khi local gửi lại sau mất kết nối và chống trùng theo ID video hoặc hash đã xác minh.

**Tự tạo và giao job** mặc định tắt. Khi bật, server xét clip theo thứ tự nhập kho, khớp topic với `accepted_topics`, ưu tiên scenario có `assignment_priority` cao và chọn profile được phép còn rảnh. Job thành công mới đánh dấu video đã dùng. Với kết quả chưa rõ sau upload, đối chiếu lịch sử theo ID job và trang đích trước khi gửi lại.

## Runtime và lưu trữ

- `index.js` chạy trên Node.js 24. `src/` xử lý HTTP, auth, hàng đợi và SQLite. `web/` chứa dashboard. `deploy/` chứa Dockerfile, Compose và mẫu reverse proxy.
- Khi chạy trực tiếp bằng Node, cấu hình process bằng `.env` riêng theo [.env.example](.env.example). Launcher gốc `node remote-control.js` hỗ trợ checkout cũ và `.env.control`. Có thể chỉ định `CONTROL_ENV_FILE` và `CONTROL_DATABASE`.
- Container lưu SQLite ở `/data/control.sqlite` trong volume bền vững. Một instance quản lý volume. Deploy từ source dùng [mẫu env VPS](deploy/source.env.example). Nếu vận hành bằng image registry, dùng [Compose cho image](deploy/docker-compose.yml) với [mẫu env tương ứng](deploy/.env.example), đặt `CONTROL_IMAGE` theo tag và `CONTROL_TRUSTED_PROXY_IPS` theo IP nội bộ của Traefik. Script [publish-image.ps1](scripts/publish-image.ps1) hỗ trợ build/push image này.

## Phát triển giao diện

Mã nguồn React nằm trong `ui/devices/` và `ui/library/`. Mỗi trang có entry riêng. Hai trang dùng chung API client ở `ui/shared/api.js`, toast ở `ui/public/toast.js` và một bản React runtime. Vite tạo HTML có sẵn thanh điều hướng cho cả hai route.

CSS trong `ui/styles/` được chia theo nền chung, trang Thiết bị, trang Kho video, card video và toast. Card hiển thị hai cột từ 761 px, một cột từ 760 px trở xuống và thu gọn thumbnail ở 420 px. Bộ lọc dùng bốn cột trên 960 px, hai cột đến 560 px và một cột từ 560 px trở xuống.

Chạy các lệnh sau ở thư mục gốc với Node.js 24 để build và kiểm tra giao diện qua Control Server.

```sh
npm --prefix control-server ci
npm --prefix control-server run build
node tests/remote-web.js
node tests/video-library.js
```

Commit cả mã nguồn và tài nguyên do Vite xuất vào `control-server/web/`. Node và Docker phục vụ trực tiếp các tệp này. Khi phát triển có thể chạy `npm --prefix control-server run build -- --watch` cùng Control Server để build lại khi lưu.
