# Tiến độ phát triển

## 2026-10-24 — Chống trùng download/upload và popup

- Guard URL, filepath/filename/SHA-256 dựa trên local và MongoDB; DB lỗi thì dừng.
- Tạm dừng trước thao tác, xác nhận đúng execution/step trên local, có nút dừng.
- Lưu quyết định và upload pending trước dispatch; cảnh báo thử lại khi kết quả chưa rõ.
- Popup lỗi trên các trang local và thông báo trên VPS, giữ legacy selectors.
- Kiểm chứng: npm test đầy đủ, fixture local/DB + popup, pending → uploaded và node --check/git diff --check đạt; không thao tác website hoặc ghi thử Atlas thật.

## 2026-10-24 — Navbar chuyển nội dung và remote

- Thống nhất navbar đầu trang local: Kịch bản, Quản lý nội dung, Remote Control.
- Đánh dấu trang hiện tại, hỗ trợ bàn phím và xuống dòng trên mobile.
- Kiểm tra chuyển trang bằng Chrome tách biệt ở chiều rộng 1280 và 390 px.
- npm test đầy đủ, node --check và git diff --check đạt.

## 2026-10-23 — Đóng gói Docker Hub và VPS Traefik

- Thêm docker-compose.yml pull image, env VPS, external network/labels Traefik,
  SQLite volume bền vững, giới hạn log và healthcheck đúng Host.
- Thêm script Windows build/push theo tag/kiến trúc và giới hạn build context.
- Proxy chỉ tin IP cấu hình, chống giả X-Forwarded-For và giữ chế độ nginx loopback.
- Hướng dẫn tiếng Việt từ build/push đến bootstrap, ghép local, update/rollback/backup.
- Kiểm chứng: npm test đầy đủ, node --check, PowerShell AST và compose config đạt.
  Build linux/amd64 local thành công; container fixture xác nhận UID 1000,
  healthcheck, SQLite giữ tài khoản qua restart và không chứa dữ liệu local.
  Chưa push Docker Hub hoặc thay đổi VPS/Traefik thật.

## 2026-10-22 — Remote control (dev/remote)

- Lõi outbound HTTPS, lưu control SQLite riêng, tài khoản scrypt/session/CSRF,
  code ghép nối hết hạn, tài khoản và local xác nhận, revoke/ownership.
- Queue/journal bền vững, command UUID/idempotency/lease, allowlist local,
  run/stop remote-owned, heartbeat/reconnect, step history và crash recovery.
- Web VPS đăng nhập/device/status/run/history; local /remote cấp quyền và xác
  nhận; link dashboard/extension, giữ nguyên scenario/actions và loopback 34719.
- Daemon, graceful shutdown, script startup Windows interactive, deploy templates
  Node 24/nginx TLS/compose/systemd, docs REMOTE_CONTROL.md.
- 5 feature prompt đã triển khai tuần tự; kiểm chứng fixture/mock riêng. Không
  triển khai VPS, ghép máy thật, cài startup task hay chạy Facebook.
- Kiểm chứng hoàn tất: `npm test` đạt toàn bộ; các thay đổi cuối ở expiry/receipt/UI
  được chạy lại bằng `npm run test:remote`. `node --check` mọi JavaScript thay đổi,
  PowerShell AST parse và `git diff --check` đạt.

Cập nhật: 2026-10-22 (Asia/Bangkok).

## 2026-10-22: khôi phục agent đang chạy còn giữ lỗi DNS cũ

- Check:mongo thành công nhưng tiến trình dashboard chưa nhận bản sửa DNS, vẫn ECONNREFUSED với 13 metadata đang chờ; có workflow download đang chạy.
- Áp dụng DNS đã kiểm chứng cho riêng process hiện tại và reconnect qua API, giữ nguyên workflow. Phiên debug tạm đã đóng.
- Xác minh trực tiếp status và summary HTTP 200: connected=true, database team_content, pending=0, error rỗng; workflow tiếp tục running. Không thay URI/mật khẩu hay tạo dữ liệu thử.
- Không thay đổi JavaScript; cấu hình và bản sửa cho lần khởi động tiếp theo đã có ở .env và commit 17b9161.

## 2026-10-22: xác minh Atlas thật và sửa DNS SRV

- Sau khi người dùng điền .env, xác nhận cấu hình được nạp đúng nhưng Node dùng DNS loopback gây querySrv ECONNREFUSED. Windows vẫn giải được SRV/TXT.
- Thêm MONGODB_DNS_SERVERS cho resolver của process, dùng chung agent và check:mongo; không thay đổi network Windows. Đã lưu DNS hoạt động từ cấu hình máy vào .env local, giữ nguyên URI/mật khẩu.
- Check:mongo đã kết nối thật team_content; đọc pages/assets và xác nhận quyền insert/update qua connectionStatus, không tạo dữ liệu thử. URI và credentials không được in ra hoặc commit.
- Test DNS apply/restore/validation/error classification và .env reload; npm test và node --check.

## 2026-10-22: .env, MongoDB Atlas và giao diện nội dung dùng chung

- Nạp .env trước server/CLI, giữ ưu tiên biến shell; đọc lại URI/database qua giao diện. Thêm .env.example, ignore file cấu hình thật, script check:mongo chỉ ping và báo lỗi an toàn.
- Trang /content hiển thị kết nối thật, thống kê và catalog download/upload/page/publication/asset/file/run; tìm kiếm literal, phân trang, xem chi tiết, quản lý page và sửa metadata publication. Kiểm tra phiên bản updated_at, giữ ID và các trường của service khác.
- Thêm picker page active trong workflow, xác minh MongoDB trước upload; dùng UUID page đã có từ service khác, remap các quan hệ local trước đồng bộ. Thêm collection downloads dùng chung; không chuyển bytes video vào MongoDB.
- Kiểm thử .env/ưu tiên shell/reload/cwd khác, API auth, adapter DB/date/retry/khóa phiên bản, reconcile page cùng quan hệ run/publication/event, preflight chặn upload khi DB lỗi và UI desktop/mobile bằng Chrome tách biệt. Npm test và node --check; đã xem ảnh render UI.
- Kiểm tra Atlas thật hiện chưa thực hiện được: .env local đã tạo nhưng MONGODB_URI còn rỗng; không có URI trong môi trường. Người dùng điền URI rồi bấm Đọc lại .env / kết nối hoặc chạy npm run check:mongo.

## 2026-10-22: lịch sử tác vụ, metadata nội dung và dùng lại download

- Lưu từng execution/step, thời gian, trạng thái, lỗi và vị trí dừng trên đĩa; khôi phục lượt bị ngắt thành interrupted. API/CLI đọc lịch sử sau restart, dashboard xem theo profile.
- Cache URL → path/asset, xác minh size/SHA-256 trước khi dùng lại; cùng URL qua restart/profile không tải lại nếu file còn đúng. File mất/đổi thì tải mới, giữ nguyên gate FFprobe; khóa tải đồng thời theo URL.
- Upload lưu file/asset/page/publication theo hợp đồng Content Manager, thêm biến page và uploaded_at riêng với published_at (null khi chưa xác nhận xuất bản). Extension báo URL trước/sau thao tác, giữ CSS selector legacy.
- Kho local không theo dõi Git; MongoDB tùy chọn, outbox bền vững, retry, BSON Date và insert-only asset/publication. Chưa chạy ghi vào MongoDB thật vì máy chưa cấu hình URI; đã kiểm tra adapter lỗi/retry/Date/upsert.
- Kiểm chứng: npm test gồm fixture lịch sử 6 bước lỗi tại bước 6, cache/hash/file mất/đổi, khóa đồng thời/hủy, restart HTTP/CLI, UI metadata/lịch sử và yt-dlp/FFmpeg/FFprobe thật; Chrome test tách biệt. JavaScript node --check, dashboard vm.Script và git diff --check.

## 2026-10-20: CLI và API chạy tự động

- CLI độc lập qua `node local-agent.js <command>`, chọn profile/kịch bản, biến inline/file, upload override, JSON output, wait/exit codes và hai loại timeout.
- API v1 Bearer token, kiểm tra Host/Origin/body/kiểu dữ liệu, chỉ chạy kịch bản đã lưu; idempotency có giới hạn trong RAM.
- Lượt chạy có ID ổn định, trạng thái cuối, lịch sử 200 lượt; dừng theo ID tránh dừng nhầm lượt mới. Biến riêng từng lượt không sửa file; giới hạn mở rộng biến.
- Dashboard hiển thị trạng thái API và execution ID; extension options giải thích profile cho CLI. Tài liệu tại AUTOMATION_API.md và SETUP.md.
- Kiểm thử fixture HTTP/CLI: auth, input sai, UTF-8, isolation, idempotency, lịch sử, failure/Stop/timeout và tương thích bridge/dashboard; không dùng profile đăng nhập.
- Xác minh cuối: `npm test` đạt toàn bộ (kể cả công cụ video thật và Chrome riêng), `node --check` cho mọi JavaScript thay đổi, kiểm tra script dashboard bằng vm.Script và `git diff --check` đạt.

## Completed

- Sửa `type` cho input/textarea/contenteditable và wrapper presentation: click, chờ editor, xác nhận focus/caret rồi mới nhập; xóa rich text bằng browser editing, append khi clear=false, lỗi rõ với readonly/vùng không nhập được.
- Xác nhận nguyên nhân nhập nguyên token biến ở phiên chạy cũ: agent cũ vẫn đang chạy. Thêm kiểm tra capability trên dashboard và chặn token chưa resolve trong extension; test HTTP chứng minh lấy giá trị mới mỗi lần chạy và JSON luôn giữ tham chiếu.

- Thao tác `setDate`/`setTime`: click input, nhập ngày/giờ native hoặc text, phát input/change, kiểm tra giá trị; giữ CSS selector cũ.
- Biến theo kịch bản ở navbar, chèn `{{name}}` vào input, resolve trước khi chạy và báo lỗi biến thiếu/vòng lặp.
- Chọn kịch bản tự mở đúng editor, chạy trên profile đã chọn; clone độc lập giữ steps/variables và không ghi đè bản sao cũ.
- Hiển thị CPU/RAM/event loop agent và thời gian bước theo profile; tránh poll chồng; khóa picker khi chờ, đưa hộp thoại lên trước và tái sử dụng debugger để giảm lượt dò lặp.
- Kiểm thử cục bộ bằng Chrome tách biệt cho ngày/giờ, file chooser CDP thực, biến, clone và lựa chọn profile/kịch bản trên dashboard.

- Điều phối tuần tự theo xác nhận hoàn tất: chờ navigation/DOM ổn định sau openUrl/click; hỗ trợ điều kiện kết quả visible/hidden/enabled cho tác vụ bất đồng bộ, timeout và dừng riêng.
- Dashboard chọn/mở nhiều Chrome profile và chạy đồng thời các workflow độc lập; extension cấu hình profile một lần trong Options, từ chối kết nối trùng và kết quả cũ.
- Kiểm thử Chrome tách biệt cho redirect, tải tài nguyên chậm, click thay document, kết quả SPA; kiểm thử cách ly workflow/profile.

- Local Agent chạy trong Node.js, điều phối các bước kịch bản JSON và cung cấp dashboard HTTP local.
- Extension thao tác trên Chrome profile đang dùng: cuộn, click, nhập chữ, chọn phần tử trực tiếp, locator semantic/CSS/XPath.
- Hỗ trợ dialog/lớp phủ: chờ phần tử nhận click, ưu tiên dialog đang hiển thị.
- Hỗ trợ upload: đường dẫn cố định hoặc truyền khi chạy, click nút mở file chooser, chọn file qua Chrome Debugger.
- Dashboard có nút chọn file Windows cho đường dẫn upload lưu trong bước và đường dẫn tạm cho lần chạy.
- Giao diện tạo/sửa/sắp xếp/lưu/chạy/dừng kịch bản; tài liệu thiết lập và bài kiểm tra dialog/upload mẫu.
- Refactor agent vào `src/agent/`, giữ `local-agent.js` làm điểm vào; tách thử nghiệm Playwright cũ vào `legacy/`.
- Loại dữ liệu Chrome profile, dependency cài sẵn và khóa đóng gói khỏi phần Git theo dõi.

## Processing

- Chưa có mục đang triển khai tại thời điểm commit này. Lỗi thực tế mới sẽ được ghi trong `prompts/processing/` trước khi sửa.

## Planed

- Kiểm thử end-to-end trên website mục tiêu với các locator và phản hồi upload thực tế.
- Hỗ trợ tab mới, iframe và Shadow DOM khi có kịch bản cần chúng.
- Thêm dấu hiệu hoàn tất upload theo từng website, thay cho chờ thời gian cố định.
- Cân nhắc cấu hình cổng agent và extension đồng bộ nếu cần chạy nhiều phiên.

## 2026-10-19: chuyển IDM sang yt-dlp + FFmpeg

- Đảo ngược phần IDM về nền `44b8e0d`, giữ lịch sử Git.
- Thêm tải video URL: metadata title/ID, giới hạn chất lượng, tên file an toàn, không ghi đè, xác nhận file hoàn tất, timeout và Stop cây tiến trình.
- Cập nhật agent, extension, dashboard, scenario mẫu và hướng dẫn cài portable tools.
- Kiểm chứng: npm test và node --check cho JavaScript thay đổi, script dashboard. Test video HTTP cục bộ dùng executable thật khi có tools; không dùng profile đăng nhập.

Kiểm chứng thực tế 2026-10-19: tải video HTTP cục bộ, tải lại không ghi đè, ghép DASH hai luồng bằng FFmpeg; FFprobe xác nhận hình + tiếng. Dashboard kiểm tra phân tích URL với biến, tên Unicode và tải khi extension offline. URL YouTube 9qq_Fqp2rnM phân tích được title/ID/duration; chưa tải toàn bộ video YouTube (7768 giây).

## 2026-10-19: nối tải clip và upload

- Thêm runtime references title/file name/file path/id, alias tên phim, resolve và validate khi tới bước; giữ CSS selector cũ.
- Gate tải hoàn tất bằng yt-dlp exit + after_move + file cuối khác rỗng + FFprobe video/duration, status verified; Stop/lỗi không chạy tiếp.
- Mẫu download-upload-reels: tải → mở Reels → tạo/upload → Tiếp → điền tiêu đề, dừng trước Đăng.
- Dashboard quản lý xóa kịch bản (xác nhận, khóa khi workflow API đang chạy), đặt tên bước, mặc định Bước N.
- Kiểm thử: điều phối pending/success/failure/Stop, cách ly kết quả và alias; API xóa, UI lưu tên/xóa/hủy; extension upload CDP trên Chrome riêng, công cụ tải/FFprobe thật trên fixture. Chưa tự chạy Facebook/profile đăng nhập.


## 2026-10-20: chất lượng cao nhất, bỏ ID khỏi tên file

- FPS cao trước, rồi độ phân giải theo cạnh ngắn, bitrate và codec; không cap 1080, cả với JSON numeric quality cũ.
- Tên cuối chỉ tiêu đề và extension, trùng tên thêm số. Tải mới vào staging riêng, xác nhận media rồi publish độc quyền; không ghi đè bản cũ hoặc chạm dữ liệu Chrome.
- Dashboard thể hiện chính sách và thông số media, bridge 4.0.2; cập nhật docs và test chọn format bằng yt-dlp thật cùng fixture download/merge/file hỏng/collision.


## 2026-10-21: hiệu suất dashboard và profiles

- Giảm request idle từ 40 xuống 6/phút, dừng khi tab nền; giữ nhịp nhanh khi workflow/picker chạy. Một request profiles đang chờ, dùng chung với preflight Chạy, backoff khi mất agent.
- DOM cập nhật có so sánh, không ghi lại text không đổi hoặc dựng lại profile dropdown đang focus; giữ input/editor.
- Metadata Chrome được đọc bất đồng bộ với cache 30s, dedupe refresh, giữ dữ liệu khi Chrome đang ghi. Chặn khởi động server tới khi lượt nạp đầu hoàn tất để giữ profile discovery đúng.
- Test mới mô phỏng thời gian trên Chrome tách biệt: budget request, hidden/resume, request chậm, Chạy/Dừng, focus/DOM, backoff và cache async.
