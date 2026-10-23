# Điều khiển từ xa

## Tổng quan

Dịch vụ điều khiển từ xa chạy riêng trên VPS bằng `node remote-control.js`. Agent trên máy local tiếp tục lắng nghe tại cổng nội bộ 34719 và chủ động kết nối HTTPS tới VPS. Không mở cổng 34719 ra Internet qua router hoặc reverse proxy.

VPS lưu tài khoản, phiên đăng nhập, yêu cầu ghép nối và quyền điều khiển thiết bị trong một cơ sở dữ liệu SQLite riêng. VPS không cần file `.env` của máy local hoặc thông tin kết nối MongoDB Atlas. Dịch vụ VPS dùng Node 24 LTS; lệnh khởi chạy local thông thường không nạp SQLite.

Người quản trị tạo tài khoản bằng `node remote-control.js user email@example.com` và đưa mật khẩu qua stdin (12–256 ký tự). Không có chức năng tự đăng ký công khai. Mật khẩu được lưu bằng scrypt có salt; phiên đăng nhập hết hạn sau 12 giờ. Môi trường production dùng URL HTTPS công khai, cookie HttpOnly/Secure/SameSite, kiểm tra Origin và CSRF.

Dashboard local tạo mã ghép nối có thời hạn. Tài khoản đã đăng nhập nhập mã trên VPS; sau đó người dùng tại máy local xem đúng tài khoản yêu cầu và xác nhận. Chỉ khi cả hai phía đồng ý, thiết bị mới được cấp quyền điều khiển. Mã ghép nối hết hạn sau 10 phút.

VPS chỉ lưu giá trị băm của token ghép nối/thiết bị; token thiết bị gốc chỉ nằm trong thư mục dữ liệu local không được Git theo dõi. Hãy bảo vệ thư mục này như nơi lưu thông tin đăng nhập. Nếu phản hồi xác nhận bị mất do lỗi mạng, có thể gửi lại mà không tạo thêm thiết bị. Một trong hai phía đều có thể thu hồi quyền; muốn kết nối lại sau khi thu hồi phải ghép nối mới. API ghép nối local luôn yêu cầu phiên dashboard local, kể cả khi token API cũ không được bật.

Tài liệu tham khảo: [Node SQLite](https://nodejs.org/api/sqlite.html), [Node scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback), [quản lý phiên của OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Sử dụng giao diện web

1. Trên máy local, mở `http://127.0.0.1:34719/remote`, chọn các Chrome profile và kịch bản đã lưu được phép điều khiển. Chỉ chọn từng biến nếu tài khoản remote được phép thay giá trị biến đó; bấm **Lưu quyền điều khiển**.
2. Nhập địa chỉ HTTPS của web điều khiển và tên hiển thị của máy, rồi tạo mã ghép nối.
3. Đăng nhập web trên VPS và nhập mã tại mục **Ghép thiết bị mới**.
4. Quay lại trang Remote trên máy local, kiểm tra địa chỉ VPS và tài khoản yêu cầu, rồi xác nhận. Nếu người dùng local không xác nhận hoặc mã hết hạn thì không tạo kết nối.
5. Trên VPS, chọn thiết bị để xem lần kết nối gần nhất, CPU/RAM/thời gian chạy của agent, tình trạng extension theo từng profile, kịch bản được cấp quyền và lịch sử lệnh. Chọn profile/kịch bản, bật ghi đè biến được cho phép nếu cần, rồi chạy.
6. Mở chi tiết lịch sử để xem kết quả từng bước và bước đã dừng. Nút dừng chỉ áp dụng cho lượt chạy được chọn. Thu hồi quyền trên VPS hoặc ngắt kết nối tại local để chấm dứt quyền điều khiển.

Dashboard chính và trang tùy chọn của extension có liên kết tới trang Remote local. Web tự cập nhật khi trang đang hiển thị và giữ phần cấu hình quyền/biến đang chỉnh chưa lưu. Thiết bị offline không nhận lượt chạy mới. Với các bước thao tác trên trình duyệt, agent local, Chrome và extension của profile tương ứng phải đang hoạt động.

## Lệnh điều khiển và khôi phục

Thiết bị gửi trạng thái hoạt động, kết quả và nhận tối đa một lệnh đang chờ sau mỗi 3 giây. Khi lỗi kết nối, thời gian thử lại tăng dần, tối đa khoảng một phút. Thiết bị được coi là online nếu VPS nhận trạng thái trong vòng 45 giây; trạng thái extension được hiển thị riêng cho từng profile được cấp quyền. VPS chỉ cấp quyền nhận lệnh cho một tiến trình agent của thiết bị trong 35 giây. Sau khi tiến trình gặp lỗi, tiến trình mới có thể phải chờ quyền này hết hạn rồi mới kết nối lại.

Máy local cấp quyền theo tên kịch bản đã lưu, thư mục profile và từng tên biến. Mặc định tài khoản remote không được ghi đè biến. Lệnh remote không cho sửa kịch bản, chạy lệnh shell, mở profile hoặc truyền riêng tham số `uploadPath`. Một biến được cấp quyền có thể ảnh hưởng tới bất kỳ trường nào trong kịch bản đã lưu đang tham chiếu biến đó; hãy cân nhắc phạm vi này trước khi cấp quyền cho biến chứa đường dẫn hoặc URL. Nội dung kịch bản local đã sửa sẽ được dùng cho lượt chạy tiếp theo. Nếu sắp sửa một kịch bản nhạy cảm, hãy gỡ quyền của kịch bản đó trước.

Mỗi lượt chạy có UUID/khóa chống gửi trùng do phía gửi tạo, bản ghi hàng đợi bền vững trên VPS và hạn bắt đầu là 5 phút. VPS chỉ nhận yêu cầu chạy mới khi thiết bị online. Agent ghi nhật ký local xuống ổ đĩa trước khi bắt đầu workflow. UUID thực thi bằng UUID của lệnh, tách khỏi UUID mà extension dùng để trao đổi từng bước. Khi nhận lại cùng một lệnh, agent không chạy lại.

Nếu agent bị gián đoạn ở thời điểm chưa xác định được lệnh đã bắt đầu hay chưa, hệ thống báo `unknown`. Hãy kiểm tra lịch sử local trước khi tạo lượt chạy mới. Không thể bảo đảm thao tác trên website bên ngoài chỉ xảy ra đúng một lần tuyệt đối, vì phản hồi của website có thể bị mất.

Lệnh dừng nhắm đúng UUID của lượt chạy remote, không dừng tùy tiện lượt đang chạy trên cùng profile. Lệnh dừng cũng có thể hủy một lượt chưa được chuyển tới local. Hệ thống lưu các trạng thái hết hạn, thất bại, đã hủy, bị gián đoạn và thành công. Nếu mất mạng, tác vụ đã bắt đầu vẫn chạy; kết quả sẽ được gửi tiếp khi kết nối lại. Khi local nhận được yêu cầu ngắt kết nối/thu hồi quyền, các lượt chạy remote thuộc thiết bị đó sẽ dừng; lượt chạy chỉ được khởi tạo tại local vẫn độc lập. Gỡ quyền profile hoặc kịch bản cũng dừng các lượt remote đang dùng quyền đó.

Lịch sử VPS có trạng thái/nhãn từng bước, thời gian bắt đầu/kết thúc và bước đã dừng. Agent không tự gửi đường dẫn video tải về, URL nguồn, giá trị mặc định của biến hoặc toàn bộ thông báo lỗi lên VPS. Giá trị biến được người dùng nhập rõ ràng trên web remote sẽ được lưu cùng lệnh. Chi tiết nội dung và upload vẫn nằm trong trình quản lý nội dung local/Atlas. Quyền remote không cấp thông tin đăng nhập Atlas hoặc quyền truy cập trực tiếp vào file. Hãy sao lưu cả nhật ký local và SQLite điều khiển; xóa hoặc khôi phục nhật ký cũ có thể làm mất cơ chế chống chạy lại.

## Triển khai trên VPS

Chuẩn bị VPS Linux có Node 24 LTS, tên miền trỏ tới VPS và nginx với chứng chỉ TLS hợp lệ. Dịch vụ điều khiển không cần Chrome, Playwright, kết nối MongoDB hay công cụ xử lý video. Không sao chép `.env`, Chrome profile hoặc dữ liệu local lên VPS.

### Cách 1: Container (dùng mạng của máy chủ Linux)

Trong bản checkout trên VPS, chạy:

```sh
cp .env.control.example .env.control
# Sửa CONTROL_PUBLIC_URL thành đúng địa chỉ gốc https:// (không thêm đường dẫn).
chmod 600 .env.control
docker compose -f deploy/control/compose.yaml build
# Tạo tài khoản mà không đưa mật khẩu vào tham số lệnh hoặc lịch sử shell:
read -r -s -p 'Mật khẩu tài khoản mới: ' CONTROL_PASSWORD; printf '\n'
printf '%s' "$CONTROL_PASSWORD" | docker compose -f deploy/control/compose.yaml run --rm -T control node remote-control.js user you@example.com
unset CONTROL_PASSWORD
docker compose -f deploy/control/compose.yaml up -d
```

Sửa `CONTROL_PUBLIC_URL` trong `.env.control` thành đúng địa chỉ HTTPS công khai, không thêm đường dẫn. Thay `you@example.com` bằng email cần tạo.

File Compose dùng volume để giữ SQLite, chạy bằng người dùng không có quyền quản trị, đặt hệ thống file ứng dụng ở chế độ chỉ đọc và dùng mạng của máy chủ Linux. Dịch vụ chỉ lắng nghe tại `127.0.0.1:34800`; chỉ chạy một bản dịch vụ. Cài và chỉnh `deploy/control/nginx.conf.example`, thay tên miền/đường dẫn chứng chỉ, kiểm tra cấu hình nginx trước khi tải lại. Mở HTTPS cổng 443 và HTTP cổng 80 để chuyển hướng; giữ cổng 34800 và cổng local 34719 ở chế độ riêng tư. URL công khai phải khớp với Host mà nginx chuyển tiếp. nginx ghi đè header IP chuyển tiếp; chỉ bật `CONTROL_TRUST_PROXY=1` khi dùng reverse proxy đáng tin cậy kết nối qua loopback. `/health` chỉ kiểm tra dịch vụ còn hoạt động, không trả thông tin tài khoản/thiết bị. Không cần cấu hình WebSocket.

### Cách 2: Dịch vụ chạy trực tiếp

Sao chép `remote-control.js`, `src/remote/` và `control-web/` vào `/opt/local-agent-control`. Tạo người dùng hệ thống riêng `local-agent-control`. Lưu cấu hình theo file mẫu tại `/etc/local-agent-control.env` và chỉ cho người dùng đó đọc. Cài và điều chỉnh `deploy/control/local-agent-control.service`; đường dẫn Node trong file đang giả định là `/usr/bin/node`. Tạo `/var/lib/local-agent-control` và giao quyền sở hữu cho người dùng đó. Sau đó chạy lệnh tạo tài khoản bằng chính người dùng này, với `CONTROL_ENV_FILE=/etc/local-agent-control.env` và `CONTROL_DATABASE=/var/lib/local-agent-control/control.sqlite`. Cài nginx/TLS như trên rồi bật và chạy dịch vụ systemd.

Chỉ dùng một trong hai cách triển khai cho cùng cổng và cùng cơ sở dữ liệu. Các file trên là mẫu triển khai; trong quá trình phát triển chưa cấp phát hoặc sửa VPS thật.

## Để máy local chạy liên tục

Dùng Node 22.13 trở lên (khuyến nghị Node 24 LTS), giữ file `.env` local hiện có, cài dependency bằng `npm ci`, rồi chạy:

```powershell
node local-agent.js --daemon
```

`node local-agent.js` vẫn là cách mở chế độ tương tác thông thường; các lệnh CLI vẫn hoạt động. Chế độ daemon không thoát khi stdin đóng. SIGINT/SIGTERM dừng các workflow và đóng kết nối agent/Mongo. Nếu tiến trình bị kết thúc đột ngột, activity store và nhật ký remote sẽ hỗ trợ nhận diện lượt bị gián đoạn khi khởi động lại. Kết nối bị mất sẽ được thử lại tự động với thời gian chờ tăng có giới hạn. Server local vẫn chỉ lắng nghe trên loopback.

Để tự khởi động trong phiên đăng nhập tương tác của người dùng Windows hiện tại:

```powershell
powershell -NoProfile -File scripts/install-remote-startup.ps1
# Sau khi đóng agent đang chạy ở cửa sổ khác, có thể khởi động task ngay:
Start-ScheduledTask -TaskName LocalAgentRemote
# Gỡ task:
powershell -NoProfile -File scripts/install-remote-startup.ps1 -Remove
```

Task được đăng ký để chạy ở lần đăng nhập tiếp theo, bằng cửa sổ ẩn và quyền hạn của người dùng hiện tại. Đây không phải dịch vụ Windows Session 0; task cũng không tự mở hoặc thay thế phiên Chrome đang dùng. Script chuyển tiếp mã thoát của Node để Task Scheduler có thể thử khởi chạy lại tối đa ba lần nếu lỗi. Log được tách theo từng lần chạy trong `data/daemon-logs/`; hãy quản lý thời gian lưu log theo dung lượng ổ đĩa. Giữ Chrome/extension hoạt động trong cùng phiên người dùng và chỉnh chế độ nguồn của Windows để máy không ngủ khi cần online. Khóa màn hình vẫn giữ phiên đăng nhập; đăng xuất sẽ đóng các ứng dụng tương tác. Trong quá trình phát triển chưa đăng ký Scheduled Task trên máy thật.

## Bảo trì và giới hạn

Sao lưu SQLite khi dịch vụ đã dừng, kèm thư mục chứa cơ sở dữ liệu (có thể còn file WAL/SHM); hoặc dùng công cụ sao lưu trực tiếp có hiểu SQLite. Bảo vệ bản sao lưu như thông tin đăng nhập. Sao lưu đồng bộ `remote.json`, `remote-journal.json` và lịch sử hoạt động local. Trên Windows, giới hạn ACL của thư mục dữ liệu cho người dùng chạy agent và quản trị viên. Trên Linux, các thư mục/file điều khiển mới tạo có quyền truy cập riêng tư. Muốn đổi token thiết bị, hãy thu hồi kết nối và ghép nối lại.

Giao diện chỉ hiện 200 lệnh gần nhất cho mỗi thiết bị; việc dọn bản ghi hàng đợi/nhật ký bền vững hiện cần thực hiện thủ công. Không xóa bản ghi của lệnh đang hoạt động. VPS chỉ nhận bản xem trước của 100 bước đầu với nhãn bị giới hạn độ dài; lịch sử đầy đủ ở local. Một chính sách tối đa 100 profile/200 kịch bản và kích thước dữ liệu biến có giới hạn. Lệnh chờ bắt đầu tối đa 5 phút; thời gian chạy tối đa một giờ. Chỉ nên đổi các mặc định này sau khi xem xét cách hệ thống xử lý lệnh nhận lại và lệnh hết hạn.

Xem cả `lastSeen` của thiết bị và trạng thái extension: agent online không có nghĩa Chrome đang thao tác được trên website. Chỉ số CPU/RAM của agent là của tiến trình Node, không phải toàn máy. Cần tự cấu hình và xác minh TLS, gia hạn chứng chỉ, DNS, firewall và locator của website thật trong môi trường triển khai.

`npm test` và `node --check` kiểm tra bằng tài khoản/thiết bị giả lập, HTTP mock và trình duyệt tách biệt. Bản triển khai này chưa thử trên VPS thật, chưa cài task Windows, chưa ghép thiết bị thật và chưa chạy automation trên Facebook.
