# Cải thiện chụp Meta Ads — phạm vi đã chốt

Ngày: 2026-10-11. Nguồn: sáu yêu cầu của người dùng và xác nhận tiếp theo.

| Module | Trách nhiệm | Phụ thuộc | Đặc tả |
|---|---|---|---|
| entity-navigation | Search thẳng tên mục cần xử lý, xác minh ID riêng; không tìm lại cấp cha | — | SPEC-entity-navigation.md |
| capture-recovery | Chụp không đổi zoom; lưu tiến độ; thử lại mục lỗi và trả kết quả tại chỗ | entity-navigation | SPEC-capture-recovery.md |
| region-highlights | Khoanh riêng Advantage+, TA và Budget trên ảnh | capture-recovery | SPEC-region-highlights.md |

Thứ tự: entity-navigation → capture-recovery → region-highlights.
Đây là các phần thay đổi trong extension hiện tại, không phải dịch vụ/module runtime mới.

Điều chỉnh đã xác nhận: không xuất hay tải TXT khi lỗi. Trả kết quả đang có vào ô Copy và giữ tiến độ.
Các đặc tả đã được duyệt và triển khai trong 6.4.0. Kiểm tra tự động và giao diện Chrome riêng đã qua; chụp trên tài khoản Meta thực tế chưa được xác nhận.
