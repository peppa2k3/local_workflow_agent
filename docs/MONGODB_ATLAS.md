# MongoDB Atlas và giao diện quản lý nội dung

## Cấu hình

Agent tự đọc `.env` tại thư mục gốc dự án trước khi khởi tạo server hoặc CLI, kể cả khi gọi `node D:\CODE_DND\playwright_test\local-agent.js` từ thư mục khác. File `.env` không được đưa vào Git; mẫu cấu hình là `.env.example`.

```dotenv
MONGODB_URI="mongodb+srv://DB_USER:URL_ENCODED_PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority"
MONGODB_DATABASE=team_content
```

Thay URI bằng connection string thực tế của Atlas đang hoạt động. Dùng database user có quyền đọc/ghi `team_content`; thêm IP của máy chạy agent vào IP Access List của Atlas. Mật khẩu có ký tự đặc biệt phải percent-encode trong URI. Không dán URI vào dashboard, scenario hoặc tài liệu; browser không nhận URI/mật khẩu.

```powershell
npm install
npm run check:mongo
node local-agent.js
```

`check:mongo` chỉ ping database bằng kết nối thật, không tạo dữ liệu thử. Thành công in `connected: true` và tên database; thiếu URI hoặc lỗi kết nối báo chưa thành công với thông báo đã bỏ thông tin nhạy cảm.

Biến đã được đặt trong PowerShell/process có ưu tiên cao hơn `.env`, kể cả `MONGODB_URI` đang là chuỗi rỗng. Nếu đổi URI/database/DNS trong `.env`, bấm **Đọc lại .env / kết nối** trên trang quản lý để nạp lại cấu hình MongoDB và mở kết nối mới. Các cấu hình khác như token/cổng vẫn cần restart agent. Có thể chọn file cấu hình khác bằng `LOCAL_AGENT_ENV_FILE`.

Nếu Node.js báo `querySrv ECONNREFUSED` trong khi Windows vẫn tra SRV thành công, có thể đặt `MONGODB_DNS_SERVERS` thành IP DNS đang hoạt động của máy, phân cách bằng dấu phẩy nếu có nhiều IP. Agent và check:mongo áp dụng cấu hình này cho resolver của process Node; không đổi DNS Windows và không đổi URI/mật khẩu. Giá trị rỗng dùng DNS mặc định ban đầu của process. Chỉ nhận IP (IPv4/IPv6), không nhận URI/hostname. Chi tiết về [DNS SRV Atlas](https://www.mongodb.com/docs/atlas/troubleshoot-connection/#connection-refused-using-srv-connection-string) và [dns.setServers của Node](https://nodejs.org/api/dns.html#dnssetserversservers).

## Giao diện web

- Workflow: `http://127.0.0.1:34719/`.
- Kho nội dung: `http://127.0.0.1:34719/content`.

Trang kho nội dung có trạng thái kết nối thật, database, số metadata local đang chờ và thời điểm đồng bộ gần nhất. **Kiểm tra kết nối** thực hiện ping; **Đồng bộ ngay** đẩy outbox; **Làm mới dữ liệu** đọc lại dữ liệu đã được các service khác cập nhật. Agent vẫn tự đồng bộ mỗi 5 giây; trang quản lý không tự polling toàn bộ catalog.

Các tab Download, Upload, Pages, Publications, Assets, File trên máy và Lượt chạy truy vấn trực tiếp database cấu hình, có tìm kiếm literal, phân trang 25 bản ghi và xem chi tiết. Counts là tổng bản ghi của collection dùng chung, không chỉ dữ liệu do agent hiện tại tạo. Lịch sử local tại dashboard cũ vẫn hoạt động khi Atlas tạm mất kết nối.

Trong **Pages**, tạo hoặc sửa tên, nền tảng, URL và trạng thái active. ID là UUID string, tên/platform được trim và key dùng Unicode casefold. Không xóa page: chọn ngừng hoạt động để giữ các liên kết cũ. Sửa page chỉ cập nhật trường nghiệp vụ đã biết, giữ trường bổ sung của service khác.

Trong **Publications**, sửa mô tả, permalink và thời điểm xuất bản thật; để trống ngày khi chưa biết. Form dùng Asia/Bangkok (UTC+7), database lưu BSON Date UTC. Giữ nguyên ID publication khi sửa ngày/URL; giữ nguyên độ chính xác ngày đã có nếu không thay đổi ô ngày. Thời gian hoàn tất upload vẫn ở `upload_events.uploaded_at`, không tự thay cho ngày đăng.

Form sửa gửi phiên bản `updated_at` đã đọc. Nếu service khác vừa cập nhật, server báo xung đột để người dùng làm mới trước khi lưu; không ghi đè cả document.

## Chọn page dùng chung khi upload

Trong dashboard workflow, tại bước `upload`, bấm **Chọn page từ MongoDB**, chọn một page active. Agent điền `pageId`, `pageName`, `pageUrl`, `platform` vào kịch bản; có thể tiếp tục dùng biến `{{...}}` như trước. Picker hiển thị tối đa 50 page active; nếu nhiều hơn, tìm page ở trang quản lý và sao chép UUID vào bước upload.

Trước khi gửi upload cho extension, agent tra page trong MongoDB nếu có cấu hình kết nối và metadata page. Page UUID không tồn tại, page inactive hoặc mất kết nối sẽ dừng bước trước khi chọn file. Agent dùng thông tin page mới nhất; không đưa credentials database sang extension. Khi chưa cấu hình MongoDB, workflow local/legacy vẫn chạy như trước.

Đối với các page tự tạo trong kho local khi offline, lần đồng bộ đối chiếu UUID và cặp `platform_key/name_key`. Nếu database đã có cùng page dưới UUID khác, agent dùng UUID đang có, đổi các tham chiếu publication/upload/lịch sử local liên quan trước khi đồng bộ. Không ghi đè metadata page/asset/publication đã có từ service khác bằng bản import cũ. Page inactive hoặc xung đột giữa hai page khác nhau vẫn báo lỗi thay vì tự gộp sai page.

## Collection dùng chung

Giữ nguyên hợp đồng `pages`, `folders`, `assets`, `file_instances`, `publications` của Team Content Manager. Các ID là string; asset ID là SHA-256 toàn file; thời gian nghiệp vụ là BSON Date UTC. Metadata asset/publication lần import dùng `$setOnInsert`, giữ mô tả và `storage` do service khác cập nhật.

Các phần mở rộng để service khác theo dõi công việc:

| Collection | Nội dung |
| --- | --- |
| `downloads` | `_id` UUID v5 từ [machine UUID, URL nguồn chuẩn hóa], `machine_id`, `source_url`, `asset_id`, `file_instance_id`, `file_path`, `file_name`, `title`, `video_id`, `size`, `duration`, `downloaded_at`, `verified` |
| `upload_events` | Sự kiện theo run UUID/step index, `asset_id`, `page_id`, `publication_id`, URL page/URL thực tế, `uploaded_at`, trạng thái |
| `workflow_runs` | Kịch bản/profile, trạng thái lượt, vị trí dừng, thời gian và chi tiết từng step |

`downloads` giữ một bản ghi mới nhất cho mỗi máy/URL; lịch sử mỗi lần chạy nằm trong workflow_runs. Cache URL cũ được bổ sung vào outbox khi nâng cấp mà giữ nguyên ngày tải. Cùng URL trên máy khác có thể có đường dẫn local khác; đường dẫn này không được coi là URL tải file chung. Agent chỉ tái sử dụng file mà cache local đã xác minh size/SHA-256.

MongoDB nhận metadata download/upload. Video gốc vẫn ở máy tải hoặc object storage do service khác triển khai; tính năng này chưa upload bytes video vào MongoDB/GridFS/S3. Dashboard hiển thị `assets.storage` nếu service khác đã thêm theo hợp đồng, không thay đổi phần đó.

Mất mạng giữ outbox trên đĩa và thử lại. Không tự xóa bản ghi của service khác hoặc đồng bộ một bản snapshot local đè lên database. Xem thêm [ACTIVITY_STORAGE.md](ACTIVITY_STORAGE.md).

API web nằm tại `/api/content/*` và dùng cùng chính sách Bearer token/session dashboard với `/api/*`: GET `status`, `summary`, `catalog/:collection`; POST `ping`, `reconnect`, `sync`, `pages`; PATCH `pages/:uuid`, `publications/:uuid`. Catalog chỉ cho phép các collection/trường đã định nghĩa; không có endpoint nhận truy vấn MongoDB tùy ý. Query `q` tối đa 256 ký tự, `limit` từ 1–50, `offset` từ 0–100000; filter page `active=true/false`, publications/upload_events `pageId`, và download/upload/publication/file `assetId` khi phù hợp.

Tài liệu chính thức: [Node.js .env](https://nodejs.org/api/process.html#processloadenvfilepath), [MongoDB connection options](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/), [Atlas connection strings](https://www.mongodb.com/docs/atlas/connect-your-application/).
