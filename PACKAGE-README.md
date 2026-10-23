# Meta Ads Capture — Drive của bạn

1. Giải nén ZIP. Mở `chrome://extensions`, bật Developer mode, chọn **Load unpacked** và chọn thư mục có `manifest.json`.
2. Mở tool, chọn **Google Drive → Đăng nhập Google**. Chọn tài khoản và hoàn tất cấp quyền Google. Giữ tab kết nối mở khi chụp.
3. Dán link thư mục Drive bạn có quyền ghi. Để trống sẽ lưu vào My Drive của tài khoản đã kết nối.
4. Quay lại tab quảng cáo đang mở ở màn Edit, nhập danh sách rồi bấm **Bắt đầu xử lý**.

Gói đã có sẵn địa chỉ dịch vụ Apps Script. Người nhận không phải tự deploy hoặc nhập mã bảo vệ của chủ tool. Extension không lưu OAuth token; Google giữ phiên đăng nhập trong tab kết nối.

Ảnh lưu theo quyền Google của bạn. File riêng tư chỉ xem được bằng tài khoản có quyền truy cập. Nếu muốn người có link xem file gốc, bạn chủ động bật tùy chọn chia sẻ trong tool hoặc chia sẻ trên Drive. Nếu Google/Workspace chặn ứng dụng, cần chủ ứng dụng hoặc quản trị viên cho phép; tool không bỏ qua bước cấp quyền.

Đóng tab kết nối hoặc khởi động lại Chrome: bấm Đăng nhập Google để kết nối lại. Khi tiếp tục phiên chụp, dùng cùng tài khoản và thư mục. Ảnh PNG mặc định tối thiểu 2×; ảnh cũ không tự được chụp lại khi nâng phiên bản.
