# Project context

## Remote control trên nhánh dev/remote (2026-10-22)

VPS riêng `node remote-control.js` (Node 24, SQLite) phục vụ web đăng nhập và điều
khiển; local `node local-agent.js --daemon` chủ động poll HTTPS mỗi 3s, reconnect
backoff. Không public cổng 34719. `/remote` trên dashboard local cấp allowlist
profile/scenario/từng biến và xác nhận tài khoản sau khi account claim code trên
VPS. Cả hai đồng ý mới tạo device credential; có revoke/disconnect. Extension
options có link cấu hình, protocol action hiện tại không đổi.

Command queue VPS và journal local bền vững; command UUID = executionId, độc lập
runId của extension. Nhận lại lệnh không tự chạy lại; crash không rõ kết quả báo
unknown. Remote Stop chỉ nhắm remote execution; mất mạng giữ lượt đang chạy, revoke
được local quan sát thì dừng remote-owned jobs. VPS chỉ nhận metadata được cấp,
step preview và kết quả; content/download/upload/Atlas vẫn do service local cũ.

Đã chia 5 prompt và commit tuần tự, roadmap tại prompts/planed/REMOTE_CONTROL_ROADMAP.md.
Hướng dẫn TLS/nginx/compose/systemd/Windows startup tại docs/REMOTE_CONTROL.md.
Không deploy VPS, cài Scheduled Task hoặc điều khiển Chrome người dùng để thử thật.

## MongoDB Atlas và kho nội dung web (2026-10-22)

Entry local-agent.js nạp .env tại project root trước CLI/server; biến shell có ưu tiên cao hơn file. MongoDB mặc định team_content; mongoSettings chỉ nạp lại URI/database/DNS khi người dùng bấm reconnect. Không đưa URI vào HTTP/log. npm run check:mongo ping thật, không tạo dữ liệu thử. .env bị ignore Git; chỉ commit .env.example.

Kiểm chứng Atlas thật sau khi người dùng điền URI: Node mặc định dùng DNS loopback và lỗi querySrv ECONNREFUSED, Windows DNS tra SRV/TXT thành công. Thêm MONGODB_DNS_SERVERS tùy chọn, chỉ đổi resolver của process Node (không đổi Windows), dùng chung cho agent và check:mongo. .env local đã điền DNS hoạt động lấy từ cấu hình Windows; URI/mật khẩu giữ nguyên. Kết nối team_content, đọc dữ liệu và quyền insert/update đã xác nhận bằng server, không ghi dữ liệu thử.

Trang /content và /api/content/* dùng cùng token/session dashboard, truy vấn live catalog có projection/tìm kiếm/phân trang. Quản lý page và sửa publication giữ nguyên ID, patch trường đã biết, kiểm tra updated_at để tránh đè cập nhật service khác. Hiển thị ngày giờ Asia/Bangkok; BSON Date UTC trong database. Không upload video bytes vào Atlas. Extension 4.2.0 kiểm tra metadata page đã resolve; dashboard chọn page active từ MongoDB, agent xác minh lại trước upload. Page local trùng key được nhận UUID chung và remap publication/event/run trước đồng bộ. Downloads cũng đồng bộ machine/source/hash/path/time để các service đọc chung. Xem docs/MONGODB_ATLAS.md.

## Lưu trữ tác vụ và cache download (2026-10-22)

Kho local `data/agent` (override LOCAL_AGENT_DATA_DIR, không theo dõi Git) lưu machine UUID, catalog metadata/outbox và từng execution trong runs/*.json bằng ghi temp + fsync + rename. Workflow persist trước thao tác/sau kết quả, giữ chi tiết step và stoppedAtStep; startup đánh dấu lượt còn chạy interrupted, không tự thực hiện lại. API/dashboard tra lịch sử sau restart. Cache URL dùng hash toàn file để tái sử dụng đúng file đã verified, khóa theo URL trong một process để hai profile không tải trùng. File mất/đổi thì tải mới; không suy đoán theo title.

Upload nhập file trước khi dispatch, lưu page/publication/upload event sau acknowledgement; pageId là UUID Content Manager, pageName/pageUrl/platform/publicationDesc nhận biến. Không gán ngày upload cho published_at (giữ null). Assets/folders/file_instances/pages/publications theo hợp đồng Content Manager (UUID v5 dùng Python JSON separators, Unicode casefold). MongoDB tùy chọn đồng bộ outbox, BSON Date, insert-only asset/publication; mất mạng giữ local để retry. Không có storage S3/copy file gốc. Xem docs/ACTIVITY_STORAGE.md. Reload extension 4.1.0 và restart agent/dashboard; user scenarios không bị migrate/ghi đè tự động.

## CLI/API automation (2026-10-20)

`node local-agent.js` vẫn khởi động server; có argv thì chạy CLI client (`--help`, profiles/scenarios/describe/run/status/stop). `/api/v1/*` yêu cầu `LOCAL_AGENT_API_TOKEN`, profile tường minh, kịch bản đã lưu và Bearer token. Overrides biến được merge trên bản sao trước prepare; runtime names không được override. `executionId` ổn định tách khỏi runId giao thức extension (vẫn đổi để vô hiệu kết quả cũ khi Stop). RAM giữ 200 lượt hoàn tất/200 khóa idempotency; từ 2026-10-22 lịch sử lượt còn lưu bền vững ở data/agent, khóa idempotency vẫn mất qua restart. Timeout workflow mặc định một giờ, tối đa 24 giờ qua API; timeout chờ CLI độc lập. Dashboard same-origin/bridge extension vẫn là local trust boundary. Xem docs/AUTOMATION_API.md.

## Mục tiêu

Người dùng xây dựng kịch bản tự động local và chạy chúng trên **Chrome profile đã đăng nhập sẵn**. Dashboard chỉnh sửa kịch bản; agent Node.js điều phối; extension trong profile hiện có gửi thao tác vào tab. Trường hợp khởi đầu là tab Reels của Facebook `https://www.facebook.com/profile.php?id=61560176683071&sk=reels_tab`, nhưng engine hỗ trợ URL khác.

## Quyết định kỹ thuật

- Playwright không điều khiển profile Chrome mặc định đang chạy. Chrome khóa thư mục profile và các phiên bản Chrome mới hạn chế remote debugging trên `User Data` mặc định. Vì vậy Playwright chỉ còn ở thử nghiệm cũ và bài test tách biệt.
- Agent lắng nghe tại `127.0.0.1:34719`; extension gửi yêu cầu HTTP qua service worker. Dashboard cũng dùng server này.
- `openFolder`, `wait` chạy trong agent. `openUrl` chạy trong background extension và chờ trang tải xong; `waitFor`, `click`, `type`, `setDate`, `setTime`, `scroll`, `upload` thao tác trên tab Chrome đã kết nối. Background giữ trách nhiệm xác nhận hoàn tất khi click thay thế document.
- Mỗi Chrome profile có workflow và tab riêng. Dashboard chọn profile; extension lưu ánh xạ thư mục profile + ID kết nối trong storage riêng của profile. Agent đọc danh sách tên/thư mục từ metadata `Local State`, không đọc phiên đăng nhập.
- Extension dùng `chrome.debugger` để gửi input và chọn file; content script tìm phần tử bằng locator semantic/CSS/XPath và ưu tiên dialog đang mở.
- Kịch bản là JSON trong `scenarios/`. Agent chấp nhận file upload cố định trong bước hoặc đường dẫn truyền lúc chạy.
- `variables` là object theo kịch bản; agent resolve `{{name}}` trên bản sao trước khi chạy, kiểm tra biến thiếu/vòng lặp, rồi validate ngày/giờ và đường dẫn file. Dashboard tự tải kịch bản được chọn; clone tạo file mới không ghi đè.
- `type` click/focus/caret trên input, textarea hoặc contenteditable (kể cả wrapper presentation và editor xuất hiện sau click), xóa qua browser editing. Dashboard yêu cầu capability `variables-v1` để tránh chạy với Node process cũ; extension từ chối text còn token biến chưa resolve.
- Dashboard theo dõi CPU/RSS/event loop của Node agent và thời gian workflow/bước theo profile. File picker là một hộp thoại Windows tại một thời điểm; debugger được tái sử dụng tới khi detach.
- `local-agent.js`, đường dẫn thư mục extension, dashboard URL và cổng 34719 là các điểm vào ổn định để không làm hỏng cách chạy hiện tại.

## Quy ước làm việc

1. Giữ tương thích với bước `selector` cũ (CSS) và các file kịch bản đã lưu.
2. Trước khi thêm action, cập nhật cùng lúc: agent (nếu cần đường dẫn/file), extension, form dashboard, docs và bài test có liên quan.
3. Không commit Chrome profile, `node_modules`, khóa `.pem`, hoặc gói `.crx`. Những file này từng được Git theo dõi; commit hiện tại chỉ ngừng theo dõi, không xóa chúng khỏi lịch sử cũ.
4. Bài test Playwright tạo Chrome riêng và trang HTML mẫu, không dùng profile Facebook của người dùng.
5. Sau khi sửa extension, người dùng phải Reload extension và tải lại tab mục tiêu.

## Giới hạn hiện tại

- `upload` chọn file và có thể kích hoạt upload của website; nếu website cần nút xác nhận hoặc chờ server xử lý, thêm các bước `waitFor`/`click` tương ứng.
- Locator hiện tìm trong document chính; iframe khác origin và Shadow DOM đóng chưa được hỗ trợ.
- Click theo tab mới mở trong khoảng quan sát 500 ms; nếu website mở tab trễ hơn, dùng `openUrl` để chọn URL rõ ràng. Tác vụ AJAX/upload cần `completion` hoặc `waitFor` theo dấu hiệu kết quả của website.
- Extension dùng cổng cố định 34719. Biến `LOCAL_AGENT_PORT` chỉ hữu ích để kiểm tra agent riêng; extension sẽ không tự đổi cổng.

## Cập nhật 2026-10-19

Đảo ngược ba commit IDM về nền `44b8e0d`, giữ lịch sử Git. Thay bằng `downloadVideo` chạy local qua yt-dlp và FFmpeg. Dashboard hỗ trợ URL/thư mục/chất lượng/timeout, phân tích metadata lấy tên và hiển thị file kết quả. Tải thuần local không cần extension; workflow có bước trình duyệt vẫn cần kết nối. Extension từ chối nếu nhận nhầm action local. Binary trong tools/ không theo dõi Git. Không đọc cookie/profile đăng nhập.

## Kết quả runtime và quản lý kịch bản (2026-10-19)

Biến thường resolve trước khi chạy. Bốn tên dành riêng download_title/download_file_name/download_file_path/download_id được giữ tới khi downloadVideo thành công rồi resolve một lần ngay trước mỗi bước; không expand đệ quy nội dung metadata. Kết quả thuộc run/profile, reset mỗi lần chạy. prepareStep validate lại, riêng upload tham chiếu clip không nhận upload override từ ô file tạm. downloadVideo phải trả verified=true sau exit/after_move/stat/FFprobe trước khi workflow tiến tiếp. Extension chặn upload đường dẫn tạm hoặc tham chiếu file chưa resolve.

Step label tùy chọn, mặc định Bước N. DELETE scenario kiểm tra tên và khóa theo scenarioName của workflow từ API đang chạy. Mẫu download-upload-reels dừng ở bước điền mô tả, không xuất bản. Các locator Facebook cần đối chiếu trên profile người dùng; kiểm thử chỉ ở Chrome tách biệt/trang fixture.


## Chất lượng cao nhất và tên sạch (2026-10-20)

downloadVideo mặc định best với sort-force FPS → res (cạnh ngắn, hỗ trợ dọc/ngang) → bitrate → codec, không cap height. Numeric quality cũ chỉ được chấp nhận về cú pháp, không còn cap. Tải mới trong mkdtemp dưới output directory, xác nhận after_move/stat/FFprobe rồi publish hard link độc quyền tên tiêu đề.ext; collision tăng số, không dùng lại file có sẵn. Chỉ dọn đúng staging của lượt chạy sau kiểm tra parent/prefix. Runtime file references lấy đường dẫn cuối, giữ gate verified. Dashboard thêm thông số media; video-quality-best-v1 chặn agent cũ.


## Giảm polling và cập nhật DOM (2026-10-21)

Dashboard adaptive polling: idle 10s, running 1500ms, picker 1000ms; hidden/pagehide pause, visibility resume, request chung cho Run preflight và status, lỗi backoff tối đa 60s. Chỉ ghi DOM khi đổi, giữ editor/focus và tái dùng profile options. Chạy/Dừng/switch cập nhật ngay, không đổi protocol hành động.

Server createProfileCache khởi tạo bằng readFile async rồi listen; get trả snapshot RAM, stale 30s trigger một async refresh dùng chung. Giữ snapshot cũ khi metadata tạm lỗi. listProfiles sync vẫn dành cho caller cũ, không dùng trong hot path server. Test dashboard-performance dùng fake clock trên Chrome riêng để đo request/DOM/focus/backoff và test cache đọc chậm.
