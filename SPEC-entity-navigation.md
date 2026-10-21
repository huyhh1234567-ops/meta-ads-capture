# Spec: entity-navigation

## Mục tiêu

Tìm và chọn đúng Campaign/Ad set/Ad mà không phụ thuộc việc nhìn thấy scrollbar.
Không thay đổi thiết lập quảng cáo hoặc chọn một mục chỉ vì nó xuất hiện trước.

## Công nghệ và cấu trúc

Chrome extension Manifest V3, JavaScript thuần, không thêm thư viện.
`content.js`: nhận diện và chọn mục; `background.js`: gửi ngữ cảnh cha.
`popup.js` và `xlsx-parser.js`: giữ ID từ dữ liệu nhập; `tests/check.js`: hồi quy.

## Lệnh kiểm tra

Chạy tại thư mục project: `node tests/check.js`.
Kiểm tra cú pháp: `node --check content.js`, `node --check background.js`, `node --check popup.js`.
Không có bước build. Kiểm tra thực tế bằng Reload extension, F5 tab Meta và chạy danh sách kiểm thử.

## Quy ước code

Giữ helper, kiểu đặt tên và định dạng hai khoảng trắng đang có. Ví dụ:

```js
if (state.stopRequested) throw new Error('__MAC_STOPPED__');
```

## Tiêu chí thành công

- Trừ mục đang mở đã xác minh cả tên, ID và cha, mỗi lần chọn thay tên trong ô Search của cây bên trái và nhấn Enter trước khi đọc kết quả. Không dùng ô Search ngoài cây hoặc ô thiết lập quảng cáo.
- Không có ô Search duy nhất: báo lỗi, không quay lại quét toàn bộ cây.
- Chờ giao diện cập nhật tên Search trước khi Enter; giữ bảo vệ ô thiết lập trong khoảng chờ. Không dùng hàng cha còn lại để kết luận Ad đã tải xong. Khi cấp cần tìm chưa có hàng hoặc cây trống không hiện loading, tiếp tục chờ trong toàn bộ giới hạn tải đã cấu hình.
- Không có vùng cuộn: đọc các kết quả đã lọc, kể cả kết quả rỗng ổn định; không ném lỗi chỉ vì thiếu scrollbar.
- Có vùng cuộn: đưa danh sách kết quả đã lọc về đầu và quét đến cuối nếu cần; không quét cây chưa lọc. Chờ hàng virtualized tải ổn định.
- Nếu không có scrollbar nhưng danh sách còn đang tải, chờ theo giới hạn cấu hình; không coi danh sách chưa tải là đã tìm hết.
- Ưu tiên Campaign ID, Ad set ID, Ad ID thật cùng ngữ cảnh cha; không coi mọi `data-id` số là ID quảng cáo.
- ID DOM `ads_campaign_structure_item_<số>` chỉ có hiệu lực khi hàng điều hướng có nhãn đúng cấp Campaign/Ad set/Ad.
- ID import `cg:<số>` (Campaign), `as:<số>` hoặc `c:<số>` (Ad set), `ad:<số>` hoặc `a:<số>` (Ad) được chuẩn hóa thành chuỗi số khi so sánh, kể cả ID cha. Không chuyển ID qua Number; không bỏ tiền tố không biết hoặc tiền tố của cấp khác để cố khớp. Giữ nguyên ID/UID nguồn và checkpoint.
- Vẫn điều hướng đúng cha khi bỏ tick chụp Campaign/Ad set. Tên giống nhau dưới các cha khác nhau không bị trộn.
- Hai mục cùng tên dưới cùng cha: dùng ID để phân biệt khi có dữ liệu xác minh. Nếu không đủ ID, báo cần ID/ngữ cảnh, không chọn bừa.
- Xác minh mục vừa mở trước khi chụp, không nhập vào ô naming, Gender hay Budget để tìm mục.
- Dừng luôn có tác dụng cả khi chờ tải hoặc quét danh sách.

## Kiểm thử

Thêm test tái hiện thiếu scrollbar, danh sách ngắn, danh sách đang tải, quét dài và tên trùng ở cả ba cấp.
Kiểm tra ID đúng/sai/không có và cùng tên khác cha; giữ toàn bộ test read-only hiện có.
`node tests/browser-name-search.js`: Chrome riêng kiểm tra thay tên liên tiếp, Enter, chờ tải, ID điều hướng, tên trùng, kết quả rỗng, Stop và không nhập vào ô thiết lập.
Kiểm tra Meta thực tế nếu truy cập được; phân biệt rõ kết quả mô phỏng và kiểm tra thực tế.

## Giới hạn

- Luôn: xác minh danh tính; giữ dữ liệu nhập của người dùng; kiểm tra hồi quy.
- Hỏi trước: thêm API/quyền truy cập hoặc phụ thuộc mới.
- Không bao giờ: đổi quảng cáo, publish, bypass xác minh khi tên trùng, đưa token vào báo cáo.

## Câu hỏi còn mở

Không có câu hỏi về phạm vi. Mức độ ID xuất hiện trong DOM Meta cần kiểm tra lúc triển khai.
