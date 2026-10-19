# Chuyển IDM sang yt-dlp + FFmpeg

Yêu cầu: quay về nền trước IDM và tích hợp tải/lưu video URL, phân tích tên. Nền: 44b8e0d. Đảo ngược a6549d0, 013e628, adc9b23, giữ lịch sử. Giữ file người dùng chưa theo dõi scenarios/idm-video-2.json.

Thêm action downloadVideo, API metadata, dashboard và scenario mẫu. Kiểm chứng bằng npm test, node --check và tải video cục bộ bằng công cụ thật khi tools đã cài. Không dùng profile đăng nhập.

Kiểm chứng thực tế 2026-10-19: tải video HTTP cục bộ, tải lại không ghi đè, ghép DASH hai luồng bằng FFmpeg; FFprobe xác nhận hình + tiếng. Dashboard kiểm tra phân tích URL với biến, tên Unicode và tải khi extension offline. URL YouTube 9qq_Fqp2rnM phân tích được title/ID/duration; chưa tải toàn bộ video YouTube (7768 giây).
