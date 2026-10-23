# Gói chia sẻ: đăng nhập Google và lưu vào Drive của người dùng

Người nhận cài ZIP, chọn Drive, đăng nhập Google một lần qua Apps Script đã đóng gói và dán link thư mục của mình. Không nhập URL webhook/mã bảo vệ và không chia sẻ thư mục cho chủ tool.

- Tạo deployment mới của cùng Apps Script, **Execute as: User accessing the web app**; giữ deployment cũ Execute as Me để link cũ hoạt động.
- HTML Service gọi server bằng `google.script.run`, dùng quyền Google của người đã đăng nhập. Extension không nhận, lưu hoặc đóng gói OAuth token/UPLOAD_TOKEN.
- Bridge chỉ nhận lệnh từ extension, gắn với nonce ngẫu nhiên, tab/frame và URL deployment đã cấu hình; không nhận READY/response từ trang Apps Script khác hoặc phiên cũ. Giữ tab kết nối mở trong khi chụp.
- Chỉ upload PNG hợp lệ, có giới hạn kích thước, vào thư mục mà tài khoản đã đăng nhập có quyền ghi. Không đổi chia sẻ Drive trừ khi checkbox chia sẻ file gốc được bật.
- Link ảnh của chế độ Google chạy bằng quyền người mở: file riêng tư cần đúng tài khoản hoặc được chia sẻ quyền xem. Không hứa link riêng tư sẽ xem được ẩn danh.
- Giữ chế độ webhook cũ trong tùy chọn cấu hình riêng; bản đóng gói không chứa mã bảo vệ cá nhân. Không làm mất checkpoint cũ, đối chiếu cả chế độ Drive và tài khoản khi tiếp tục.
- Kiểm tra server bằng mock hai người dùng, từ chối token/ảnh sai, giao thức bridge có nonce/sender giả, giao diện đăng nhập và các bộ hồi quy cũ. Chỉ gọi là hoạt động trên Google sau khi có một lần đọc tài khoản/thư mục hoặc upload thật thành công.

Nguồn: https://developers.google.com/apps-script/guides/web và https://developers.google.com/apps-script/guides/html/communication.
