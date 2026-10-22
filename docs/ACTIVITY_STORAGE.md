# Lưu lịch sử tác vụ và nội dung

Agent lưu dữ liệu mặc định tại `data/agent/` (không đưa vào Git). Đặt `LOCAL_AGENT_DATA_DIR` thành đường dẫn tuyệt đối trước khi chạy `node local-agent.js` để dùng thư mục khác. Một thư mục dữ liệu chỉ dùng cho một agent đang chạy. Giữ thư mục này khi nâng cấp; sao lưu cả thư mục để giữ lịch sử và ánh xạ URL → file. File video vẫn ở thư mục download, không sao chép vào kho metadata.

## Lịch sử từng lượt

`runs/<executionId>.json` lưu tên kịch bản, profile, tổng bước, vị trí hiện tại, thời gian bắt đầu/kết thúc và kết quả từng bước. `steps[].index` từ 0; `number` và `stoppedAtStep` từ 1. Ví dụ job 6 bước lỗi ở bước 6: `state: "failed"`, `stoppedAtStep: 6`, các bước 1–5 là `succeeded`, bước 6 là `failed` cùng lỗi và thời gian. Bước chưa thực hiện giữ `pending`. Dừng thủ công ghi `cancelled`; khi khởi động lại sau khi tiến trình bị ngắt, lượt/bước đang chạy chuyển thành `interrupted`, không tự chạy tiếp hoặc upload lại.

Dashboard hiển thị kết quả các bước trong lượt hiện tại. Nút **Xem / làm mới lịch sử profile** lấy tối đa 50 lượt gần nhất của profile đang chọn; mở từng dòng để xem chi tiết. Lịch sử không tự xóa khi quá 200 lượt: RAM chỉ giữ 200 lượt gần nhất, lượt cũ đọc từ đĩa theo ID. Không có chính sách tự xóa video/lịch sử.

- Dashboard API: `GET /api/history?profile=Profile%202`, `GET /api/history/<UUID>`; dùng cùng xác thực như các API dashboard khác.
- API v1: `GET /api/v1/runs?profile=Profile%202`, `GET /api/v1/runs/<UUID>`; cần Bearer token. Bỏ `profile` ở API v1 để xem tất cả profile.
- CLI cũ vẫn dùng `node local-agent.js status --run-id UUID` để xem lượt cũ sau restart.

Lịch sử lưu URL đã resolve, đường dẫn file, hash asset, thời gian, lỗi và URL trước/sau thao tác trình duyệt. Extension 4.1.0 cung cấp URL tab thực tế. Agent/extension cũ không cung cấp URL sẽ dùng URL `openUrl` gần nhất làm phương án dự phòng.

## URL đã tải

Trước khi gọi yt-dlp/FFmpeg hay truy cập nguồn, agent tra URL trong `catalog.json`, kiểm tra file tồn tại, kích thước và SHA-256 của toàn bộ bytes. Nếu còn đúng bản đã xác minh, trả `download.reused: true`, thông báo **Đã tải URL này; sử dụng file đã lưu**, đặt lại bốn biến runtime `download_*` bằng kết quả đã lưu rồi tiếp tục workflow. Đường dẫn gốc được dùng kể cả khi lần chạy mới chọn thư mục download khác. Cache được dùng chung giữa profile và giữ qua restart; các biến runtime vẫn riêng từng lượt.

Nếu file mất hoặc đổi nội dung/kích thước, tải mới và cập nhật ánh xạ; không ghi đè file cũ. File tải mới vẫn qua gate yt-dlp exit/after_move/stat/FFprobe. Hash của cache chứng minh file không đổi so với bản đã qua gate này; không cần liên hệ website hoặc FFprobe lại. Upload kiểm tra/hash lại file trước khi gửi cho extension. Các yêu cầu đồng thời cùng URL trong một agent xếp hàng: yêu cầu sau dùng kết quả trước nếu thành công. Stop/timeout hủy việc chờ và không cho workflow tiến tiếp.

Chuẩn hóa URL bằng HTTP URL parser: chuẩn hóa host/cổng mặc định, bỏ fragment `#...`, giữ nguyên query và thứ tự tham số để không gộp nhầm URL tài nguyên. Không nhận diện cùng video qua các URL rút gọn/alias khác nhau. Các clip tải trước khi có kho này chưa có ánh xạ URL; lần đầu sau nâng cấp vẫn tải để tạo bản ghi đáng tin cậy. Không suy đoán clip theo tên file.

## Page và thời gian upload

Các trường mới của action `upload` đều tùy chọn và nhận `{{variables}}`. Với workflow mới, nên điền thông tin page rõ ràng:

```json
{
  "variables": {
    "page_name": "Lili",
    "page_url": "https://www.facebook.com/profile.php?id=YOUR_FACEBOOK_PAGE_ID&sk=reels_tab",
    "page_uuid": "UUID-PAGE-TRONG-CONTENT-MANAGER"
  },
  "steps": [
    {
      "action": "upload",
      "selector": "#upload",
      "filePath": "D:\\Videos\\clip.mp4",
      "pageId": "{{page_uuid}}",
      "pageName": "{{page_name}}",
      "pageUrl": "{{page_url}}",
      "platform": "Facebook",
      "publicationDesc": "Mô tả nội dung",
      "folderTag": "marketing"
    }
  ]
}
```

Thay UUID mẫu bằng UUID thật, hoặc bỏ `pageId` nếu tạo page mới. `pageId` là UUID của collection `pages`, **không phải ID số của Facebook**. Với chuỗi download → upload, dùng `filePath: "{{download_file_path}}"` và `publicationDesc: "{{download_title}}"` như các tham chiếu runtime hiện có.

`pageUrl` chỉ rõ page đích ngay cả khi URL tab là màn hình composer. Nếu bỏ thông tin page, agent dùng URL tab tại lúc upload; nếu không có URL, sự kiện vẫn lưu với `page_id: null` và không tạo publication. Khi không có `pageName`, URL đích là tên dự phòng. `platform` mặc định Facebook cho host facebook.com; host khác dùng hostname. Không thể suy ra chắc chắn tên/ID page từ một màn hình composer chung, nên cần điền tên/URL page thật. Các URL khác nhau không tự được gộp thành cùng page.

Thành công của upload được ghi sau acknowledgement và `completion` nếu được cấu hình. `upload_events.uploaded_at` là thời điểm agent nhận hoàn tất thao tác upload, có thể chỉ là chọn file nếu thiếu điều kiện website đã xử lý xong. `publications.published_at` luôn `null`, `post_url` rỗng vì thao tác upload chưa chứng minh bài đã được xuất bản. Không lấy ngày upload/import thay cho ngày đăng. Các bước click/Đăng sau đó vẫn có lịch sử riêng; hiện chưa có cơ chế tự thu thập permalink hoặc xác nhận `published_at`.

## Mô hình theo Team Content Manager

`catalog.json` giữ collections metadata chuẩn và outbox đồng bộ:

| Collection | Quy tắc |
| --- | --- |
| `assets` | ID SHA-256 toàn bộ bytes, size byte, duration giây hoặc null; metadata chỉ tạo lần đầu |
| `folders` | UUID v5 từ machine UUID, đường dẫn root chuẩn hóa theo OS, tag |
| `file_instances` | UUID v5 trong namespace folder từ relative path + `:` + hash; giữ imported_at lần đầu |
| `pages` | UUID v4 cho page mới hoặc UUID truyền vào; name/platform trim, key dùng Unicode casefold tương ứng Python |
| `publications` | UUID v5 từ JSON array [hash, page UUID, ngày đăng hoặc rỗng, post URL]; upload chưa đăng dùng hai chuỗi rỗng cuối |
| `upload_events` | Phần mở rộng: một sự kiện theo run UUID + step index, thời gian upload, URL page đích và URL tab thật |
| `workflow_runs` | Trong MongoDB: trạng thái và chi tiết các bước, cùng execution ID local |

`machine_id.txt` chứa UUID v4 riêng cho máy. Không sao chép machine ID sang máy độc lập. JSON tạo UUID v5 dùng đúng dấu phân cách mặc định Python (dấu phẩy + khoảng trắng). `file_instances.relative_path` dùng `/`; mỗi file hiện được nhập với root là thư mục cha chứa nó. Không thêm trường join/UI vào file_instances, không thêm storage S3 hoặc lưu credentials/URL tải ký tạm thời trong asset.

Retry cùng asset/page khi chưa biết ngày/URL bài đăng dùng cùng publication ID; mô tả publication đã có không bị ghi đè. Mỗi lượt upload vẫn có `upload_events` riêng. File chưa upload có asset/file instance nhưng chưa có publication nên có thể chưa xuất hiện trong catalog Content Manager vốn chỉ trả file có publication.

## MongoDB tùy chọn

```powershell
$env:MONGODB_URI = 'mongodb://127.0.0.1:27017'
$env:MONGODB_DATABASE = 'team_content'
node local-agent.js
```

Không có URI: mọi chức năng lịch sử/cache vẫn chạy bằng kho local. Có URI: mỗi 5 giây đồng bộ outbox vào database (mặc định `team_content`), tạo các index theo hợp đồng. Thời gian JSON local dùng ISO UTC; khi ghi MongoDB đổi thành BSON Date, kể cả ngày trong steps/upload_events. API giữ `startedAt`/`endedAt` Unix milliseconds để tương thích client cũ.

Asset, page, publication và upload event dùng `$setOnInsert` để retry không ghi đè dữ liệu nghiệp vụ đã có; file instance chỉ giữ `imported_at` lần đầu. Đồng bộ không dùng transaction nhiều collection: lỗi giữa chừng giữ bản ghi còn lại để retry. Trạng thái workflow được cập nhật theo lượt.

Nếu page đã tồn tại trong database, nhập đúng `pageId` để dùng chung. Trùng platform/name nhưng khác UUID báo `PAGE_ID_CONFLICT`; page inactive báo `PAGE_INACTIVE`. Đồng bộ dừng ở lỗi này để không tạo publication tham chiếu sai page; dữ liệu local vẫn giữ, sửa cấu hình page trước các lượt tiếp theo và xử lý bản ghi xung đột trong kho local trước khi retry. Lỗi mạng giữ outbox bền vững, thử lại tự động sau 5 giây và sau restart. Dashboard hiển thị lỗi cùng số metadata chờ đồng bộ. Chưa có đối soát/xóa bản ghi local tự động khi người dùng sửa/xóa dữ liệu từ ứng dụng khác.

MongoDB chưa được cấu hình trên máy triển khai thì chưa thể kiểm chứng ghi vào database thật; kiểm thử tự động dùng adapter giả lập để kiểm tra Date, upsert và retry. Xem tài liệu chính thức về [upsert](https://www.mongodb.com/docs/drivers/node/current/crud/update/) và [$setOnInsert](https://www.mongodb.com/docs/v8.0/reference/operator/update/setoninsert/).
