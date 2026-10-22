# Blueprint dữ liệu — Team Content Manager

Ngày xuất: 2026-10-22. Tài liệu cục bộ, không commit.

## Phạm vi

Phần “Hiện tại” phản ánh `content_manager/repository.py`, `files.py` và `config.py`.
Phần “Đề xuất” là hợp đồng tích hợp để triển khai sau, chưa có trong ứng dụng.
Ứng dụng hiện chỉ lưu metadata lên MongoDB, không upload hoặc sao lưu file gốc và chưa có HTTP API.

## Hiện tại: kết nối và kiểu dữ liệu

- Database mặc định: `team_content`, cấu hình bằng `MONGODB_DATABASE`.
- Kết nối: `MONGODB_URI`. Không đưa URI hoặc mật khẩu thật vào tài liệu tích hợp.
- Các ID là string, không phải MongoDB ObjectId.
- Thời gian lưu BSON Date theo UTC. Các ví dụ JSON bên dưới biểu diễn bằng ISO 8601; bên ghi trực tiếp MongoDB phải chuyển thành Date, không lưu nguyên string.
- `size`: số byte; `duration`: số giây hoặc null.
- Trường `*_key` cho tên/platform dùng Python `str.casefold()`, không chỉ chuyển chữ thường.
- SQLite local chỉ là cache hash, không phải database nghiệp vụ dùng chung.
## Biến môi trường
- MONGODB_URI="mongodb+srv://xxxxxxx"
- MONGODB_DATABASE=team_content
## Hiện tại: quan hệ

```text
folders._id ─────── file_instances.folder_id
assets._id ──────── file_instances.sha256
assets._id ──────── publications.asset_id
pages._id ───────── publications.page_id
```

Một asset có thể có nhiều file instance và nhiều publication. Quan hệ được xử lý bằng code/query, không có foreign key cưỡng chế.

## Hiện tại: các collection

### pages

```json
{
  "_id": "<uuid-page>",
  "name": "Page Demo",
  "name_key": "page demo",
  "platform": "Facebook",
  "platform_key": "facebook",
  "url": "https://facebook.com/example",
  "active": true,
  "updated_at": "2026-10-22T03:00:00Z"
}
```

`name`, `platform` được trim và không được rỗng. `url` được trim, có thể rỗng.
ID page mới là UUID v4. Page ngừng sử dụng được đánh dấu `active=false`; import chỉ chấp nhận page đang active.

### folders

```json
{
  "_id": "<uuid-folder>",
  "name": "Videos",
  "tag": "marketing",
  "path": "D:\\Videos",
  "machine_id": "<uuid-machine>",
  "last_scanned_at": "2026-10-22T03:00:00Z"
}
```

`path` là đường dẫn local. `last_scanned_at` được ghi khi import metadata, không phải cứ quét local là cập nhật database.

### assets

```json
{
  "_id": "<sha256-64-ky-tu-hex-thuong>",
  "size": 10485760,
  "duration": 30.5,
  "created_at": "2026-10-22T03:00:00Z"
}
```

`_id` là SHA-256 của toàn bộ bytes file. Metadata asset chỉ được đặt khi insert bằng `$setOnInsert`.
File cùng nội dung dùng chung asset dù khác tên, folder hoặc máy.

### file_instances

```json
{
  "_id": "<uuid-file-instance>",
  "name": "video-demo.mp4",
  "name_key": "video-demo.mp4",
  "size": 10485760,
  "type": "mp4",
  "duration": 30.5,
  "sha256": "<sha256-64-ky-tu-hex-thuong>",
  "folder_id": "<uuid-folder>",
  "folder_tag": "marketing",
  "folder_name": "Videos",
  "relative_path": "campaign/video-demo.mp4",
  "path": "D:\\Videos\\campaign\\video-demo.mp4",
  "machine_id": "<uuid-machine>",
  "file_created_at": null,
  "file_modified_at": "2026-10-22T02:00:00Z",
  "last_seen_at": "2026-10-22T03:00:00Z",
  "imported_at": "2026-10-22T03:00:00Z"
}
```

`type` là đuôi file viết thường, bỏ dấu chấm; có thể rỗng. `relative_path` dùng dấu `/`.
`file_created_at` có thể null khi hệ điều hành không cung cấp thời gian tạo file.
`imported_at` chỉ đặt lần đầu; `last_seen_at` cập nhật mỗi lần import.
Bản ghi được giữ khi file local mất hoặc đổi nội dung; đây không phải danh sách tồn tại realtime.

### publications

```json
{
  "_id": "<uuid-publication>",
  "asset_id": "<sha256-64-ky-tu-hex-thuong>",
  "page_id": "<uuid-page>",
  "published_at": null,
  "post_url": "",
  "desc": "Nội dung chiến dịch",
  "created_at": "2026-10-22T03:00:00Z"
}
```

`published_at` là Date hoặc null; không thay bằng ngày import nếu không biết ngày đăng.
Khi sửa qua `edit_publication`, có thêm `updated_at`.
Import dùng `$setOnInsert`: retry không ghi đè mô tả của publication đã có.
Sửa ngày/URL không đổi `_id`; import lại theo ngày/URL đã sửa có thể tạo publication khác.

## Hiện tại: quy tắc ID chính xác

Mã Python tương đương với dự án:

```python
import json
import os
import uuid

folder_source = json.dumps(
    [machine_id, os.path.normcase(str(root.resolve())), tag.strip()],
    ensure_ascii=False,
)
folder_id = str(uuid.uuid5(uuid.NAMESPACE_URL, folder_source))

instance_id = str(uuid.uuid5(
    uuid.UUID(folder_id),
    relative_path_as_posix + ":" + sha256,
))

event_key = json.dumps(
    [sha256, page_id, published_at.isoformat() if published_at else "", post_url.strip()],
    ensure_ascii=False,
)
publication_id = str(uuid.uuid5(uuid.NAMESPACE_URL, event_key))
```

Giữ nguyên quy tắc serialize JSON mặc định của Python, kể cả khoảng trắng, nếu server khác cần tạo ID tương thích.
`datetime.isoformat()` phải giống biểu diễn của bên tạo ID ban đầu, kể cả offset và độ chính xác; hai chuỗi biểu diễn cùng một thời điểm vẫn có thể tạo ID khác.
Chuẩn hóa đường dẫn phụ thuộc hệ điều hành. Server khác không tự tính lại folder ID từ đường dẫn Windows theo quy tắc Linux.
Machine ID là UUID v4 lưu riêng trong `machine_id.txt`; không dùng chung machine ID cho các máy độc lập.

## Hiện tại: index

| Collection | Index | Unique |
|---|---|---|
| Tất cả | `_id` | Có, mặc định MongoDB |
| pages | `platform_key ASC, name_key ASC` | Có |
| file_instances | `sha256 ASC` | Không |
| file_instances | `name_key ASC, size ASC, type ASC` | Không |
| file_instances | `imported_at DESC, _id ASC` | Không |
| publications | `asset_id ASC` | Không |
| publications | `page_id ASC` | Không |

## Hiện tại: lưu và truy vấn

- Import thực hiện lần lượt: folder → asset → publications → file instance.
- Chưa dùng transaction nhiều collection; lỗi giữa chừng có thể lưu một phần. Retry cùng dữ liệu dùng upsert để hoàn tất.
- Import hiện yêu cầu mỗi dòng có ít nhất một page active và file local chưa thay đổi kể từ lúc quét.
- Catalog và check trùng chỉ trả các instance có publication liên quan.
- Trùng SHA-256 là trùng nội dung. Trùng tên/size/type nhưng khác SHA-256 là khác nội dung.
- Các trường query bổ sung `publications`, `publication_page_ids`, `page_docs`, `page_sort`, `pages`, `desc` là kết quả join/decorate, không phải trường được import vào file_instances.
- `fingerprint`, `selected`, `status`, `root`, `page_ids` thuộc dữ liệu quét/UI; không lưu nguyên object quét vào database.
- Cập nhật page và publication hiện theo giá trị ghi sau cùng, chưa có khóa phiên bản hoặc audit theo người dùng.

## Đề xuất: upload dùng chung nhiều server

MongoDB lưu metadata; file gốc đặt trong một kho object dùng chung. Đường dẫn local không phải địa chỉ download.
Mở rộng `assets` bằng trường `storage` tùy chọn để giữ tương thích bản ghi cũ:

```json
{
  "_id": "<sha256-64-ky-tu-hex-thuong>",
  "size": 10485760,
  "duration": 30.5,
  "created_at": "2026-10-22T03:00:00Z",
  "storage": {
    "provider": "s3",
    "bucket": "team-content",
    "key": "assets/<sha256-64-ky-tu-hex-thuong>",
    "content_type": "video/mp4",
    "status": "ready",
    "uploaded_at": "2026-10-22T03:00:00Z"
  }
}
```

Hợp đồng đề xuất:

- `storage` vắng mặt: bản ghi metadata cũ, chưa xác nhận có file chung.
- `status`: `uploading`, `ready` hoặc `failed`; chỉ cho tải khi `ready`.
- Object key được xác định từ SHA-256, không phụ thuộc tên file hoặc server.
- Server nhận upload tính và xác minh hash/size từ bytes thực tế trước khi ghi `ready`.
- Upload cùng hash phải có cơ chế ghi có điều kiện hoặc điều phối để các request đồng thời không ghi đè trạng thái/file đã hoàn tất.
- Chỉ cập nhật `storage` bằng thao tác riêng sau upload; code `$setOnInsert` hiện tại không tự cập nhật storage cho asset đã tồn tại.
- Không lưu URL ký tạm thời hoặc credential trong document; tạo URL tải khi được yêu cầu.
- Server upload thuần có thể không có file instance local. Cần API/query theo asset riêng vì catalog hiện xuất phát từ file_instances.
- Cần xác định quyền đọc/ghi và xác thực ở API hoặc ở từng tài khoản dịch vụ. Ứng dụng hiện chưa có phân quyền người dùng.

Luồng triển khai: nhận file → tính SHA-256 → kiểm tra asset/object → upload nếu thiếu → xác minh → cập nhật storage ready → ghi metadata/publication → trả asset ID.

Các endpoint, SDK kho object, cấu hình bucket và cơ chế upload đồng thời chưa được triển khai trong dự án này.
