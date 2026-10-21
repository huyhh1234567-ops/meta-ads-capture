# Thiết lập Drive webhook trong khoảng 3 phút

1. Mở [script.new](https://script.new) để tạo thẳng một Apps Script project mới.
2. Xóa nội dung mặc định trong `Code.gs`, sau đó copy toàn bộ file `Code.gs` ở thư mục này vào.
3. Đổi `DOI-THANH-MA-RIENG-CUA-BAN` thành một mã riêng, ví dụ một chuỗi dài chỉ bạn biết. Giữ nguyên dấu nháy đơn.
4. Bấm **Deploy > New deployment**.
5. Chọn loại **Web app**.
6. Chọn **Execute as: Me** và **Who has access: Anyone**.
7. Bấm **Deploy**, cấp quyền Google Drive cho chính script của bạn rồi copy URL kết thúc bằng `/exec`.
8. Trong extension, chọn **Drive đơn giản**, dán URL `/exec`, mã bảo vệ và link folder Drive. Bấm **Kiểm tra**.

### Nếu bạn đã deploy Code.gs từ bản tool cũ

Sau khi dán code mới và lưu, chọn **Deploy > Manage deployments > Edit (biểu tượng bút chì) > Version: New version > Deploy**. Không cần tạo URL khác; URL `/exec` cũ vẫn dùng được.

Code mới trả về một link xem ảnh riêng: ảnh tự vừa chiều ngang trình duyệt và cuộn dọc tự nhiên. Mỗi link có thêm chữ ký `sig` được tạo từ File ID và `UPLOAD_TOKEN`; sửa hoặc thay File ID sẽ bị từ chối. File gốc vẫn nằm trong đúng folder Drive, và nút **Mở trong Drive** luôn có trên đầu trang xem.

Sau khi nâng lên 5.4, các link ảnh cũ không có `sig` sẽ không còn mở được. Hãy tạo link mới bằng một phiên chụp mới. Không đổi `UPLOAD_TOKEN` sau khi đã tạo link, vì chữ ký của các link trước đó phụ thuộc vào mã này.

### Nếu Google báo “Google hasn't verified this app”

Đây là cảnh báo bình thường với Apps Script cá nhân đang dùng quyền Google Drive. Chỉ tiếp tục nếu đây đúng là project bạn vừa tạo và code được copy từ file `Code.gs` của tool:

1. Bấm **Advanced**.
2. Bấm **Go to Meta Ads Capture Webhook (unsafe)**; tên hiển thị có thể là tên project bạn đã đặt.
3. Kiểm tra quyền Google Drive rồi bấm **Allow**.

Nếu tài khoản công ty không cho hiện nút tiếp tục, hãy thử bằng Gmail cá nhân hoặc nhờ quản trị viên Workspace cho phép Apps Script.

Nếu tài khoản công ty không có lựa chọn **Anyone**, quản trị viên Google Workspace đang chặn Web App công khai. Có thể thử bằng tài khoản Gmail cá nhân hoặc yêu cầu quản trị viên cho phép.

Không chia sẻ URL Web App kèm mã bảo vệ. Người không có mã sẽ không thể upload vào Drive của bạn.
