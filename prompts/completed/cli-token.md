# CLI không nhận token

- Tái hiện: chạy `node .\local-agent.js profiles` hoặc `describe` khi
  `LOCAL_AGENT_API_TOKEN` chưa có trong shell và `.env`.
- Nguyên nhân: CLI/API yêu cầu token, còn `.env` chưa có biến token; agent cũ
  cũng phải được khởi động lại sau khi thêm token.
- Khắc phục: tạo token ngẫu nhiên trong `.env` (file bị ignore), khởi động lại
  agent bằng `node .\local-agent.js --daemon`.
- Xác minh: `profiles` trả về 4 profile và `describe` trả về scenario
  `download-upload-reels-liliphim` với 6 bước.
