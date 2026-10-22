# 03 — Remote scenario execution

Agent heartbeat/outbound poll; metadata chỉ scenario/profile được cấp quyền.
Queue bền vững, command UUID/idempotency, deadline; journal local trước side effect,
ID execution ổn định và reconcile sau restart; không replay lượt không rõ kết quả.
Chỉ chạy JSON đã lưu; biến override phải được local cho phép rõ từng tên. Stop chỉ
đụng lượt remote sở hữu. Ghi tiến độ/kết quả; thu hồi dừng remote job.
Phụ thuộc 02. Test fake workflow, reconnect, lỗi, quyền, duplicate và restart.
