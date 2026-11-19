# Build và deploy control server bằng GitHub Actions

Workflow chỉ chuyển source trong `control-server/` lên VPS, build Docker image ngay trên VPS, rồi chạy container. Source release, file env và cấu hình deploy nằm dưới `/opt/agent-local`. `local-workflow-agent/` và `chrome-reels-extension/` tiếp tục chạy trên máy local.

Đặt `TRAEFIK_NETWORK` nếu Traefik đang nhận HTTPS trên VPS. Container nối vào mạng Docker đó và Traefik chuyển tiếp đến cổng 34800 trong container. Khi để trống biến này, container dùng host network và Nginx chuyển tiếp tới `127.0.0.1:34800`.

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

Pull request chạy CI. Deploy tự động chỉ chạy khi push vào `main` có thay đổi trong `control-server/`, bỏ qua các file Markdown. Để deploy theo yêu cầu, dùng **Actions → Deploy control server → Run workflow** và chọn nhánh `main`.

## 2. Chuẩn bị VPS và env

VPS cần Docker Engine, Docker Compose v2, `curl`, reverse proxy HTTPS và domain đã trỏ DNS về VPS. Mở cổng inbound 80/443 cho proxy. User SSH phải có quyền Docker:

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

### VPS dùng Traefik

Bật Docker provider của Traefik, rồi lấy tên mạng Docker mà container Traefik đang dùng bằng `docker inspect traefik --format '{{json .NetworkSettings.Networks}}'`. Thêm các biến sau vào `/opt/agent-local/.env`, dùng đúng tên mạng, entrypoint và ACME resolver trên VPS:

```dotenv
TRAEFIK_NETWORK=web
TRAEFIK_CONTAINER=traefik
TRAEFIK_HTTPS_ENTRYPOINT=websecure
TRAEFIK_CERT_RESOLVER=le
```

Nếu Traefik đã có chứng chỉ phù hợp cho domain, có thể để trống `TRAEFIK_CERT_RESOLVER`. Script deploy tra IP nội bộ của Traefik trên mạng đã chọn để ứng dụng xác định đúng IP người dùng. Nếu IP Traefik thay đổi khi tạo lại container, chạy lại deploy. Cổng 34800 chỉ được dùng trên mạng Docker đã chọn.

### VPS dùng Nginx trên máy chủ

Để trống `TRAEFIK_NETWORK`. Nếu cần cài Nginx, dùng `sudo apt-get update && sudo apt-get install -y nginx`.

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

Khi workflow chạy, nó tải release vào `/opt/agent-local/releases/<commit-sha>`, build image tại VPS, chờ health check trong container và gọi `https://<CONTROL_DOMAIN>/health` qua DNS, TLS và reverse proxy. Chỉ sau khi cả hai kiểm tra thành công, script cập nhật `/opt/agent-local/current`. Nếu một kiểm tra thất bại, script thử khôi phục release/image trước. `.env` và volume SQLite giữ nguyên qua mỗi deploy.

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

Sau khi sửa `/opt/agent-local/.env`, chạy lại workflow hoặc chạy script cho release hiện tại để áp dụng cấu hình và kiểm tra domain:

```bash
source_dir="$(readlink -f /opt/agent-local/current)"
release_tag="$(basename "$source_dir")"
bash "$source_dir/deploy/deploy-container.sh" apply /opt/agent-local "$release_tag"
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
| `network ... could not be found` | Đặt `TRAEFIK_NETWORK` bằng đúng tên mạng Docker của Traefik. |
| Cổng 34800 đã được dùng | Dừng service/container control cũ; chỉ để một instance dùng cổng này. |
| Health check thất bại | Xem log control, kiểm tra Docker daemon và quyền truy cập volume. Script sẽ thử rollback nếu có image/release trước. |
| Container healthy, HTTPS trả 404 | Với Traefik, kiểm tra `TRAEFIK_NETWORK`, Docker provider và HTTPS entrypoint. Với Nginx, kiểm tra server block cho `CONTROL_DOMAIN` đã được nạp. |
| Nginx trả 502 | Kiểm tra container healthy và Nginx proxy tới đúng `127.0.0.1:34800`; chạy `curl -i -H 'Host: agent.example.com' http://127.0.0.1:34800/health` trên VPS. |
| HTTPS hoặc Host không hợp lệ | Kiểm tra DNS, certificate, `CONTROL_DOMAIN` trong `.env`, và server_name trong Nginx. |

Không public dashboard local `34719`. Agent trên máy local kết nối tới control server qua HTTPS và chủ động gọi outbound; không deploy engine hoặc extension lên VPS.
