# Chat TCP trên hai máy cùng Wi-Fi

Cả hai máy dùng **Node.js 22 x64** (`node -v` hiện `v22.x`), có cùng mã nguồn và mở PowerShell tại thư mục `chat_project`.

## Máy A · Chạy server

```powershell
npm.cmd --prefix server ci      # chỉ lần đầu
npm.cmd --prefix server start
```

Giữ cửa sổ này mở. Ghi IPv4 ở dòng **IP LAN (Wi-Fi)** cho máy B. Server tự tạo SQLite tại `server/data/chat.db`.

## Cả hai máy · Mở giao diện chat

Chạy trên cả hai máy. Trên A, dùng cửa sổ PowerShell **thứ hai**.

```powershell
npm.cmd --prefix client ci      # chỉ lần đầu
npm.cmd --prefix client start
```

| Trong **Kết nối máy chủ** | Địa chỉ IP | Cổng |
| --- | --- | --- |
| Client trên A | `127.0.0.1` | `5000` |
| Client trên B | IPv4 Wi-Fi của **A** | `5000` |

Bấm **Kết nối** → **Đăng ký** → **Đăng nhập**. Dùng hai tài khoản khác nhau, mật khẩu ít nhất 8 ký tự.

## Kiểm tra

- **Demo nhanh.** Gửi tin A → B, đóng client B, chờ A thấy B **Ngoại tuyến** rồi gửi thêm một tin. Mở lại B, kết nối, đăng nhập và mở chat với A. B phải thấy tin đúng một lần và A thấy **Đã xem**.
- **Test tự động trên A.** `npm.cmd --prefix server test`.
- [Kịch bản demo nhóm, tệp, ghi âm và xử lý lỗi kết nối](docs/demo-lan.md)
