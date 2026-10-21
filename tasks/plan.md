# Plan — chụp ổn định 6.4.0

Phạm vi và đặc tả đã được người dùng chốt, bao gồm không đổi zoom và trả kết quả lỗi vào Copy, không xuất file.

## Thứ tự và quyết định

1. Tái hiện thiếu scrollbar/tên trùng, sửa tại helper tìm/chuẩn bị chung. Giữ ID của từng cha từ cây import; không dùng tên để khẳng định danh tính khi ID đã có.
2. Giữ viewport và mật độ pixel gốc thay vì ép 2×; giảm chờ tối thiểu cho nội dung thật sự ổn định, giữ kiểm tra skeleton/vị trí và cuộn native.
3. Checkpoint trong extension storage, không chứa ảnh base64/token. Retry toàn mục tối đa 3 lần; ghi kết quả ngay sau upload và trước retry. Resume trên tab đang mở, xác minh cấu hình và danh sách trước khi dùng checkpoint.
4. Khoanh Advantage+/TA/Budget bằng tọa độ subsection, trên canvas đầu ra. Ba checkbox độc lập, TA/Budget mặc định tắt.
5. Chạy hồi quy và cú pháp; kiểm tra browser nếu có runtime phù hợp; ghi rõ hạn chế kiểm chứng Meta thực tế.

## Rủi ro

- ID Meta có thể không xuất hiện trong DOM: đọc ID từ link navigation/query đúng cấp; không dùng ID DOM chung hoặc React internals. Mơ hồ thì dừng an toàn.
- Tab nền không render đồng đều: giữ worker waits/readiness checks; không giảm chờ nếu còn loader.
- Browser DevTools MCP chưa có trong phiên: dùng test mô phỏng; không tuyên bố đã xác nhận trên tài khoản Meta.
- Project chưa có Git: giữ snapshot file trước sửa; không tạo repo/push khi chưa có đích GitHub.

Danh sách kiểm tra: tasks/todo.md.
