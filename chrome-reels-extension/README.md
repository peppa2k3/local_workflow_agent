# Local Workflow Agent Bridge

Extension Chrome Manifest V3, chạy trong từng profile muốn kết nối với agent tại `http://127.0.0.1:34719`.

| File | Trách nhiệm |
| --- | --- |
| `manifest.json` | Metadata, quyền và điểm vào extension. |
| `background.js` | Poll agent, quản lý tab, điều hướng và Chrome Debugger. |
| `content.js` | Locator, thao tác DOM, picker, tương thích CSS selector cũ. |
| `options.html`, `options.js` | Chọn Chrome profile và cấu hình kết nối. |

Load unpacked bằng chính thư mục này. Hướng dẫn: [SETUP](../docs/SETUP.md).

## Đóng gói

Tại gốc repository trên Windows:

```powershell
npm run package:extension
```

Kết quả: `dist/chrome-reels-extension-<version>.zip`, với `manifest.json` ngay ở gốc ZIP. Script chỉ đưa năm file runtime trong bảng vào gói; README, source agent, cấu hình máy và khóa ký không nằm trong gói. Có thể chỉ định thư mục kết quả: `npm run package:extension -- -OutputDirectory D:\releases\bridge`.

Script không ghi đè bản ZIP đã có. Khi phát hành bản mới, cập nhật `version` trong manifest và kiểm tra extension. Nếu thêm asset mới, cập nhật danh sách file trong `scripts/package-extension.ps1` và test đóng gói. ZIP là artifact để upload thủ công; lệnh trên không tự gửi hoặc xuất bản lên Chrome Web Store.
