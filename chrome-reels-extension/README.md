# Local Workflow Agent Bridge

Extension Chrome Manifest V3, chạy trong từng profile muốn kết nối với agent tại `http://127.0.0.1:34719`.

| File | Trách nhiệm |
| --- | --- |
| `manifest.json` | Metadata, quyền và điểm vào extension. |
| `background.js` | Poll agent, quản lý tab, điều hướng và Chrome Debugger. |
| `content.js` | Locator, thao tác DOM, picker, tương thích CSS selector cũ. |
| `options.html`, `options.js` | Chọn Chrome profile và cấu hình kết nối. |

Load unpacked bằng chính thư mục này. Hướng dẫn: [SETUP](../local-workflow-agent/docs/SETUP.md).

Thư mục này triển khai độc lập. Đóng ZIP ngay tại đây bằng `powershell -NoProfile -ExecutionPolicy Bypass -File package.ps1`; kết quả trong `dist/`. Chỉ năm file runtime được đóng gói, không chứa script/README/token. Script không tự publish Chrome Web Store. Khi chạy `npm run package:extension` ở gốc repo, wrapper vẫn xuất ZIP vào `dist/` ở gốc để tương thích.

Bản 4.2.2 sửa timeout sau click trên trang có video/progress cập nhật DOM liên
tục. Click mặc định không chờ DOM đứng yên (`settleMs: 0`), vẫn chờ tải trang và
completion đã chỉ định. Nút vẫn tồn tại sau click không bị coi là thất bại.
Restart engine, Reload extension và refresh dashboard sau nâng cấp.

Bản này cũng sửa `type` khi index cũ không còn sau khi dialog mở/duplicate ẩn:
chỉ tự phục hồi nếu locator ngữ nghĩa khớp đúng một editor. Editor bị thay sau
click được tìm lại theo locator/tên truy cập và focus trước khi nhập; nhiều ô
khớp khác nhau vẫn báo lỗi để tránh nhập nhầm.

Bản 4.2.1 sửa discovery profile khi engine có API token: Options dùng POST
chỉ đọc để Chrome gửi Origin extension, không yêu cầu nhập token vào extension.
Sau nâng cấp cần restart workflow engine, Reload extension rồi mở lại Options.

Test với extension thật trên profile trình duyệt tách biệt (máy phát triển):

```powershell
npm ci
npx playwright install chromium
npm run test:extension
```

## Đóng gói

Tại gốc repository trên Windows:

```powershell
npm run package:extension
```

Kết quả: `dist/chrome-reels-extension-<version>.zip`, với `manifest.json` ngay ở gốc ZIP. Script chỉ đưa năm file runtime trong bảng vào gói; README, source agent, cấu hình máy và khóa ký không nằm trong gói. Có thể chỉ định thư mục kết quả: `npm run package:extension -- -OutputDirectory D:\releases\bridge`.

Script không ghi đè bản ZIP đã có. Khi phát hành bản mới, cập nhật `version` trong manifest và kiểm tra extension. Nếu thêm asset mới, cập nhật danh sách file trong `scripts/package-extension.ps1` và test đóng gói. ZIP là artifact để upload thủ công; lệnh trên không tự gửi hoặc xuất bản lên Chrome Web Store.
# Tùy chọn tải video

Ngôn ngữ audio và độ phân giải được chọn tại dashboard, xử lý bằng yt-dlp trong agent local. Mặc định tiếng Việt / Full HD 1080p; không cần quyền Chrome mới. Nếu nguồn không có audio tiếng Việt thì dùng audio có sẵn, không tự dịch. Khởi động lại agent và refresh dashboard sau khi cập nhật.
