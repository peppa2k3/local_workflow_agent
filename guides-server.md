# Chạy Control Server trên VPS

Các bước dưới dùng Bash trên Ubuntu, user SSH có quyền sudo, Docker Engine với Compose v2 và một domain có bản ghi A/AAAA trỏ đúng VPS. Mở cổng SSH của bạn và 80/443 cho reverse proxy. Nếu cần cài Docker, làm theo [hướng dẫn Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

## 1. Chuẩn bị thư mục và mã nguồn

Đăng nhập bằng user sẽ dùng để deploy. Cài Git và curl, cấp quyền Docker cho user rồi đăng xuất SSH và đăng nhập lại.

```bash
sudo apt-get update && sudo apt-get install -y git curl
sudo usermod -aG docker "$(id -un)"
sudo install -d -o "$(id -un)" -g "$(id -gn)" /opt/agent-local /opt/agent-local/releases
```

```bash
docker info >/dev/null && docker compose version
git clone https://github.com/peppa2k3/local_workflow_agent.git ~/local-workflow-src
cd ~/local-workflow-src
root=/opt/agent-local
test -e "$root/.env" || install -m 600 control-server/deploy/source.env.example "$root/.env"
nano "$root/.env"
```

## 2. Cấu hình env và HTTPS

Điền hostname thực tế vào `CONTROL_DOMAIN`, ví dụ `control.example.com`. Giữ tên project và volume ổn định qua các bản phát hành để giữ tài khoản, thiết bị và lịch sử trong SQLite.

```dotenv
CONTROL_DOMAIN=control.example.com
COMPOSE_PROJECT_NAME=local-agent-control
CONTROL_VOLUME_NAME=local-agent-control-data
```

Chọn proxy đang phục vụ domain trên VPS.

- **Traefik** cần Docker provider và mạng dùng chung. Chạy `docker inspect traefik --format '{{json .NetworkSettings.Networks}}'`. Trong env điền `TRAEFIK_NETWORK` theo tên mạng, `TRAEFIK_CONTAINER` theo tên container, `TRAEFIK_HTTPS_ENTRYPOINT` và `TRAEFIK_CERT_RESOLVER` theo cấu hình Traefik. Resolver có thể để trống khi đã nạp chứng chỉ. Script deploy tự lấy IP proxy trên mạng đó.
- **Nginx** dùng `TRAEFIK_NETWORK=` để trống. Cài Nginx, cấp chứng chỉ TLS cho domain, chép [server block mẫu](control-server/deploy/nginx.conf.example) vào `/etc/nginx/conf.d/local-agent-control.conf`, sửa hostname và đường dẫn certificate/key. Upstream là `127.0.0.1:34800`. Chạy `sudo nginx -t && sudo systemctl reload nginx`.

## 3. Build và khởi chạy

Từ checkout ở bước 1, chạy các lệnh sau. Nếu dùng Actions để chạy bước này, tiếp tục theo [hướng dẫn deploy](guides-deploy.md) rồi quay lại bước 4.

```bash
cd ~/local-workflow-src
root=/opt/agent-local
sha=$(git rev-parse HEAD)
release="$root/releases/$sha"
mkdir -p "$release"
set -o pipefail
git archive "$sha" control-server | tar -xf - --strip-components=1 -C "$release" &&
  bash "$release/deploy/deploy-container.sh" apply "$root" "$sha"
```

Script build container, kiểm tra health nội bộ rồi gọi HTTPS qua domain. Khi thành công, `/opt/agent-local/current` trỏ đến release mới. Khi lỗi, script thử khôi phục release trước nếu có. Nếu đang chuyển từ systemd, dừng instance cũ và sao lưu/chuyển SQLite cùng WAL/SHM vào volume trước lần chạy đầu.

## 4. Kiểm tra và tạo tài khoản đầu tiên

Thay domain và email dưới đây. Trong Bash trên VPS, chọn mật khẩu từ 12 ký tự.

```bash
curl --fail https://control.example.com/health
export APP_SOURCE_ROOT=$(readlink -f /opt/agent-local/current)
export RELEASE_TAG=$(basename "$APP_SOURCE_ROOT")
compose=(docker compose --project-directory /opt/agent-local --env-file /opt/agent-local/.env -f "$APP_SOURCE_ROOT/deploy/docker-compose.source.yml")
"${compose[@]}" ps
read -rsp 'Mật khẩu mới: ' password; echo
printf '%s' "$password" | "${compose[@]}" exec -T control node index.js user you@example.com
unset password
```

Đăng nhập tại `https://control.example.com` và ghép thiết bị theo [bước 6 của hướng dẫn local](guides-local.md#6-ghép-vps-nếu-cần-điều-khiển-từ-xa). Nếu HTTPS trả 502, xem log bằng `"${compose[@]}" logs --tail=100 control`, kiểm tra upstream Nginx hoặc mạng Traefik. Sau khi chỉnh env, chạy lại script `apply` cho release hiện hành. Sao lưu volume SQLite khi dịch vụ đã dừng để lấy cả database và WAL/SHM.

## VPS đang dùng image Docker Hub và Traefik

Với installation dùng `CONTROL_IMAGE`, cập nhật bằng một tag mới. Trong PowerShell tại `control-server/`, thay namespace, tag và kiến trúc tương ứng với VPS.

```powershell
docker login
.\scripts\publish-image.ps1 -Repository mydockeruser/local-agent-control -Tag 1.0.1 -Platforms linux/amd64 -Push
```

Trên VPS, dùng thư mục chứa [docker-compose.yml](control-server/deploy/docker-compose.yml) và `.env` theo [mẫu registry](control-server/deploy/.env.example). Đặt `CONTROL_IMAGE=mydockeruser/local-agent-control:1.0.1`, giữ nguyên domain, volume, network và IP proxy của installation. Chạy `docker login` nếu image private.

```bash
docker compose --env-file .env -f docker-compose.yml config --quiet
docker compose --env-file .env -f docker-compose.yml pull && docker compose --env-file .env -f docker-compose.yml up -d --no-build
docker compose --env-file .env -f docker-compose.yml ps
```

Kiểm tra `/health` qua domain. Khi cần trở lại bản trước, đổi `CONTROL_IMAGE` về tag cũ tương thích với database rồi chạy lại `pull` và `up`.
