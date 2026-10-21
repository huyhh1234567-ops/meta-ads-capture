# Spec: capture-recovery

## Mục tiêu

Chụp ổn định mà không đổi mức zoom của tab; không mất kết quả khi một mục thất bại.
Phụ thuộc: entity-navigation để tiếp tục đúng mục và đúng cha.

## Công nghệ và cấu trúc

JavaScript thuần, Chrome MV3, lưu checkpoint bằng extension storage đang có.
`background.js`: vòng chạy/thử lại/checkpoint; `content.js`: chuẩn bị vùng chụp.
`offscreen.js`: ghép ảnh; `popup.js`/`popup.html`: kết quả và tiếp tục; `tests/check.js`: hồi quy.

## Lệnh kiểm tra

`node tests/check.js`; `node --check background.js`; `node --check content.js`;
`node --check offscreen.js`; `node --check popup.js`.
Không có bước build; kiểm tra bằng Reload extension/F5 Meta rồi chụp và gây lỗi cuộn có kiểm soát.

## Quy ước code

Tái sử dụng vòng chạy, trạng thái và ô Copy hiện tại. Ví dụ guard hiện có:

```js
if (await shouldStop(tab.id, sessionId)) throw new Error('__MAC_STOPPED__');
```

## Tiêu chí thành công

- Giữ mức zoom và bố cục hiện tại; không tự zoom trang lên/xuống mỗi lần chụp.
- Không nhầm độ phân giải ảnh với zoom trang. Không phóng ảnh bitmap giả làm ảnh nét; giữ pixel nguồn.
- Có thể giữ kích thước viewport để chạy nền nếu cần, nhưng không thay đổi mức zoom người dùng.
- Lưu danh sách việc, ngữ cảnh ID/cha, kết quả ảnh/preview đã có và mục đang xử lý sau mỗi phần thành công.
- Khi lỗi tìm/chuẩn bị/chụp: cập nhật ngay kết quả đã có ở ô Copy; thử lại đúng mục, tối đa 3 lượt tính cả lượt đầu.
- Ảnh tạm bị hụt hoặc sai cuộn phải bỏ và chụp lại mục đó từ đầu. Không đưa ảnh thiếu vào kết quả hoàn tất.
- Sau lượt thứ ba vẫn lỗi: dừng ở mục đó, hiển thị lỗi và kết quả đã có ngay; không đợi hết danh sách, không nhảy qua mục lỗi.
- Không tạo hay tự tải TXT; không upload báo cáo TXT. Kết quả ở ô Copy, kể cả khi chưa có ảnh nào thành công.
- Có cách tiếp tục từ checkpoint; không chụp/upload lại các mục hay phần ảnh/preview đã thành công.
- Nếu đã upload ảnh nhưng bước preview lỗi, giữ link ảnh để thử tiếp preview mà không tạo ảnh trùng.
- Dừng thủ công không bị coi là lỗi cần thử lại; vẫn giữ kết quả và checkpoint.
- Tiếp tục sử dụng tab hiện tại khi người dùng bấm, không phụ thuộc ID tab đã đóng; cấu hình/danh sách mới không dùng nhầm checkpoint cũ.
- Giữ chức năng Drive/Copy/preview hiện có; không sửa Apps Script đã triển khai.

## Kiểm thử

Test mục đầu thành công rồi mục sau lỗi; lỗi chụp tạm; thành công sau retry; lỗi đủ 3 lượt; stop giữa retry.
Test giữ link ảnh khi preview lỗi, không upload trùng, checkpoint qua lần mở lại giao diện và danh sách thay đổi.
Test zoom trước/sau không đổi; capture mode thường và hàng loạt; ảnh ghép không mất phần cuối.
Kiểm tra thực tế ở tab trước/nền nếu truy cập được, không hứa mượt ngang Amazing Screenshot khi chưa đo.

## Giới hạn

- Luôn: trả kết quả một phần, giữ stop/read-only và khôi phục trạng thái sau chạy.
- Hỏi trước: dịch vụ lưu trữ hoặc quyền mới.
- Không bao giờ: xuất file thay cho Copy, upload token trong checkpoint báo cáo, tự publish quảng cáo.

## Câu hỏi còn mở

Không có câu hỏi phạm vi. Khả năng render của Meta khi tab ở nền cần kiểm tra thực tế.
