# Khung ứng dụng chat TCP

Client Electron gửi PING qua socket TCP đến Server Node.js. Nhật ký hiển thị cả gói gửi lẫn phản hồi, nên có thể kiểm tra một vòng truyền trước khi viết chức năng chat. Các bước dưới dùng PowerShell. [Hướng dẫn dựng lại và toàn văn từng tệp](docs/huong-dan-dung-khung.md)

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
│   └── protocol.test.js
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

`time` là giờ UTC do Server gán. `from` là tài khoản gắn với socket và hiện bằng `null` khi chưa đăng nhập. Các lệnh khác trả `ERROR` với `content` bằng `"chưa cài đặt"`. PING chỉ kiểm tra kết nối nên bảng tin nhắn vẫn trống.

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
node test/protocol.test.js
```

- [ ] Server in `listening on 0.0.0.0:5000` và IP LAN.
- [ ] Client cùng máy kết nối `127.0.0.1:5000`, bấm **Gửi PING**, nhận `PING` có `time`.
- [ ] Client máy thứ hai cùng Wi-Fi hoặc hotspot nhận phản hồi khi nhập IP LAN của Server.
- [ ] Đóng đột ngột Client. Server vẫn chạy và trả PING khi mở Client kết nối lại.
- [ ] Kiểm thử giao thức in ba dòng **Đạt** cho gói dính, gói bị cắt và gói vượt giới hạn.

Bước kế tiếp là viết REGISTER và LOGIN bằng bcryptjs, gắn tài khoản vào socket qua `sessions.add`, rồi phát STATE khi đăng nhập, đăng xuất hoặc mất kết nối.
