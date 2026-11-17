# Build và deploy control server bằng GitHub Actions

Workflow chỉ chuyển source trong `control-server/` lên VPS, build Docker image ngay trên VPS, rồi chạy container. Source release, file env và cấu hình deploy nằm dưới `/opt/agent-local`. `local-workflow-agent/` và `chrome-reels-extension/` tiếp tục chạy trên máy local.

Container dùng host network nhưng chỉ bind vào `127.0.0.1:34800`. Nginx cài trên VPS nhận HTTPS và proxy tới cổng loopback này. Luồng deploy không cần Docker network external hoặc Traefik.

## 1. Cấu hình GitHub Actions

Trong repository, vào **Settings → Environments**, tạo environment tên `production`. Thêm các giá trị sau:

| Loại | Tên | Giá trị |
| --- | --- | --- |
| Secret | `VPS_SSH_PRIVATE_KEY` | Private SSH key của user deploy, gồm cả dòng BEGIN/END |
| Secret | `VPS_SSH_KNOWN_HOSTS` | Host key đã xác minh của VPS |
| Variable | `VPS_HOST` | Hostname hoặc IPv4 của VPS |
| Variable | `VPS_PORT` | SSH port, thường là `22` |
| Variable | `VPS_USER` | SSH user có quyền chạy Docker Compose và ghi vào `/opt/agent-local` |

Không lưu app env, domain hoặc password ứng dụng trong GitHub. Các cấu hình deploy được lưu trên VPS tại `/opt/agent-local/.env`.

Tạo SSH key riêng cho deploy. Thêm public key vào `~deploy/.ssh/authorized_keys`, lưu private key trong secret `VPS_SSH_PRIVATE_KEY`. Lấy host key bằng `ssh-keyscan -p 22 your-vps-host`, xác minh fingerprint qua kênh tin cậy trước khi lưu kết quả vào `VPS_SSH_KNOWN_HOSTS`.

Pull request chạy CI. Push vào `main` sẽ deploy; có thể chạy thủ công tại **Actions → Deploy control server → Run workflow**.

## 2. Chuẩn bị VPS và env

VPS cần Docker Engine, Docker Compose v2, Nginx và domain đã trỏ DNS về VPS. Nếu chưa có Nginx, cài bằng `sudo apt-get update && sudo apt-get install -y nginx`. Mở cổng inbound 80/443; cổng 34800 chỉ dùng loopback, không mở trên firewall. Cần có TLS certificate hợp lệ cho domain trước khi bật server block HTTPS. User SSH phải có quyền Docker:

```bash
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy -m 0755 /opt/agent-local
sudo install -d -o deploy -g deploy -m 0755 /opt/agent-local/releases
```

Đăng xuất rồi SSH lại sau khi thêm user vào group `docker`. Chép mẫu env từ máy có source:

```powershell
scp -P 22 control-server/deploy/source.env.example deploy@your-vps-host:/opt/agent-local/.env
ssh -p 22 deploy@your-vps-host 'chmod 0600 /opt/agent-local/.env'
```

Sửa `/opt/agent-local/.env` trên VPS:

```dotenv
COMPOSE_PROJECT_NAME=local-agent-control
CONTROL_DOMAIN=agent.example.com
CONTROL_VOLUME_NAME=local-agent-control-data
```

Đổi `CONTROL_DOMAIN` thành hostname HTTPS thật. Giữ nguyên `COMPOSE_PROJECT_NAME` và `CONTROL_VOLUME_NAME` qua các lần deploy để Compose tiếp tục quản lý đúng service và SQLite volume. File này chứa giá trị để Compose dựng URL/domain và đặt volume; các biến runtime còn lại được khai báo trong Compose.

## 3. Cấu hình HTTPS proxy trên VPS

Nginx phải proxy HTTPS tới `http://127.0.0.1:34800`. Mẫu cấu hình nằm ở [nginx.conf.example](nginx.conf.example). Chép mẫu lên VPS, thay `control.example.com` bằng `CONTROL_DOMAIN`, rồi kiểm tra certificate path:

```powershell
scp -P 22 control-server/deploy/nginx.conf.example deploy@your-vps-host:/tmp/local-agent-control.nginx
```

Trên VPS, đặt file vào cấu hình Nginx đang dùng, sửa domain và certificate paths, sau đó:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Certificate phải hợp lệ cho domain và tồn tại ở các đường dẫn trong cấu hình. Nếu VPS đã có Nginx, chỉ thêm server block phù hợp; không tạo cấu hình trùng domain. Mẫu proxy ghi đè `X-Forwarded-For` bằng địa chỉ client do Nginx nhận được. Ứng dụng chỉ tin proxy loopback này.

## 4. Deploy và dữ liệu

Khi workflow chạy, nó tải release vào `/opt/agent-local/releases/<commit-sha>`, build image tại VPS, chạy health check rồi cập nhật symlink `/opt/agent-local/current`. Nếu container mới không khỏe, script thử khôi phục release/image trước. `.env` và volume SQLite không bị thay thế khi upload source.

Nếu VPS đang chạy bản cũ bằng systemd, dừng service trước lần deploy container đầu tiên để tránh chiếm cổng:

```bash
sudo systemctl disable --now local-agent-control-source.service
```

Giữ nguyên volume `local-agent-control-data` để giữ tài khoản và thiết bị. Nếu dữ liệu SQLite cũ đang nằm ở `/var/lib/local-agent-control`, sao chép vào volume trước deploy:

```bash
docker volume create local-agent-control-data
sudo docker run --rm --user 0 --entrypoint sh \
  -v local-agent-control-data:/data \
  -v /var/lib/local-agent-control:/source:ro \
  node:24-bookworm-slim -c 'for f in /source/control.sqlite*; do [ -e "$f" ] && cp -a "$f" /data/; done; chown -R node:node /data'
```

Sau deploy, kiểm tra container và endpoint:

```bash
docker ps --filter name=local-agent-control
curl --fail https://agent.example.com/health
```

Đổi domain trong lệnh curl theo `CONTROL_DOMAIN`. Tạo tài khoản đầu tiên trong container đang chạy:

```bash
source_dir="$(readlink -f /opt/agent-local/current)"
release_tag="$(basename "$source_dir")"
read -r -s -p 'Mật khẩu tài khoản mới: ' CONTROL_PASSWORD; printf '\n'
APP_SOURCE_ROOT="$source_dir" RELEASE_TAG="$release_tag" \
  docker compose --project-directory /opt/agent-local \
  --env-file /opt/agent-local/.env \
  -f "$source_dir/deploy/docker-compose.source.yml" \
  exec -T control node index.js user you@example.com <<< "$CONTROL_PASSWORD"
unset CONTROL_PASSWORD
```

## 5. Thay đổi env, log và khắc phục lỗi

Sau khi sửa `/opt/agent-local/.env`, recreate container từ release hiện tại:

```bash
source_dir="$(readlink -f /opt/agent-local/current)"
release_tag="$(basename "$source_dir")"
APP_SOURCE_ROOT="$source_dir" RELEASE_TAG="$release_tag" \
  docker compose --project-directory /opt/agent-local \
  --env-file /opt/agent-local/.env \
  -f "$source_dir/deploy/docker-compose.source.yml" \
  up -d --no-deps --force-recreate --no-build --wait --wait-timeout 180 control
```

Xem log container:

```bash
source_dir="$(readlink -f /opt/agent-local/current)"
release_tag="$(basename "$source_dir")"
APP_SOURCE_ROOT="$source_dir" RELEASE_TAG="$release_tag" \
  docker compose --project-directory /opt/agent-local \
  --env-file /opt/agent-local/.env \
  -f "$source_dir/deploy/docker-compose.source.yml" logs --tail=100 control
```

| Lỗi | Kiểm tra |
| --- | --- |
| `network traefik-public ... could not be found` | Nếu log này xuất hiện, VPS đang chạy Compose cũ. Chạy lại workflow từ commit có `network_mode: host`; cấu hình mới không khai báo network Traefik. |
| Cổng 34800 đã được dùng | Dừng service/container control cũ; chỉ để một instance dùng cổng này. |
| Health check thất bại | Xem log control, kiểm tra Docker daemon và quyền truy cập volume. Script sẽ thử rollback nếu có image/release trước. |
| Nginx trả 502 | Kiểm tra container healthy và Nginx proxy tới đúng `127.0.0.1:34800`; chạy `curl -i -H 'Host: agent.example.com' http://127.0.0.1:34800/health` trên VPS. |
| HTTPS hoặc Host không hợp lệ | Kiểm tra DNS, certificate, `CONTROL_DOMAIN` trong `.env`, và server_name trong Nginx. |

Không public dashboard local `34719`. Agent trên máy local kết nối tới control server qua HTTPS và chủ động gọi outbound; không deploy engine hoặc extension lên VPS.
