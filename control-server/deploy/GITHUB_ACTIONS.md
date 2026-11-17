# Build/deploy control server bằng GitHub Actions

Workflow chỉ chuyển thư mục `control-server/` lên VPS. VPS build Docker image từ source release rồi chạy bằng Docker Compose. Source releases và file `.env` nằm dưới `/opt/agent-local`; engine local và Chrome extension không được đưa lên VPS.

Pull request chạy `npm test`. Push vào `main` chạy kiểm tra rồi deploy; có thể chạy lại ở **Actions → Deploy control server → Run workflow** trên nhánh `main`. VPS cần Docker Engine, Docker Compose v2 và Docker network Traefik đã có.

## 1. GitHub Environment

Vào **Settings → Environments → New environment**, tạo environment tên `production`. Thêm các mục sau vào environment:

| Loại | Tên | Giá trị |
| --- | --- | --- |
| Secret | `VPS_SSH_PRIVATE_KEY` | Private key SSH của user deploy, gồm cả dòng `BEGIN/END` |
| Secret | `VPS_SSH_KNOWN_HOSTS` | Host key VPS đã xác minh |
| Variable | `VPS_HOST` | Hostname hoặc IPv4 của VPS |
| Variable | `VPS_PORT` | SSH port, thường là `22` |
| Variable | `VPS_USER` | SSH user có quyền chạy Docker Compose |

Không đưa app `.env`, domain, Traefik IP hoặc cấu hình runtime vào GitHub. Các giá trị này nằm trong `/opt/agent-local/.env` trên VPS.

Tạo SSH key riêng, không có passphrase. Thêm public key vào `~deploy/.ssh/authorized_keys`; lưu private key vào `VPS_SSH_PRIVATE_KEY`. Lấy host key bằng `ssh-keyscan -p 22 your-vps-host`, xác minh fingerprint từ VPS qua kênh tin cậy rồi mới lưu kết quả vào `VPS_SSH_KNOWN_HOSTS`. Đổi port trong lệnh nếu SSH không dùng `22`.

## 2. Chuẩn bị VPS một lần

User SSH phải chạy được `docker compose` và ghi được vào `/opt/agent-local`. Thêm user vào group `docker` nếu cần, sau đó đăng nhập lại:

```bash
sudo usermod -aG docker deploy
```

Tạo thư mục source và đưa mẫu env lên VPS. Chạy `scp` từ checkout repo:

```bash
sudo install -d -o deploy -g deploy -m 0755 /opt/agent-local
sudo install -d -o deploy -g deploy -m 0755 /opt/agent-local/releases
scp -P 22 control-server/deploy/source.env.example deploy@your-vps-host:/opt/agent-local/.env
ssh -p 22 deploy@your-vps-host 'chmod 0600 /opt/agent-local/.env'
```

Sửa `/opt/agent-local/.env` trên VPS. Điền network và IP thật của Traefik; `CONTROL_DOMAIN` phải trùng domain HTTPS đang trỏ tới VPS:

```dotenv
COMPOSE_PROJECT_NAME=local-agent-control
CONTROL_DOMAIN=agent.dangngochai.io.vn
TRAEFIK_NETWORK=traefik-public
TRAEFIK_HTTPS_ENTRYPOINT=websecure
TRAEFIK_CERT_RESOLVER=letsencrypt
CONTROL_ROUTER=local-agent-control
CONTROL_TRUSTED_PROXY_IPS=172.20.0.2
CONTROL_VOLUME_NAME=local-agent-control-data
```

Network phải là Docker network external mà Traefik đang dùng. Lấy IP của container Traefik trên network đó bằng `docker inspect`; điền đúng IP, không điền CIDR hoặc `*`. Nếu certificate đã được cấu hình sẵn thay vì ACME resolver, để `TRAEFIK_CERT_RESOLVER=` rỗng. Giữ nguyên `CONTROL_VOLUME_NAME` giữa các lần deploy để giữ database SQLite.

Nếu VPS đang chạy bản cũ bằng systemd (`local-agent-control-source.service`), dừng service trước khi chuyển để không chạy hai server cùng lúc:

```bash
sudo systemctl disable --now local-agent-control-source.service
```

Nếu cần giữ database từ bản systemd, copy dữ liệu vào Docker volume trước lần deploy đầu tiên, sau khi đã dừng service. Bỏ qua bước này nếu đã có Docker volume chứa dữ liệu hoặc chưa có database cũ:

```bash
docker volume create local-agent-control-data
sudo docker run --rm --user 0 --entrypoint sh \
  -v local-agent-control-data:/data \
  -v /var/lib/local-agent-control:/source:ro \
  node:24-bookworm-slim -c 'for f in /source/control.sqlite*; do [ -e "$f" ] && cp -a "$f" /data/; done; chown -R node:node /data'
```

## 3. Deploy và cấu hình app

Push lên `main`. Workflow chuyển source của commit vào `/opt/agent-local/releases/<commit-sha>`. Script build image ngay trên VPS bằng Docker Compose, chờ health check container đạt rồi cập nhật symlink `/opt/agent-local/current`. Nếu container mới không khỏe, script thử khôi phục container từ release trước hoặc image đang chạy trước đó.

File `.env` ở `/opt/agent-local/.env` không bị ghi đè khi source được cập nhật. Compose tạo `CONTROL_PUBLIC_URL=https://<CONTROL_DOMAIN>`, cổng container `34800` và kết nối database qua volume. Traefik nhận traffic HTTPS; engine local kết nối tới domain này qua outbound polling. Không public cổng dashboard local `34719`.

Thay đổi `.env` không tự kích hoạt workflow. Sau khi sửa env, tạo lại container bằng release hiện tại:

```bash
source_dir="$(readlink -f /opt/agent-local/current)"
release_tag="$(basename "$source_dir")"
APP_SOURCE_ROOT="$source_dir" RELEASE_TAG="$release_tag" \
  docker compose --project-directory /opt/agent-local \
  --env-file /opt/agent-local/.env \
  -f "$source_dir/deploy/docker-compose.source.yml" \
  up -d --no-deps --force-recreate --no-build --wait --wait-timeout 180 control
```

Sau deploy đầu tiên, tạo tài khoản web qua container. Mật khẩu cần ít nhất 12 ký tự và được nhập tương tác:

```bash
source_dir="$(readlink -f /opt/agent-local/current)"
release_tag="$(basename "$source_dir")"
read -r -s -p 'Mật khẩu tài khoản: ' CONTROL_PASSWORD; printf '\n'
APP_SOURCE_ROOT="$source_dir" RELEASE_TAG="$release_tag" \
  docker compose --project-directory /opt/agent-local \
  --env-file /opt/agent-local/.env \
  -f "$source_dir/deploy/docker-compose.source.yml" \
  exec -T control node index.js user you@example.com <<< "$CONTROL_PASSWORD"
unset CONTROL_PASSWORD
```

## Gỡ lỗi

- Thiếu `VPS_*`: đặt secrets/variables trong Environment tên `production`.
- `docker compose` không tìm thấy: cài Docker Compose v2 và đăng nhập lại sau khi thêm user vào group `docker`.
- External network không tồn tại: sửa `TRAEFIK_NETWORK` theo network thật của Traefik.
- Build thành công nhưng health check lỗi, xem log service `control`:

  ```bash
  source_dir="$(readlink -f /opt/agent-local/current)"
  release_tag="$(basename "$source_dir")"
  APP_SOURCE_ROOT="$source_dir" RELEASE_TAG="$release_tag" \
    docker compose --project-directory /opt/agent-local \
    --env-file /opt/agent-local/.env \
    -f "$source_dir/deploy/docker-compose.source.yml" logs --tail=100 control
  ```

  Script giữ source release trước để có thể deploy lại.
- Workflow chỉ deploy ref `main`; khi chạy thủ công hãy chọn nhánh `main`.
