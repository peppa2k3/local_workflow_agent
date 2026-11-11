# Ba ứng dụng triển khai độc lập

Gom source và công cụ local vào local-workflow-agent, extension độc lập,
control-server chứa deploy/server. Mỗi app chạy được khi copy riêng, không
import source app bên cạnh. Giữ launcher cũ và tương thích dữ liệu/config
gốc đang dùng; không di chuyển kho runtime đang có thể được process ghi.
Kiểm chứng bằng cây tạm chỉ chứa một app, npm test và node --check.

Hoàn tất source layout. Standalone local/server, legacy launcher/path, protocol
parity và ZIP whitelist pass. Toàn bộ npm test pass; migration fixture pass
(busy port, collision preflight, giữ nguyên bytes config/identity/tools/scenario).
Agent thật còn chạy trên cổng 34719 nên kho runtime gốc không bị move; chỉ migrate
sau khi dừng process. Không deploy VPS, cài Scheduled Task hay dùng profile thật.

Compose config validate pass. Docker daemon trên máy không hoạt động nên không
build image; source server độc lập đã chạy và được kiểm tra HTTP trong fixture.
