# 02 — Account and mutual pairing

Thêm VPS entry, CLI tạo tài khoản, password scrypt, cookie/session/CSRF, giới hạn
đăng nhập. Local tạo code; tài khoản nhận code; local xem và đồng ý chính xác tài
khoản đó mới cấp device credential. Hết hạn, revoke, kiểm tra ownership mọi API.
Local approval bắt buộc dashboard session. Test không ghép được khi thiếu một phía.
Phụ thuộc 01. Không dùng tài khoản/thiết bị thật.

Hoàn tất: tests/remote-pairing.js kiểm chứng HTTP fixture cho login/session/CSRF, hai đồng ý, retry approval, ownership, revoke. JavaScript syntax đạt. UI theo task 04.
