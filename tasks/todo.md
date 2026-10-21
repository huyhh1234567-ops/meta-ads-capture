# Tasks — 6.4.0

- [x] 1. entity-navigation: thiếu scrollbar vẫn đọc hàng ổn định; có scrollbar reset/quét đầy đủ; ID và ID cha phân biệt tên trùng. Files: content.js, background.js, tests/navigation-regression.js, tests/check.js. Verify: node tests/check.js; node tests/navigation-regression.js.
- [x] 2. capture-recovery/zoom: giữ DPR/zoom gốc, bớt chờ cố định khi đã tải xong, không bỏ kiểm tra ổn định. Files: background.js, content.js, popup.html, tests/recovery-regression.js. Verify: các test readiness/native scale và node --check.
- [x] 3. capture-recovery/checkpoint: trả kết quả trên từng lỗi, retry 3 lần, resume không upload lại; stop không retry. Files: background.js, popup.js, popup.html, tests/recovery-regression.js, tests/check.js. Verify: node tests/check.js; node tests/recovery-regression.js.
- [x] Checkpoint: full tests và cú pháp không lỗi; kiểm tra bảo vệ không chỉnh quảng cáo đã qua.
- [x] 4. region-highlights: chỉ subsection Advantage; TA/Budget checkbox tắt mặc định; vẽ đúng pixel/crop. Files: content.js, background.js, offscreen.js, popup.js, popup.html. Verify: tests/check.js và tests/highlight-regression.js.
- [x] 5. Rà soát, cập nhật version/docs và kiểm tra UI runtime nếu có. Verify: tất cả test, node --check tất cả file JS; Chrome headless popup dùng fixture riêng, Meta chưa xác nhận.

## Kết quả 12/10/2026

- Legacy suite `tests/check.js`: passed.
- Navigation: 21/21; recovery: 12/12; highlight: 5/5; performance readiness/pending-image/timeout/steady guards: passed.
- `tests/ui-smoke.js`: passed trong Chrome riêng, layout 360/420 px, Copy một phần và resume/new-run flags. Ảnh QA: `output/playwright/popup-partial-resume-6.4.0.png`, `output/playwright/popup-6.4.0.png`.
- Syntax: tất cả JS passed. Mutation review: đảo ưu tiên URL ID lúc đầu chưa bị suite bắt riêng (union vẫn bị single-ID guard chặn); thêm assert nguồn ID chính xác, chạy lại mutation đỏ 20/21, khôi phục production và chạy lại xanh 21/21.
- Không đổi Apps Script, không upload vào tài khoản thật, không thêm quyền/dependency project. Snapshot trước sửa: `D:/meta-ads-capture-backup-b0d5e2d976274ef1a3ec070309219576`.
- Chưa xác nhận trên tài khoản Meta thật: tìm ở DOM thực tế, độ mượt/chụp nền/ảnh khoanh thực tế. Cần Reload extension/F5 Meta và thử lại; số đo thời gian là mô phỏng, không cam kết tương đương Amazing Screenshot.
- Helper retry screenshot cũ không nằm trong vòng batch mới; giữ lại để chưa mở rộng phạm vi sang dọn code cũ. Xem ADR-001.
