# Deploy source bằng GitHub Actions

Workflow deploy source code trong `control-server/` lên VPS Linux qua SSH, rồi khởi động lại service systemd. Pull request chạy `npm test`; push vào `main` chạy kiểm tra trước khi deploy. Có thể chạy lại bằng **Actions → Deploy control server → Run workflow** trên nhánh `main`.

Luồng này không build image và không cần registry. Cấu hình ứng dụng, database SQLite và TLS vẫn được quản lý trên VPS; GitHub chỉ giữ thông tin kết nối deploy.

## 1. Tạo GitHub Environment và điền thông tin

Vào **Settings → Environments → New environment**, tạo tên `production`. Trong environment này, đặt các mục sau ở **Environment secrets** và **Environment variables**.

| Loại | Tên | Giá trị |
| --- | --- | --- |
| Secret | `VPS_SSH_PRIVATE_KEY` | Private key SSH của user deploy, gồm cả các dòng `BEGIN/END` |
| Secret | `VPS_SSH_KNOWN_HOSTS` | Dòng host key đã xác minh của VPS; xem phần 2 |
| Variable | `VPS_HOST` | Hostname hoặc IPv4 của VPS |
| Variable | `VPS_PORT` | SSH port, thường là `22`; có thể bỏ qua nếu dùng `22` |
| Variable | `VPS_USER` | User SSH deploy, ví dụ `deploy` |
| Variable | `CONTROL_PUBLIC_URL` | Origin HTTPS, ví dụ `https://agent.dangngochai.io.vn`, không thêm path hoặc dấu `/` cuối |
| Variable | `CONTROL_PORT` | Cổng control server trên VPS; thường là `34800`, phải khớp file env của server |

Không tạo GitHub secret cho `.env` của ứng dụng. Workflow không truyền file này lên VPS.

Tạo một SSH key riêng, không có passphrase, cho deploy. Thêm **public key** vào `~deploy/.ssh/authorized_keys` trên VPS; lưu **private key** vào secret `VPS_SSH_PRIVATE_KEY`. Lấy host key bằng `ssh-keyscan -p 22 your-vps-host`, đối chiếu fingerprint với VPS qua một kênh tin cậy, rồi lưu dòng đã xác minh vào `VPS_SSH_KNOWN_HOSTS`. Nếu SSH dùng port khác, đổi `22` tương ứng.

## 2. Chuẩn bị VPS một lần

Các lệnh dưới đây dùng Ubuntu/Debian, user SSH `deploy`, Node.js 24 tại `/usr/bin/node`, `curl` và reverse proxy HTTPS đã có. Server không cần Chrome, MongoDB, Docker hay cài npm dependencies. Reverse proxy cần chuyển HTTPS tới `127.0.0.1:34800`; mẫu Nginx có trong [`nginx.conf.example`](nginx.conf.example). Nếu Node nằm ở đường dẫn khác, sửa `ExecStart` trong unit systemd cho khớp.

Tạo user chạy app và các thư mục. User SSH cần ghi được vào `/opt/agent-local` để tạo release và đổi symlink; database do user service sở hữu:

```bash
sudo useradd --system --user-group --home /nonexistent --shell /usr/sbin/nologin local-agent-control
sudo install -d -o deploy -g deploy -m 0755 /opt/agent-local
sudo install -d -o deploy -g deploy -m 0755 /opt/agent-local/releases
sudo install -d -o local-agent-control -g local-agent-control -m 0750 /var/lib/local-agent-control
```

Tạo `/etc/local-agent-control.env` bằng editor trên VPS, điền đúng domain và thiết lập proxy theo hạ tầng của bạn:

```dotenv
CONTROL_PUBLIC_URL=https://control.example.com
CONTROL_BIND=127.0.0.1
CONTROL_PORT=34800
CONTROL_DATABASE=/var/lib/local-agent-control/control.sqlite
CONTROL_TRUST_PROXY=1
CONTROL_TRUSTED_PROXY_IPS=
CONTROL_ALLOW_HTTP_LOOPBACK=0
```

`CONTROL_TRUST_PROXY=1` chỉ phù hợp khi proxy cùng máy và kết nối qua loopback. Với proxy ở container/host khác, để giá trị này bằng `0` và đặt đúng IP proxy trong `CONTROL_TRUSTED_PROXY_IPS`. Bảo vệ file env để chỉ root và user service đọc được:

```bash
sudo chown root:local-agent-control /etc/local-agent-control.env
sudo chmod 0640 /etc/local-agent-control.env
```

Cài unit systemd riêng cho source deploy. Nếu VPS đang chạy một control server khác trên cùng cổng hoặc database, hãy dừng deployment cũ trước khi chuyển sang workflow này. Chạy `scp` từ máy có checkout repo; thay user/host/port theo máy của bạn:

```bash
scp -P 22 control-server/deploy/local-agent-control-source.service deploy@your-vps-host:/tmp/local-agent-control-source.service
ssh -p 22 deploy@your-vps-host 'sudo install -o root -g root -m 0644 /tmp/local-agent-control-source.service /etc/systemd/system/local-agent-control-source.service && rm -f /tmp/local-agent-control-source.service && sudo systemctl daemon-reload && sudo systemctl enable local-agent-control-source.service'
```

Cho phép user deploy chỉ gọi các lệnh systemd mà workflow cần. Thay `deploy` nếu dùng tên khác:

```bash
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart local-agent-control-source.service, /usr/bin/systemctl is-active --quiet local-agent-control-source.service, /usr/bin/systemctl stop local-agent-control-source.service' | sudo tee /etc/sudoers.d/local-agent-control-deploy
sudo chmod 0440 /etc/sudoers.d/local-agent-control-deploy
sudo visudo -cf /etc/sudoers.d/local-agent-control-deploy
```

## 3. Chạy deploy

Giá trị `CONTROL_PUBLIC_URL` và `CONTROL_PORT` trong GitHub Variables phải khớp chính xác với `/etc/local-agent-control.env`. Commit/push lên `main`. Workflow chạy kiểm tra trước, sau đó chỉ chuyển thư mục `control-server/` của commit đó vào `/opt/agent-local/releases/<commit-sha>`, đổi symlink `current`, restart systemd và gọi `/health` nội bộ. Nếu service không khỏe, script tự chuyển symlink về release trước và restart lại.

Dashboard và máy local tiếp tục dùng `CONTROL_PUBLIC_URL`. Local engine kết nối outbound; không mở cổng `34719` ra Internet. SQLite lưu tại `/var/lib/local-agent-control/` nên các release mới không ghi đè database.

Sau lần deploy đầu tiên, tạo tài khoản web trên VPS. Nhập mật khẩu tương tác để không đưa mật khẩu vào command history:

```bash
read -r -s -p 'Mật khẩu tài khoản: ' CONTROL_PASSWORD; printf '\n'
printf '%s' "$CONTROL_PASSWORD" | sudo -u local-agent-control env \
  CONTROL_ENV_FILE=/etc/local-agent-control.env \
  CONTROL_DATABASE=/var/lib/local-agent-control/control.sqlite \
  /usr/bin/node /opt/agent-local/current/index.js user you@example.com
unset CONTROL_PASSWORD
```

## Gỡ lỗi

- Workflow báo thiếu secrets/variables: kiểm tra chúng được tạo bên trong Environment tên `production`.
- Lỗi SSH hoặc host key: kiểm tra `VPS_HOST`, `VPS_PORT`, public key trong `authorized_keys` và host key đã xác minh.
- `sudo: a password is required`: kiểm tra sudoers cho đúng user deploy và chạy `visudo -cf`.
- Health check thất bại: xem `sudo journalctl -u local-agent-control-source.service -n 100 --no-pager`, kiểm tra `/etc/local-agent-control.env`, `CONTROL_PORT` và proxy HTTPS.
- Workflow chỉ deploy khi ref là `main`; với `workflow_dispatch`, chọn nhánh `main`.
