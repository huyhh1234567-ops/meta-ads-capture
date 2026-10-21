# Spec: region-highlights

## Mục tiêu

Ba tùy chọn độc lập: khoanh Advantage+, TA (Audience/Targeting), Budget.
Chỉ vẽ khung trên ảnh sau chụp, không sửa trang hoặc thiết lập quảng cáo.
Phụ thuộc: capture-recovery cung cấp ảnh hoàn chỉnh và tọa độ ổn định.

## Công nghệ và cấu trúc

JavaScript thuần và canvas hiện có.
`content.js`: tìm vùng; `background.js`: chuyển tọa độ; `offscreen.js`: vẽ khung.
`popup.js`/`popup.html`: tùy chọn; `tests/check.js`: hồi quy. Giữ kiểu UI hiện có, không redesign.

## Lệnh kiểm tra

`node tests/check.js`; `node --check content.js`; `node --check background.js`;
`node --check offscreen.js`; `node --check popup.js`.
Không có bước build; kiểm tra ảnh đầu ra sau Reload/F5 với các checkbox bật/tắt.

## Quy ước code

Giữ tọa độ theo vùng ảnh và scroll offset, như helper hiện tại:

```js
y: scrollTop + top - captureRect.top
```

## Tiêu chí thành công

- Checkbox Advantage+ đang có giữ lựa chọn người dùng; TA/Budget là checkbox mới, mặc định tắt.
- Advantage+ chỉ bao creative enhancements, Essential enhancements, Try it out và creative translation khi thuộc khối đó.
- Không bao Primary text, Headline, Description, CTA, Creative testing hoặc toàn bộ card Ad creative/ảnh.
- Nhiều khối Advantage+: chỉ khoanh khối đầu tiên theo thứ tự từ trên xuống. Không suy đoán thành khung lớn nếu ranh giới không chắc.
- TA khoanh vùng Audience/Targeting của Ad set; không khoanh Estimated audience size bên phải hay preview quảng cáo.
- Budget khoanh vùng ngân sách/lịch ở cấp đang có phần này (Campaign hoặc Ad set), không bao cả trang.
- Mỗi loại chỉ khoanh vùng đầu tiên thích hợp; không có vùng đó thì không vẽ khung sai.
- Tọa độ đúng sau cuộn, crop và khi nguồn ảnh có device pixel ratio khác 1; khung không bị nhân sai kích thước.
- Khi tiếp tục hoặc retry không lặp khung, không giữ tọa độ từ entity trước.
- UI dùng label/checkbox có thể thao tác bằng bàn phím; không cần phụ thuộc mới.

## Kiểm thử

Test nhiều khối Advantage, tiêu đề chứa trong node cha lớn, standalone/embedded/translation và các vùng không liên quan.
Test TA/Budget có/không có, khác cấp, nhiều checkbox, tọa độ crop/scroll/pixel ratio.
Giữ test read-only; kiểm tra hình render thực tế khi có trình duyệt phù hợp. Không coi test DOM giả là xác nhận Meta thực tế.

## Giới hạn

- Luôn: chỉ vẽ trên output, tôn trọng checkbox và giới hạn vùng ảnh.
- Hỏi trước: mở các thiết lập đang thu gọn hoặc thay đổi dữ liệu quảng cáo.
- Không bao giờ: click nút Apply/Try it out/Edit của Meta để tạo khung; chỉnh Audience/Budget.

## Câu hỏi còn mở

Không có câu hỏi phạm vi. Biến thể nhãn và cấu trúc DOM cần kiểm tra lúc triển khai.
