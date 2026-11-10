# Giao thức dùng chung

`remote-protocol.js` chứa validate, credential, JSON an toàn và HTTP client dùng bởi agent local và server remote. Chỉ dùng Node builtins; không import runtime, dashboard hoặc database của hai ứng dụng.

Giữ phần dùng chung này khi triển khai agent hoặc server. Mã tích hợp MongoDB/video/Chrome thuộc `local-workflow-agent/src/integrations/`; dữ liệu runtime thuộc `data/`, không phải source trong thư mục này.
