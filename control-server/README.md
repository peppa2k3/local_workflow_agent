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

Muốn build container từ source bằng GitHub Actions, xem [hướng dẫn deploy](deploy/GITHUB_ACTIONS.md). Workflow chỉ chuyển `control-server/`; source releases và file `.env` ở `/opt/agent-local`, local engine và extension vẫn ở máy local.

Launcher gốc `node remote-control.js` vẫn hoạt động. App ưu tiên `.env` riêng, fallback `.env.control` cũ. SQLite cũ `data/control/control.sqlite` ở gốc tiếp tục được dùng nếu có; standalone dùng `control-server/data/control.sqlite`. Override bằng `CONTROL_ENV_FILE`, `CONTROL_DATABASE`.

Đây là server HTTP polling, không phải server Socket.IO Corebase. Video/Chrome chạy trên local; server chỉ điều phối.

### Tốc độ mạng và tác vụ local

Control Server hiển thị tốc độ tải xuống và tải lên theo Mbps, tính từ lưu lượng thực tế qua các giao diện mạng đang hoạt động trên máy Windows trong khoảng giữa hai lần lấy mẫu. Agent dùng bộ đếm hệ điều hành và hiển thị dấu gạch ngang khi chưa có mẫu hoặc khi thiết bị offline.

Mục **Tác vụ từ máy local** hiển thị lượt chạy và lịch chờ trong phạm vi quyền đã cấp. Có thể dừng lượt chạy, đổi giờ, hủy hoặc xác nhận lịch khi agent online. Khi agent offline, trang giữ ảnh chụp trạng thái cuối.

## Kho video

1. Chạy `node index.js` trong thư mục `control-server` theo cấu hình bên trên. Giữ file SQLite ở volume bền vững khi triển khai Docker. Khởi chạy local bằng `node local-agent.js --daemon` từ gốc repo.
2. Đăng nhập Control Server. Ghép thiết bị ở trang **Remote Control** của dashboard local và cấp quyền cho profile, scenario đích. Trên trang **Scan YouTube** của máy local, cấu hình nguồn, bộ lọc rồi bật quét theo [guide scanner](../local-workflow-agent/docs/SCANNER.md).
3. Chọn thiết bị trên Control Server để xem scan bật/tắt, đang quét, các lượt chạy được cấp quyền và thời điểm snapshot. Hai hoạt động có thể diễn ra đồng thời. Khả năng nhận task cần profile được cấp quyền đang rảnh và scenario phù hợp; bước Chrome cần extension kết nối. Sau 45 giây thiếu heartbeat, máy chuyển offline và UI hiển thị trạng thái cuối. Snapshot mới được gửi lại khi agent kết nối.
4. Mở **Kho video** tại `/library`. Tìm theo tiêu đề, ID, topic hoặc máy gửi, lọc đã dùng/chưa dùng và mở kết quả từng check. Mỗi bản ghi hiển thị nguồn gửi, thời điểm đo/nhận và danh sách ID job liên kết. Lệnh chạy/đặt lịch từ Control Server có biến `video_url` khớp clip trong kho sẽ được liên kết bằng ID job. Clip mới có `used=false` và danh sách job rỗng. Copy URL hoặc JSON không đánh dấu clip đã dùng.
5. Để **Copy biến scenario**, chọn máy và scenario đã cấp quyền có các biến `video_url`, `thu_muc_tai`, `reels_url`, `ten_phim`, `ten_file`. Điền thư mục tuyệt đối và URL đăng Reels trong scenario trước. Agent chia sẻ hai giá trị đích đó qua heartbeat. JSON sao chép lấy URL từ clip và giữ nguyên `{{download_title}}`, `{{download_file_name}}`. Dùng trường `variables` trong JSON cho scenario. Khi quyền hoặc đường dẫn thay đổi, đợi heartbeat tiếp theo rồi bấm **Làm mới** trong kho. Clipboard cần HTTPS hoặc localhost.

### Giao thức nhận và chống trùng

Local dùng cùng device Bearer token và ID máy của phiên ghép nối khi POST tới `/api/scanner/videos`. Dữ liệu và các khóa chống trùng được phân vùng theo tài khoản. Server chỉ ghi kết quả khi toàn bộ check bắt buộc đạt và URL khớp ID. Giao dịch SQLite ghi bản ghi, khóa nhận diện và biên nhận cùng lúc.

Phản hồi gồm `status`, `record_id`, `reason`. Lần đầu là `accepted`; gửi lại bản accepted với cùng submission từ cùng máy là `replayed`. Với submission khác trùng video, server trả `duplicate` và ID bản gốc, kể cả khi gửi lại sau mất phản hồi. Cùng submission nhưng metadata thay đổi nhận HTTP 409. Agent giữ hàng đợi khi mạng lỗi.

Nếu local có SHA-256 đã tính từ byte media thực, có thể gửi thêm `content_hash: { "algorithm": "sha256", "verified": true, "value": "<64 ký tự hex>" }`. Server tin chứng thực hash từ thiết bị đã ghép nối. Scanner gửi metadata trước khi tải nên thông thường so theo ID YouTube. Hai ID khác nhau chỉ trùng tiêu đề vẫn là hai bản ghi, được gắn nhãn nghi trùng.

Kiểm thử từ gốc repo bằng `node tests/video-library.js` (HTTP loopback, SQLite và Chrome test riêng) hoặc `npm test`.

### Tự giao job

Trong **Kho video**, công tắc **Tự tạo và giao job từ kho video** mặc định tắt. Bấm **Lưu cài đặt** sau khi đổi công tắc hoặc số giờ chờ. Cài đặt áp dụng cho tài khoản đang đăng nhập và được lưu trong SQLite. Khi tắt, server vẫn nhận clip, xử lý kết quả đang chạy và nhận lệnh thủ công.

Server xét clip theo thứ tự nhập kho. Clip cần có topic trùng một mục trong `accepted_topics` của kịch bản. Trong các lựa chọn còn slot, số `assignment_priority` lớn hơn được chọn trước, tiếp theo là tên file kịch bản, ID máy và tên thư mục profile theo thứ tự tăng dần. Máy phải có heartbeat và lease còn hiệu lực. Profile phải được cấp quyền, rảnh và có extension kết nối nếu kịch bản dùng trình duyệt. Lần polling của máy được chọn giữ clip và giao lệnh trong cùng giao dịch SQLite.

Nếu chưa có cấu hình khớp, clip được xét lại khi agent đồng bộ cấu hình. Nếu có cấu hình khớp nhưng các máy đều bận hoặc offline, **Kho video** hiển thị thời điểm xét lại. Khoảng chờ mặc định là 1 giờ. Thay đổi khoảng chờ áp dụng cho lần lập lịch kế tiếp. Lịch hiện có giữ thời hạn qua restart. Bấm **Làm mới** sau khi đến hạn để xem kết quả.

Chỉ kết quả `succeeded` của kịch bản mới đánh dấu clip đã dùng, kèm ID job, ID máy và thời điểm server ghi nhận. Khi truyền lệnh gặp lỗi, hệ thống dùng lại ID cũ và local đối chiếu nhật ký trước khi thực thi. Job lỗi, bị hủy hoặc gián đoạn giữ clip ở **Chưa dùng** và giữ liên kết đến lần thử. Nếu mất tín hiệu sau upload, mở lịch sử trên máy nhận theo ID job và kiểm tra trang đích trước khi quyết định chạy lại thủ công. Server tiếp nhận kết quả đến muộn của job chưa rõ trạng thái.

Từ gốc repo, chạy `node tests/assignment.js` để kiểm tra luồng scanner → kho → kịch bản với hai agent thử nghiệm, SQLite và bước tải mô phỏng. Chạy toàn bộ bộ kiểm thử bằng `npm test`.
