# Khung ứng dụng chat TCP

Client Electron hỗ trợ tài khoản, trạng thái online/offline và chat riêng qua TCP. SQLite lưu hội thoại, tin chờ và trạng thái **Đã gửi**, **Đã nhận**, **Đã xem** của từng tin nhắn. Các bước dưới dùng PowerShell. [Bản lưu tại mốc dựng khung PING](docs/huong-dan-dung-khung.md)

## A. Chuẩn bị môi trường

Dự án dùng Node.js **22.23.5**, npm đi kèm và Git. Trên Windows x64 mới, cài bản `.msi` của Node.js 22, mở PowerShell mới và kiểm tra phiên bản. Nếu dùng NVM for Windows, có thể chạy `nvm install 22.23.5` và `nvm use 22.23.5`. [Bản cài Node.js 22](https://nodejs.org/download/release/latest-v22.x/)

Trên **máy đã dựng đồ án này**, Node 22 và 24 cùng tồn tại. Để chọn đúng Node cho riêng cửa sổ PowerShell hiện tại, chạy ở thư mục bất kỳ. Lặp lại trong cửa sổ thứ hai khi mở Client.

```powershell
$env:Path = "$env:LOCALAPPDATA\Author Software\nvm\installs\v22.23.5;$env:Path"
node -v
npm.cmd -v
git --version
```

Nếu máy chưa có Git, chạy `winget install --id Git.Git -e --source winget`, rồi mở lại PowerShell. Khi muốn bắt đầu quản lý phiên bản, chạy các lệnh sau tại `chat_project`. Thay tên và email ví dụ bằng danh tính dùng để commit. [Git cho Windows](https://git-scm.com/install/windows) · [Cấu hình danh tính Git](https://git-scm.com/book/en/v2/Getting-Started-First-Time-Git-Setup)

```powershell
git init
git config user.name "Tên của bạn"
git config user.email "ban@example.com"
git config --get user.name
git config --get user.email
```

## B. Cấu trúc dự án

```text
chat_project/
├── server/
│   ├── server.js
│   ├── config.js
│   ├── db.js
│   ├── sessions.js
│   ├── router.js
│   ├── handlers/
│   │   ├── auth.js
│   │   ├── message.js
│   │   ├── group.js
│   │   ├── file.js
│   │   ├── history.js
│   │   ├── state.js
│   │   └── p2p.js
│   ├── utils/
│   │   ├── logger.js
│   │   └── checksum.js
│   ├── uploads/
│   │   ├── files/
│   │   │   └── .gitkeep
│   │   ├── images/
│   │   │   └── .gitkeep
│   │   ├── videos/
│   │   │   └── .gitkeep
│   │   └── sounds/
│   │       └── .gitkeep
│   ├── data/
│   │   ├── .gitkeep
│   │   └── chat.db
│   └── package.json
├── client/
│   ├── main.js
│   ├── preload.js
│   ├── network.js
│   ├── p2p.js
│   ├── fileTransfer.js
│   ├── renderer/
│   │   ├── index.html
│   │   ├── style.css
│   │   ├── app.js
│   │   ├── js/
│   │   │   ├── auth.js
│   │   │   ├── contacts.js
│   │   │   ├── chat.js
│   │   │   ├── group.js
│   │   │   ├── media.js
│   │   │   ├── recorder.js
│   │   │   ├── emoji.js
│   │   │   ├── history.js
│   │   │   └── state.js
│   │   └── assets/
│   │       ├── icons/
│   │       └── sounds/
│   ├── downloads/
│   │   └── .gitkeep
│   └── package.json
├── common/
│   ├── protocol.js
│   └── constants.js
├── test/
│   ├── protocol.test.js
│   └── auth.test.js
├── docs/
├── .gitignore
└── README.md
```

Cây trên theo thứ tự trong đề. Sau khi cài, npm tạo thêm `node_modules/` và `package-lock.json` trong cả `server/` và `client/`. Hai thư mục `assets/icons/` và `assets/sounds/` có `.gitkeep` để Git giữ thư mục rỗng. Bản hướng dẫn dựng lại nằm trong `docs/huong-dan-dung-khung.md`.

## C. Cài thư viện trên máy mới

Mở PowerShell tại `chat_project`. Hai lệnh dùng đúng phiên bản trong lockfile. Trên máy chỉ chạy Client, chỉ cần lệnh thứ hai. Giữ thư mục `common/` bên cạnh `client/` và `server/` khi sao chép mã nguồn.

```powershell
npm.cmd --prefix server ci
npm.cmd --prefix client ci
```

Server dùng `better-sqlite3` và `bcryptjs`. Client dùng `electron` làm devDependency. Lần mở Client đầu tiên trên máy mới cần Internet để tải bản chạy Electron.

## D. Chạy thử trên cùng máy

**PowerShell 1**, tại `chat_project`:

```powershell
npm.cmd --prefix server start
```

Server in `listening on 0.0.0.0:5000` và các địa chỉ IPv4. Khi cần đổi cổng, đặt `$env:PORT = '5001'` trước lệnh chạy, rồi nhập cùng số cổng trên Client. Nhấn Ctrl+C để dừng Server.

**PowerShell 2**, tại `chat_project`:

```powershell
npm.cmd --prefix client start
```

Nhập `127.0.0.1`, cổng `5000`, bấm **Kết nối**. Client tự gửi PING đầu tiên. Bấm **Gửi PING** để gửi thêm trên cùng socket. Mỗi lần thành công có một dòng **GỬI** và một dòng **NHẬN**.

```json
{"type":"PING","from":null,"time":"2026-11-21T15:22:08.020Z"}
```

`time` là giờ UTC do Server gán. `from` là tài khoản gắn với socket và bằng `null` khi chưa đăng nhập.

### Thử lịch sử và tin nhắn offline

1. Chạy một Server và mở hai Client bằng `npm.cmd --prefix client start` ở hai terminal riêng. Kết nối, đăng ký hai tài khoản (ví dụ An và Bình), rồi đăng nhập.
2. Cho Bình đăng xuất. An chọn **Bình** trong danh sách, nhập nội dung và bấm **Gửi**. Tin được lưu vào SQLite ngay cả khi Bình offline.
3. Cho Bình đăng nhập lại. Nhãn **Tin mới** xuất hiện cạnh An. Bấm **An** để đọc hội thoại. Tin offline và tin đã trao đổi trước đó hiển thị theo thứ tự gửi.
4. Với hội thoại có hơn 10 tin, khi mở lại phiên ứng dụng, bạn thấy 10 tin gần nhất. Cuộn lên đầu khung tin hoặc bấm **Tải tin cũ hơn** để đọc trang trước. Đổi qua lại giữa các hội thoại để kiểm tra nội dung riêng của từng người.
5. Để thử lưu bền vững, gửi thêm một tin khi Bình offline, dừng rồi chạy lại Server, sau đó kết nối và đăng nhập lại. Cả lịch sử và hàng đợi đều dùng `server/data/chat.db`.

Server dùng tài khoản của socket và trường `peer` để giới hạn lịch sử trong một hội thoại. `HISTORY_REQ` nhận `beforeId` tùy chọn. Gói `HISTORY` trả tối đa 10 tin từ cũ đến mới và `nextBeforeId` để lấy trang trước. Client dùng mã tin trong SQLite để gộp lịch sử với tin trực tiếp.

### Phần 6. Thử trạng thái tin nhắn riêng

Quan sát nhãn dưới tin nhắn ở cửa sổ của **An** khi thực hiện lần lượt các bước sau.

| Thao tác | Nhãn An thấy |
| --- | --- |
| Bình đang đăng xuất. An gửi một tin cho Bình. | **Đã gửi** khi Server lưu tin vào SQLite. |
| Bình đăng nhập và để nguyên danh sách liên hệ. | **Đã nhận** khi Client của Bình nhận tin và gửi xác nhận. Cạnh An xuất hiện **Tin mới**. |
| Bình bấm vào An và cuộn đến tin trong cửa sổ đang sử dụng. | **Đã xem** khi tin xuất hiện trong vùng đang nhìn thấy. |
| Bình thu nhỏ cửa sổ hoặc mở hội thoại khác. An gửi thêm một tin. | Tin mới dừng ở **Đã nhận** cho đến khi Bình trở lại và nhìn thấy tin trong hội thoại với An. |

Khởi động lại Server, kết nối và đăng nhập lại bằng An rồi mở hội thoại với Bình. Các nhãn hiển thị theo trạng thái đã lưu trong `server/data/chat.db`.

Client người nhận gửi gói `ACK` theo mã tin, ví dụ `{"type":"ACK","id":42,"status":"received"}`. Chỉ tài khoản nhận tin được cập nhật trạng thái của tin đó. Server giữ tin mới trong hàng đợi cho đến khi nhận ACK, nên nếu kết nối mất giữa chừng thì tin được chuyển lại ở lần đăng nhập sau. ACK đến muộn giữ nguyên mức xác nhận cao nhất. Phần 6 dùng lại cột `messages.status` có sẵn. Tin cũ mang giá trị `sent` hiển thị **Đã gửi** cho đến khi có xác nhận từ Client người nhận.

**Đường đi của gói.** Giao diện gọi preload qua `contextBridge`. Tiến trình chính nhận IPC và dùng `net` mở TCP. Mỗi gói gồm 4 byte UInt32BE ghi số byte của phần JSON UTF-8, kế tiếp là JSON. Mỗi socket có bộ giải mã riêng, tiếp tục đọc khi thiếu byte và đọc tiếp gói sau nếu còn dữ liệu. Hai đầu đóng socket khi thấy độ dài vượt 1 MiB. Khối tệp dành cho bước sau có kích thước 64 KiB.

## E. Demo trên hai máy

1. Nối cả hai máy vào cùng Wi-Fi, hoặc cho cả hai cùng kết nối điểm phát sóng của điện thoại.
2. Chạy Server trên máy A. Ghi địa chỉ ở dòng **IP LAN (Wi-Fi)**. Có thể đối chiếu bằng `ipconfig` và tìm IPv4 của bộ điều hợp Wi-Fi đang kết nối.
3. Chạy Client trên máy B, nhập IPv4 của A và cổng Server in ra. Bấm **Kết nối**, rồi **Gửi PING**. So sánh dòng **NHẬN** có trường `time` trên B với địa chỉ Client mà A vừa ghi nhận.

| Hiện tượng | Cách xử lý |
| --- | --- |
| Máy A chạy được, máy B không kết nối | `127.0.0.1` và `localhost` luôn chỉ chính máy đang chạy Client. Trên B, nhập IPv4 Wi-Fi của A. |
| Hết thời gian chờ | Trên B chạy `Test-NetConnection <IP-của-A> -Port 5000`, thay phần trong dấu ngoặc bằng IP thật. Nếu thất bại, kiểm tra cổng và cho phép Node.js hoặc TCP 5000 chiều vào trên cấu hình mạng riêng của A. |
| Cùng Wi-Fi nhưng hai máy không thấy nhau | Wi-Fi khách hoặc hotspot có thể bật AP/client isolation. Chuyển sang mạng cho phép các thiết bị liên lạc trực tiếp. |
| `ECONNREFUSED` hoặc `EADDRINUSE` | Kiểm tra Server đang chạy và hai đầu dùng cùng cổng. Nếu cổng đang bận, chọn `PORT` khác. |
| Client thoát ngay, không mở cửa sổ | Nếu `$env:ELECTRON_RUN_AS_NODE` bằng `1`, chạy `Remove-Item Env:ELECTRON_RUN_AS_NODE` trong terminal Client rồi chạy lại. |
| Lỗi cài hoặc nạp better-sqlite3 | Chọn Node 22 x64, kiểm tra `node -p "process.version + ' ' + process.arch"` và chạy lại `npm.cmd --prefix server ci` trên máy đích để có bản nhị phân đúng nền tảng. |

Nếu phải biên dịch mô-đun SQLite từ nguồn trên Windows, cài Python 3 và Visual Studio Build Tools với workload **Desktop development with C++** cùng Windows SDK. Mở Developer PowerShell mới rồi làm theo hướng dẫn build của phiên bản thư viện. Phương án dự phòng là đổi sang `sqlite3` sau khi thống nhất, vì API bất đồng bộ của gói đó đòi hỏi sửa `server/db.js` và các lệnh truy vấn. [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) · [Môi trường biên dịch node-gyp trên Windows](https://github.com/nodejs/node-gyp#on-windows)

## F. Checklist kiểm tra

Tại thư mục gốc `chat_project`, chạy:

```powershell
node --test test/protocol.test.js test/auth.test.js
```

- [ ] Server in `listening on 0.0.0.0:5000` và IP LAN.
- [ ] Client cùng máy kết nối `127.0.0.1:5000`, bấm **Gửi PING**, nhận `PING` có `time`.
- [ ] Client máy thứ hai cùng Wi-Fi hoặc hotspot nhận phản hồi khi nhập IP LAN của Server.
- [ ] Đóng đột ngột Client. Server vẫn chạy và trả PING khi mở Client kết nối lại.
- [ ] Kiểm thử giao thức in ba dòng **Đạt** cho gói dính, gói bị cắt và gói vượt giới hạn.

- [ ] Tin gửi khi người nhận offline xuất hiện khi họ đăng nhập lại. Lịch sử cũ tải đúng thứ tự qua nhiều trang và mỗi tin chỉ xuất hiện một lần.
- [ ] Một tin gửi cho người đang offline lần lượt hiện **Đã gửi**, **Đã nhận**, **Đã xem** khi người đó đăng nhập rồi mở tin. Nhãn **Đã xem** vẫn hiện sau khi khởi động lại Server.

Bước kế tiếp là chat nhóm, gồm tạo nhóm, thêm thành viên và gửi tin nhắn trong nhóm.
