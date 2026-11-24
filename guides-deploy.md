# Deploy Control Server bằng GitHub Actions

Workflow dùng SSH để gửi riêng `control-server/` đến VPS và build bằng Docker tại đó. Hoàn thành bước 1–2 của [hướng dẫn VPS](guides-server.md) trước. Domain, proxy và volume thuộc `/opt/agent-local/.env` trên VPS. GitHub environment `production` chỉ cần ba variables và hai secrets. [Workflow thực tế](.github/workflows/deploy.yml)

## 1. Xác định ba variables

| Tên | Lấy giá trị ở đâu |
| --- | --- |
| `VPS_HOST` | IPv4 hoặc hostname SSH trong trang quản lý VPS của nhà cung cấp. |
| `VPS_PORT` | Port dùng để SSH, mặc định 22. Trên VPS xem bằng `sudo sshd -T | grep '^port '`. Nếu có NAT, dùng port phía ngoài. |
| `VPS_USER` | Chạy `id -un` trong phiên SSH đã kiểm tra quyền Docker và quyền ghi `/opt/agent-local/releases`. |

## 2. Tạo key đăng nhập cho workflow

Trên máy quản trị, dùng Bash (Linux, macOS hoặc WSL). Thay ba giá trị ví dụ. Chọn đường dẫn key mới, lưu ngoài checkout. Runner dùng key riêng không có passphrase.

```bash
host=vps.example.com
port=22
user=deploy
key=~/.ssh/local-agent-production
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -N '' -C 'local-agent-production' -f "$key"
ssh-copy-id -i "$key.pub" -p "$port" "$user@$host"
```

**VPS_SSH_PRIVATE_KEY** là toàn bộ nội dung file `$key` gồm dòng BEGIN/END. File `$key.pub` được thêm vào `~/.ssh/authorized_keys` của user deploy trên VPS.

## 3. Xác minh danh tính VPS

Trên console VPS của nhà cung cấp, lấy fingerprint tin cậy bằng `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`. Trên máy quản trị, thu host key, đối chiếu fingerprint rồi thử đăng nhập.

```bash
known=~/.ssh/local-agent-production.known_hosts
ssh-keyscan -t ed25519 -p "$port" "$host" > "$known"
ssh-keygen -lf "$known"
# Tiếp tục khi fingerprint khớp với console VPS.
ssh -p "$port" -i "$key" -o IdentitiesOnly=yes -o BatchMode=yes \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$known" \
  "$user@$host" 'docker compose version && docker info >/dev/null && test -w /opt/agent-local/releases'
```

**VPS_SSH_KNOWN_HOSTS** là nội dung file `$known` đã xác minh, gồm hostname/port, loại key và public host key.

## 4. Lưu variables và secrets vào GitHub

Trong [Settings → Environments](https://github.com/peppa2k3/local_workflow_agent/settings/environments), tạo hoặc mở **production**. Nếu dùng fork, mở Settings của fork. Điền **Environment variables** và **Environment secrets** tại đây, hoặc dùng GitHub CLI từ checkout sau khi tạo environment. Lệnh dưới đọc secrets trực tiếp từ file. [GitHub CLI](https://cli.github.com/manual/gh_secret_set)

```bash
gh auth login
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
gh variable set VPS_HOST --repo "$repo" --env production --body "$host"
gh variable set VPS_PORT --repo "$repo" --env production --body "$port"
gh variable set VPS_USER --repo "$repo" --env production --body "$user"
gh secret set VPS_SSH_PRIVATE_KEY --repo "$repo" --env production < "$key"
gh secret set VPS_SSH_KNOWN_HOSTS --repo "$repo" --env production < "$known"
```

## 5. Phát hành và xác nhận

Mở [Actions → Deploy control server](https://github.com/peppa2k3/local_workflow_agent/actions/workflows/deploy.yml), chọn **Run workflow → main**. Hoặc chạy `gh workflow run deploy.yml --ref main --repo "$repo"`. Push vào `main` có thay đổi mã trong `control-server/` cũng kích hoạt deploy. Thay đổi chỉ có Markdown được bỏ qua.

Theo dõi job **validate** và **deploy** trong cùng lượt chạy. Khi deploy xanh, kiểm tra `curl --fail https://<CONTROL_DOMAIN>/health` với domain thật. Tạo tài khoản hoặc tra log theo [bước 4 trên VPS](guides-server.md#4-kiểm-tra-và-tạo-tài-khoản-đầu-tiên).
