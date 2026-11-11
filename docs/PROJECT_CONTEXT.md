# Quy tắc bảo trì hiện hành

- Ba app độc lập: local engine, Chrome extension, control server HTTP. Chi tiết/lệnh: [README](README.md).
- Engine local điều phối duy nhất; VPS nhận/gửi metadata và lệnh qua outbound HTTP polling. Không dùng Socket.IO Corebase, không public cổng 34719.
- Giữ launcher gốc, URL dashboard, JSON scenario và CSS `selector` cũ.
- Standalone dùng config/scenarios/tools/data trong app. Checkout cũ fallback dữ liệu gốc; không move runtime khi agent chạy, không đổi machine ID tùy tiện.
- Hai bản `shared/remote-protocol.js` trong local/server phải đồng nhất; test layout kiểm tra.
- Workflow theo profile, chạy bước kế tiếp sau ack. Stop/timeout chặn bước sau; crash không tự replay. Command remote có journal; chưa rõ kết quả phải kiểm tra history trước khi gửi lại.
- Click mặc định `settleMs=0`, vẫn kiểm tra navigation/completion; type chỉ phục hồi locator/index khi xác định được một editor.
- Video mặc định `language=vi`, `quality=1080`; cache khớp tùy chọn và hash. FFprobe xác nhận file trước upload; không ghi đè clip cũ.
- Local lưu history/catalog/outbox; MongoDB lưu metadata, không chứa byte video. Media guard giữ pause/xác nhận local khi trùng.
- API v1 cần Bearer token, profile tường minh, scenario đã lưu. Dashboard/extension có xác thực riêng; không nhúng token vào extension.
- Không commit `.env`, credential, data, Chrome profile, node_modules, binary, `.pem`, `.crx`. Test Chrome riêng, không dùng profile đăng nhập.
- Khi đổi action: cập nhật executor, validation, UI, tài liệu và test. Chạy `npm test`, `node --check` JavaScript thay đổi, commit đúng phạm vi.
