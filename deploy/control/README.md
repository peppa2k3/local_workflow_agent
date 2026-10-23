# Build Docker Hub và deploy VPS qua Traefik

Luồng triển khai: **máy build → Docker Hub → VPS pull image → Traefik HTTPS → control**.
VPS chỉ cần Docker Engine/Compose, file `docker-compose.yml` và `.env`; không cần
checkout mã nguồn, cài Node hay cài nginx. Traefik hiện có chịu trách nhiệm TLS.

## 1. Các file và biến cần chuẩn bị

| File | Dùng ở đâu | Vai trò |
| --- | --- | --- |
| `deploy/control/Dockerfile` | Máy build | Image Node 24, chỉ đóng gói ứng dụng control |
| `scripts/publish-control-image.ps1` | Máy Windows | Build local hoặc build/push Docker Hub |
| `deploy/control/docker-compose.yml` | VPS | Pull image, volume SQLite, network và labels Traefik |
| `deploy/control/.env.example` → `.env` | Cùng thư mục Compose trên VPS | Image, domain và cấu hình Traefik |
| `.env` tại gốc project local | Máy chạy Chrome | MongoDB và cấu hình local hiện có |
| `.env.control.example` → `.env.control` | Chỉ khi chạy control trực tiếp bằng Node | Không dùng cho bộ Compose Traefik này |

Không sao chép `.env` ở gốc project local sang VPS. Dockerfile chỉ COPY ứng dụng
control; `Dockerfile.dockerignore` giới hạn cả nội dung gửi tới builder, không đưa
scenario, dữ liệu, thông tin MongoDB hay Chrome profile vào build context.

Các giá trị `your-dockerhub-user`, `control.example.com`, `traefik-public`,
`letsencrypt` và `172.20.0.2` trong mẫu phải thay bằng thông tin thực tế.

## 2. Build và push từ máy Windows

Tại gốc repository, dùng Docker Desktop ở chế độ Linux containers. Tạo repository
`local-agent-control` trên Docker Hub trong namespace của bạn, rồi đăng nhập:

```powershell
docker login
# Thay mydockeruser bằng Docker Hub username hoặc organization thực tế.
# Build trước trên máy local; chưa push:
powershell -NoProfile -File scripts/publish-control-image.ps1 -Repository mydockeruser/local-agent-control -Tag 1.0.0
# Build và push image lên Docker Hub:
powershell -NoProfile -File scripts/publish-control-image.ps1 -Repository mydockeruser/local-agent-control -Tag 1.0.0 -Push
```

Script dừng nếu build/push lỗi. Mặc định build `linux/amd64`. VPS ARM64 dùng
`-Platforms linux/arm64`; muốn một tag hỗ trợ cả hai kiến trúc:

```powershell
# Tạo builder này một lần; nếu đã có, dùng docker buildx use control-builder.
docker buildx create --name control-builder --driver docker-container --use
docker buildx inspect --bootstrap
powershell -NoProfile -File scripts/publish-control-image.ps1 -Repository mydockeruser/local-agent-control -Tag 1.0.0 -Platforms "linux/amd64,linux/arm64" -Push
docker buildx imagetools inspect mydockeruser/local-agent-control:1.0.0
```

Nếu build trên Linux, chạy ở gốc repository:

```bash
docker login
docker buildx build --platform linux/amd64 \
  -f deploy/control/Dockerfile \
  --build-arg VERSION=1.0.0 \
  --build-arg REVISION="$(git rev-parse HEAD)" \
  -t mydockeruser/local-agent-control:1.0.0 --push .
```

Dùng tag phiên bản mới cho mỗi bản phát hành, tránh ghi đè tag đã deploy. Không
đưa mật khẩu Docker Hub vào file `.env`; `docker login` quản lý xác thực riêng.

## 3. Xác định cấu hình Traefik trên VPS

Traefik cần bật Docker provider và đang nối vào một Docker network có thể dùng
chung. Xem tên container/network/IP thực tế:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}'
docker network ls
# Thay traefik bằng tên container proxy đang chạy:
docker inspect traefik --format '{{json .NetworkSettings.Networks}}'
```

Chọn network đã gắn với Traefik, ví dụ `traefik-public`. Lấy `IPAddress` của
**container Traefik trên network đó** cho `CONTROL_TRUSTED_PROXY_IPS`; không dùng
IP public của VPS hoặc IP của control. Ví dụ Traefik nằm tại `172.20.0.2`.
Nếu có nhiều proxy được tin cậy, phân cách các IP bằng dấu phẩy.

Nên đặt IP tĩnh cho Traefik trong Compose của chính Traefik trên subnet đang dùng.
Nếu IP đổi khi recreate Traefik, cập nhật `.env` của control và recreate control.
Ứng dụng chỉ tin các IP cụ thể, không chấp nhận `*` hoặc toàn bộ subnet/CIDR.

Kiểm tra tên HTTPS entrypoint và certificate resolver trong cấu hình Traefik:
`websecure` và `letsencrypt` chỉ là ví dụ. Nếu Traefik đã nạp sẵn chứng chỉ cho
domain (ví dụ wildcard), để `TRAEFIK_CERT_RESOLVER=` rỗng. Nếu dùng ACME, điền đúng
tên resolver đã cấu hình. Trỏ DNS của `CONTROL_DOMAIN` tới VPS và bảo đảm Traefik
có thể cấp/dùng chứng chỉ hợp lệ cho domain đó.

Compose dùng network external đã tồn tại; không tạo hoặc thay thế Traefik. HTTP
chuyển hướng sang HTTPS có thể tiếp tục dùng cấu hình entrypoint hiện có của bạn.
Không gắn middleware đăng nhập tương tác/BasicAuth lên toàn bộ domain control:
agent dùng các API `/device/*` với cơ chế xác thực riêng và không đi qua trang SSO.

## 4. Chuyển bộ deploy lên VPS và tạo `.env`

Từ máy có source (thay `user@VPS` bằng SSH đích của bạn):

```powershell
ssh user@VPS 'mkdir -p ~/local-agent-control'
scp deploy/control/docker-compose.yml deploy/control/.env.example user@VPS:~/local-agent-control/
```

Trên VPS:

```bash
cd ~/local-agent-control
cp .env.example .env
chmod 600 .env
nano .env
```

Ví dụ nội dung `.env` sau khi sửa (các giá trị bên dưới vẫn là minh họa):

```dotenv
COMPOSE_PROJECT_NAME=local-agent-control
CONTROL_IMAGE=mydockeruser/local-agent-control:1.0.0
CONTROL_DOMAIN=control.example.com
TRAEFIK_NETWORK=traefik-public
TRAEFIK_HTTPS_ENTRYPOINT=websecure
TRAEFIK_CERT_RESOLVER=letsencrypt
CONTROL_ROUTER=local-agent-control
CONTROL_TRUSTED_PROXY_IPS=172.20.0.2
CONTROL_VOLUME_NAME=local-agent-control-data
```

| Biến | Giá trị cần điền |
| --- | --- |
| `CONTROL_IMAGE` | Đúng repository và tag đã push; cũng có thể dùng `repo@sha256:...` |
| `CONTROL_DOMAIN` | Chỉ hostname, không thêm `https://`, dấu `/` hoặc đường dẫn |
| `TRAEFIK_NETWORK` | Tên Docker network thực tế mà Traefik đã tham gia |
| `TRAEFIK_HTTPS_ENTRYPOINT` | Tên HTTPS entrypoint hiện có |
| `TRAEFIK_CERT_RESOLVER` | Tên ACME resolver hiện có; rỗng nếu dùng chứng chỉ đã nạp |
| `CONTROL_ROUTER` | Tên router/service Traefik duy nhất để tránh trùng ứng dụng khác |
| `CONTROL_TRUSTED_PROXY_IPS` | IP nội bộ chính xác của Traefik trên network chung |
| `CONTROL_VOLUME_NAME` | Tên volume SQLite; giữ nguyên qua các lần cập nhật |
| `COMPOSE_PROJECT_NAME` | Tên project Compose; giữ ổn định cho bộ deploy này |

Compose tự đặt `CONTROL_PUBLIC_URL=https://${CONTROL_DOMAIN}`,
`CONTROL_BIND=0.0.0.0`, cổng 34800 và SQLite `/data/control.sqlite` trong container.
Không publish cổng lên host. Traefik chuyển HTTP trong network Docker tới container
và giữ nguyên Host; phía người dùng và agent truy cập HTTPS qua domain.

## 5. Pull image, tạo tài khoản và khởi động

Luôn chạy các lệnh dưới tại thư mục chứa `.env` và `docker-compose.yml` vừa chép.
Đặt rõ `-f docker-compose.yml` để không vô tình chọn file `compose.yaml` cũ.

```bash
docker compose --env-file .env -f docker-compose.yml config --quiet
# Chỉ cần đăng nhập ở VPS nếu repository là private hoặc registry yêu cầu:
docker login
docker compose --env-file .env -f docker-compose.yml pull

# Tạo tài khoản đầu tiên, mật khẩu ít nhất 12 ký tự. Chạy bằng Bash.
read -r -s -p 'Mật khẩu tài khoản mới: ' CONTROL_PASSWORD; printf '\n'
printf '%s' "$CONTROL_PASSWORD" | docker compose --env-file .env -f docker-compose.yml \
  run --rm -T --no-deps --label traefik.enable=false control \
  node remote-control.js user you@example.com
unset CONTROL_PASSWORD

docker compose --env-file .env -f docker-compose.yml up -d --no-build
docker compose --env-file .env -f docker-compose.yml ps
docker compose --env-file .env -f docker-compose.yml logs --tail=100 control
curl --fail https://control.example.com/health
```

Thay email và domain bằng giá trị của bạn. Chỉ chạy bootstrap một lần cho mỗi
tài khoản; tạo trùng email sẽ bị từ chối. Container bootstrap dùng cùng volume và
UID với dịch vụ, đồng thời tắt label Traefik để không trở thành backend tạm thời.

Healthcheck của image gọi `/health` qua loopback **với Host lấy từ
`CONTROL_PUBLIC_URL`**, nên vẫn hoạt động khi ứng dụng kiểm tra Host nghiêm ngặt.
`healthy` kiểm chứng server trong container; lệnh `curl` qua domain kiểm chứng
thêm Traefik/TLS. Docker restart policy khởi động lại khi tiến trình thoát; trạng
thái `unhealthy` tự nó không khiến Docker restart container.

Mở `https://control.example.com`, đăng nhập tài khoản đã tạo. Trên máy local chạy
`node local-agent.js --daemon`, mở `http://127.0.0.1:34719/remote`, cấp quyền và tạo
mã với đúng domain HTTPS. Nhập mã trên web VPS, quay về local xác nhận tài khoản.

## 6. Cập nhật, quay lại phiên bản và sao lưu

Build/push tag mới, ví dụ `1.0.1`, rồi đổi **chỉ** `CONTROL_IMAGE` trong `.env` VPS:

```bash
docker compose --env-file .env -f docker-compose.yml pull
docker compose --env-file .env -f docker-compose.yml up -d --no-build
docker compose --env-file .env -f docker-compose.yml ps
```

Nếu cần quay lại phiên bản trước, đổi image về tag cũ và chạy lại hai lệnh pull/up.
Giữ nguyên `CONTROL_VOLUME_NAME` để tài khoản/thiết bị/lệnh vẫn tồn tại. Chỉ chạy
một instance control dùng volume này. Không chạy `down -v` nếu cần giữ dữ liệu.
Khi có thay đổi schema ở phiên bản tương lai, kiểm tra hướng dẫn migration trước
khi rollback image.

Sao lưu SQLite cùng WAL/SHM khi server đã dừng (Bash trên VPS):

```bash
umask 077
mkdir -p backups
docker compose --env-file .env -f docker-compose.yml stop control
docker compose --env-file .env -f docker-compose.yml run --rm -T --no-deps \
  --label traefik.enable=false --entrypoint tar control \
  -czf - -C /data . > "backups/control-$(date +%Y%m%d-%H%M%S).tgz"
docker compose --env-file .env -f docker-compose.yml start control
```

Kiểm tra lệnh sao lưu thành công và file lưu trữ đọc được; bảo vệ bản sao như
thông tin đăng nhập. Máy local cần sao lưu nhật ký remote và activity riêng.

## 7. Xử lý lỗi thường gặp

| Triệu chứng | Kiểm tra |
| --- | --- |
| `network ... declared as external, but could not be found` | Sửa `TRAEFIK_NETWORK` theo network thật của Traefik |
| Traefik trả 404 | DNS/Host rule, Docker provider, `traefik.enable`, entrypoint, tên router có bị trùng |
| Traefik trả 502 | Cả hai container có chung network, app bind `0.0.0.0`, backend port 34800, log control |
| `Host not allowed` | `CONTROL_DOMAIN` phải khớp domain đang truy cập; không dùng IP public hoặc URL phụ |
| `Origin not allowed` khi đăng nhập | Truy cập đúng HTTPS domain đã cấu hình, không thêm path prefix |
| Chứng chỉ không hợp lệ | Tên resolver, DNS/ACME và cấu hình chứng chỉ của Traefik |
| Nhiều người bị giới hạn đăng nhập cùng lúc | Kiểm tra IP Traefik trong `CONTROL_TRUSTED_PROXY_IPS` có đổi không |
| `permission denied` khi pull | Đúng tên image/tag và `docker login` có quyền vào repository private |
| `no matching manifest` | Build/push đúng kiến trúc VPS (`amd64` hoặc `arm64`) |
| Tài khoản biến mất sau cập nhật | Kiểm tra đang gắn đúng volume cũ, đừng bootstrap vào volume mới để thay dữ liệu |

Bộ `compose.yaml` cũ dành cho host network/nginx và service systemd vẫn nằm trong
repository cho triển khai cũ. Với VPS Traefik, dùng riêng `docker-compose.yml`
theo hướng dẫn này.

Tham khảo chính thức: [labels Docker của Traefik](https://doc.traefik.io/traefik/reference/routing-configuration/other-providers/docker/),
[buildx build/push](https://docs.docker.com/reference/cli/docker/buildx/build/),
[biến môi trường Compose](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).
