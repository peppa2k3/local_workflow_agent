# Terminal agent và workflow bridge

`local-agent/` giữ kết nối Socket.IO với VPS Remote Control Agent. Workflow engine
vẫn chạy riêng bằng `node local-agent.js` tại gốc repository; bridge gọi API v1
ở `127.0.0.1:34719` bằng token của máy này.

## Dùng ngay qua terminal trên VPS

Trong terminal CMD/PowerShell đang điều khiển máy local, chuyển tới thư mục repo:

```powershell
cd D:\CODE_DND\local-agent-work-flow
node local-agent/workflow.js profiles
node local-agent/workflow.js scenarios
node local-agent/workflow.js describe --scenario downl-up-khoahocgia
node local-agent/workflow.js run --scenario downl-up-khoahocgia --profile "Profile 1" --request-id job-001 --wait
node local-agent/workflow.js runs
node local-agent/workflow.js status --run-id UUID_TRA_VE
node local-agent/workflow.js stop --run-id UUID_TRA_VE
```

Chọn đúng profile từ kết quả `profiles`. Action trình duyệt cần extension của
profile đó kết nối. `describe` cho biết các biến của scenario; ghi đè bằng
`--var "ten_bien=gia_tri"` hoặc `--variables-file file.json`. `--help` liệt kê
timeout, upload và chế độ chờ. Không có `--wait`, CLI trả ngay `runId`; mã thoát
0 nghĩa là đã nhận, không chứng minh workflow hoàn tất.

CLI đọc `.env` của `local-agent/` và token từ file `WORKFLOW_AGENT_ENV_FILE`
(mặc định `../.env`, tính từ thư mục agent, không theo terminal cwd).
`WORKFLOW_AGENT_URL` mặc định dùng cổng engine hoặc 34719. Token phải trùng
`LOCAL_AGENT_API_TOKEN` của engine đang chạy. Nếu vừa thêm/đổi token, khởi động
lại engine; không tạo token mới ở client nếu engine đã có token.

## Chạy từ web VPS

Source VPS trong project `remote-control-agent-core-base` đã được bổ sung relay
`workflow:request` và panel **Kịch bản tự động**. Build/deploy project đó theo
quy trình hiện có, rồi khởi động lại terminal agent để gửi capabilities.

Với agent nằm ngoài repo workflow, đặt trong `.env` riêng của agent:

```dotenv
WORKFLOW_AGENT_ENABLED=true
WORKFLOW_AGENT_URL=http://127.0.0.1:34719
WORKFLOW_AGENT_ENV_FILE=D:/CODE_DND/local-agent-work-flow/.env
```

Hoặc đặt đường dẫn trong terminal trước `npm start`:

```powershell
$env:WORKFLOW_AGENT_ENV_FILE = 'D:/CODE_DND/local-agent-work-flow/.env'
npm start
```

Các bước trên web: đăng nhập → yêu cầu điều khiển → local xác nhận → **Tải danh
sách kịch bản** → chọn profile/scenario → xem hoặc sửa biến → **Chạy kịch bản**.
Panel theo dõi trạng thái mỗi 2 giây và dừng đúng `runId`; tải lại danh sách để
xem các lượt gần đây sau khi kết nối lại. Không cần mở terminal để dùng panel.

## Giao thức và giới hạn

Agent gửi `agent:workflow-capabilities` với version 1 và operations:
`profiles`, `scenarios`, `describe`, `runs`, `status`, `run`, `stop`.
VPS gửi `workflow:request`:

```json
{
  "sessionId": "ACTIVE_LEASE_UUID",
  "requestId": "job-001",
  "operation": "run",
  "params": {
    "scenario": "downl-up-khoahocgia",
    "profile": "Profile 1",
    "variables": {}
  }
}
```

Browser thêm `deviceId`; backend xác minh membership, user, browser socket,
device, lease và heartbeat trước/sau relay. Local kiểm tra session/expiry lần
nữa. Response ACK `{ok, requestId, data}` hoặc `{ok:false, error, status, code}`.
Token API chỉ được dùng tại local, không đưa vào message/capabilities.

Chỉ chạy scenario đã lưu; không nhận steps, lệnh shell hoặc URL API tùy ý qua
bridge. Socket request không nhận `uploadPath`; đường dẫn upload nằm trong
scenario. Xác nhận media trùng vẫn thực hiện trên dashboard local.

Kết thúc lease/mất kết nối hủy quyền gửi lệnh mới và request HTTP đang chờ;
workflow đã nhận có thể tiếp tục như khi đóng CLI. Mở phiên mới và tra lịch sử
để theo dõi/dừng. Không tự retry POST; retry `run` cần giữ cùng `requestId` và
body. Idempotency của engine hiện chỉ ở RAM, mất qua restart.

`data/`, `data-backup/`, `.env` và credentials là dữ liệu của máy, không commit.
