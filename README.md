# Meta Ads Capture & Link Mapper 6.6.3

## Bản 6.6.3 — chờ đúng cây kết quả Search, 22/10/2026

- Chỉ nhận vùng cuộn, hàng và loading trong cây `campaign_structure_tree_root` sau Search. Khung cuộn hoặc loading khác bên trái không còn khiến tool báo danh sách chưa ổn định khi kết quả đã sẵn sàng.
- Giữ nguyên đối chiếu tên đầy đủ và ID riêng trước khi chụp. Tên trùng, sai ID hoặc loading trong chính cây vẫn phải được xử lý an toàn.
- Lỗi chờ giữ nguyên nguyên nhân Search thay đổi hoặc số hàng/mẫu ổn định/trạng thái loading, thay vì gộp tất cả thành cùng một thông báo.

Cập nhật: Reload extension → F5 Meta → **Tiếp tục từ mục chưa xong**. Checkpoint và Apps Script giữ nguyên.

Kiểm chứng: Chrome riêng tái hiện đúng thông báo lỗi khi có khung cuộn và loading ngoài cây Search; ca này thất bại trước sửa và đạt sau sửa, cả khi có ID và chỉ có tên duy nhất. Kiểm tra thêm loading thật, Search bị thay đổi, sai ID, tên trùng và Stop. Trên Meta thật đã mở được Ad set bằng bấm hàng; chưa chạy chụp/upload bằng bản sửa. Công cụ trình duyệt chặn trang quản lý extension nên cần người dùng Reload bản mới để kiểm chứng tiếp.

## Bản 6.6.2 — tìm thẳng mục cần xử lý theo tên và ID, 22/10/2026

- Mỗi mục được tìm trực tiếp bằng tên riêng rồi đối chiếu ID của chính mục đó. Xử lý Ad không tìm/mở lại Campaign và Ad set trước; xử lý Ad set không tìm/mở Campaign trước. Retry và tiếp tục phiên cũng chỉ tìm mục chưa xong.
- Campaign/Ad set chỉ được tìm khi chính cấp đó có mục cần chụp. Cấp bị bỏ tick vẫn là tiêu đề trong Copy, không tạo thao tác tìm kiếm riêng. Các mục đã hoàn tất không bị chụp/upload lại.
- Kết quả Search không cần hiển thị hàng cha hoặc có cha đã chọn đúng từ trước. ID riêng của mục quyết định hàng cần mở; vẫn kiểm tra lại tên và ID trên màn Edit trước khi chụp. Nếu thiếu ID, tên đầy đủ phải duy nhất trong kết quả; tên trùng cần ID, không dùng ID cha để đoán Ad.

Cập nhật: Reload extension → F5 Meta → **Tiếp tục từ mục chưa xong**. Không cần import lại hay Deploy lại Apps Script.

Kiểm chứng: hồi quy điều phối kiểm tra chỉ tìm Ad khi cấp cha bị tắt, mỗi cấp được bật chỉ tìm một lần, và retry/resume chỉ tìm Ad chưa xong. Chrome riêng kiểm tra hai Ad liên tiếp bằng ID với hàng cha ẩn và đường dẫn cha cũ. Chưa chạy toàn bộ chụp/upload bằng bản mới trên tài khoản Meta thật.

## Bản 6.6.1 — chờ tên Search và Ad con tải xong, 21/10/2026

- Tách nhập tên và Enter thành hai lượt xử lý. React có thời gian cập nhật tên mới, tránh áp dụng lại bộ lọc của Campaign/Ad set trước đó. Quyền nhập chỉ mở cho đúng ô Search trong từng thao tác; không mở trong lúc chờ.
- Khi tìm Ad, một hàng Ad set đang hiện chưa được coi là kết quả đã tải xong. Chờ đúng cấp cần tìm trong giới hạn thời gian cấu hình, kể cả khi Meta giữ hàng cha hoặc tạm xóa cây mà không hiện loading. Chỉ kết luận thiếu kết quả sau khi đã chờ hết giới hạn nếu cấp đó vẫn chưa xuất hiện.
- Giữ xác minh tên đầy đủ, ID, nhóm cha, giới hạn ba lần thử và checkpoint cũ. Không cần sửa tên import hoặc Deploy lại Apps Script.

Cập nhật: Reload extension → F5 tab Meta → **Tiếp tục từ mục chưa xong**.

Kiểm chứng: `node tests/browser-name-search.js` tái hiện lỗi React cập nhật truy vấn trễ và ca `New Launch 264 - drop 2_Female` chỉ có hàng Ad set trước khi Ad tải sau 2,6 giây. Hai ca đều thất bại trước sửa và đạt sau sửa. Đã đọc cây Meta thực tế để xác nhận Ad tồn tại; chưa chạy lại toàn bộ chụp/upload bằng bản mới trên tài khoản thật.

## Bản 6.6.0 — tìm theo tên trước khi chọn, 21/10/2026

- Mỗi lượt chọn Campaign/Ad set/Ad nhập tên đầy đủ vào ô **Search** của cây bên trái rồi nhấn Enter. Chờ kết quả tải ổn định, đối chiếu đúng tên, ID và nhóm cha, sau đó mới chụp/lấy link. Mục tiếp theo thay thế tên tìm kiếm cũ.
- Chỉ quét các kết quả đã lọc khi chúng còn dài; không quét toàn bộ cây trước khi tìm. Khi không xác định được ô Search duy nhất hoặc kết quả chưa tải xong, tool báo lỗi để thử lại, không nhập vào ô thiết lập quảng cáo khác.
- Tiếp tục giữ kiểm tra tên trùng, ID import và checkpoint. Nhận thêm ID điều hướng `ads_campaign_structure_item_<ID>` khi hàng có nhãn đúng cấp; `data-id` chung vẫn không được coi là ID quảng cáo.

Cập nhật: Reload extension → F5 tab Meta → mở cây bên trái có ô Search → chạy hoặc tiếp tục danh sách. Không cần Deploy lại Apps Script.

Kiểm chứng: `node tests/browser-name-search.js` chạy Chrome riêng với DOM mô phỏng (dùng `MAC_PLAYWRIGHT_PATH` như các browser test khác): thay tên liên tiếp, Enter, chờ tải, kết quả rỗng, tên trùng, sai ID, Stop và bảo vệ ô thiết lập. Đã kiểm tra trực tiếp ô Search trên Meta cần Enter để lọc; chưa chạy toàn bộ chụp/upload bằng extension mới trên tài khoản thật.

## Bản 6.5.0 — cửa sổ tiến độ nhỏ, 12/10/2026

- Khi bắt đầu hoặc tiếp tục chụp (kể cả Ctrl + Shift + F), mở một cửa sổ tiến độ riêng. Dòng trạng thái hiện phía trên thanh progress, có phần trăm và nút **Về tab đang chụp** / **Dừng**. Khung không lấy tiêu điểm khỏi tab Ads khi mở.
- Khi tool đang thử lại, hiện trạng thái và lời nhắc đỏ **chuyển về tab đang chụp, giữ tab ở phía trước để trang tải tiếp**. Lời nhắc giữ trong suốt lượt thử lại và tắt khi mục hoàn tất hoặc phiên dừng. Đây là nhắc hỗ trợ, không khẳng định mọi lỗi thử lại đều do chạy nền.
- Kéo thanh tiêu đề Windows để di chuyển, kéo mép/góc cửa sổ để đổi kích thước; có nút **Thu gọn / Mở rộng**. Lượt chụp kế tiếp dùng lại khung đang mở, giữ vị trí/kích thước người dùng đã chỉnh. Đóng khung không dừng phiên; chỉ nút **Dừng** gửi yêu cầu dừng.
- Checkbox ẩn giao diện chỉ đóng Side Panel; cửa sổ tiến độ vẫn hiện. Không inject khung vào trang Meta nên không làm khung lọt vào ảnh. Khung là cửa sổ Chrome thường, không có chế độ always-on-top và có thể bị cửa sổ khác che; không hứa khắc phục hoàn toàn việc Meta ngừng tải ở nền.
- Tiến độ cập nhật qua sự kiện storage, không poll liên tục. Chỉ truy vấn context của extension để tìm khung cũ, không thêm quyền đọc tất cả tab. Bản này không đổi cuộn/chụp/ghép ảnh, ngân sách/đối tượng quảng cáo hoặc Apps Script.

Cập nhật: Reload extension → F5 tab Meta → Bắt đầu hoặc **Tiếp tục từ mục chưa xong**. Không cần Deploy Apps Script. Checkpoint vẫn dùng schema 6.4.0.

Kiểm chứng: `node tests/progress-regression.js` và `node tests/progress-ui-smoke.js` (Chrome riêng, API extension mô phỏng, `MAC_PLAYWRIGHT_PATH` như các browser test khác) kiểm tra lifecycle, không lấy focus, cảnh báo thử lại, cập nhật, nút về tab, thu/phóng, dừng, lỗi tab đóng và layout 320/768/1024/1440 px. Chưa kiểm chứng cửa sổ native trên tài khoản Meta thực tế. API dùng theo tài liệu [Chrome windows](https://developer.chrome.com/docs/extensions/reference/api/windows), [runtime.getContexts](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-getContexts) và [tabs.update](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-update).

## Bản 6.4.4 — sửa đoạn cuối khi ghép ảnh, 12/10/2026

- Ảnh lỗi thực tế cho thấy đã mở đúng Ad set; thông báo là “Ảnh chưa phủ hết nội dung”, không phải lỗi ID. Trang ghép ảnh thiếu khai báo UTF-8 khiến thông báo bị vỡ dấu; đã thêm khai báo và kiểm tra bằng Chrome riêng không có HTTP charset.
- Không kết thúc chỉ vì thanh cuộn báo gần đáy (sai số 5 px). Nếu ảnh còn thiếu hơn 2 px, cuộn tới đáy thật, chờ ổn định rồi chụp nốt. Không thêm đoạn khi ảnh cuối đã đủ.
- Nếu chiều cao nội dung giảm giữa các đoạn, bỏ ảnh tạm để cơ chế thử lại chụp từ đầu, không ghép các chiều cao cũ/mới. Không coi phản hồi cuộn tới đáy là một ảnh đã chụp.
- Giữ kiểm tra thiếu ảnh. Khi vùng nội dung bị che hoặc không cuộn được, thông báo có số pixel còn thiếu, chiều cao nội dung/khung cuộn/vùng chụp để xác định lỗi còn lại.
- Reload extension, F5 Meta rồi bấm **Tiếp tục từ mục chưa xong**. Checkpoint 6.4.0 và ảnh đã hoàn tất giữ nguyên. Apps Script không đổi, không cần Deploy lại.

Kiểm chứng: `node tests/stitch-coverage-regression.js` tái hiện đoạn cuối thiếu 3 px, nội dung co lại, cuộn bị kẹt và vùng chụp bị che; `tests/browser-stitch.js` kiểm tra dấu tiếng Việt, adapter cuộn tới đáy và pixel cuối ảnh ở DPR 2 bằng Chrome riêng (dùng `MAC_PLAYWRIGHT_PATH` như các browser test khác). Các lỗi đã tái hiện trước sửa. Chưa kiểm chứng trực tiếp trên tài khoản Meta của người dùng; ảnh hiện tại không cung cấp đủ số đo để xác định trường hợp hình học cụ thể.

## Bản 6.4.3 — bổ sung ID Ad a:, 12/10/2026

- Nhận thêm ID Ad `a:<số>` trong file import thực tế; không coi file của người dùng là sai vì tiền tố này. ID vẫn giữ nguyên dạng chuỗi, đối chiếu đủ chữ số với màn Edit và đúng cha.
- Kiểm tra toàn bộ bộ tiền tố được hỗ trợ: Campaign `cg:`, Ad set `as:`/`c:`, Ad `ad:`/`a:`. Chỉ một danh sách theo cấp quyết định tiền tố hợp lệ, không duy trì một whitelist thứ hai trong biểu thức đọc ID.
- Giữ nguyên dữ liệu import, UID và checkpoint. Reload extension, F5 Meta, bấm **Tiếp tục từ mục chưa xong**; không cần import lại hoặc Deploy lại Apps Script.
- Test tái hiện ID `a:120256468858400602`, ID khác, tên trùng, tiền tố sai cấp và chuỗi điều hướng `cg:` → `c:` → `a:`. Kiểm tra Chrome riêng với DOM mô phỏng, chưa xác nhận trên tài khoản Meta thực tế.

## Bản 6.4.2 — bổ sung ID Ad set c:, 12/10/2026

- Nhận thêm ID Ad set `c:<số>` xuất hiện trong file import thực tế. Cùng quy tắc đối chiếu chuỗi số được áp dụng cho ID cha khi mở Ad con và khi tiếp tục từ checkpoint cũ.
- Giữ xác minh ID thật trên Meta; ID khác, tiền tố không biết hoặc tiền tố sai cấp vẫn bị từ chối. Không yêu cầu sửa file import.
- Reload extension, F5 tab Meta rồi bấm **Tiếp tục từ mục chưa xong**. Apps Script không đổi và không cần Deploy lại.
- Kiểm chứng: test tái hiện đúng ID lỗi `c:120256368566560602`, tên trùng, hàng thiếu ID, sai ID màn Edit và ID cha; kiểm tra Chrome riêng với DOM mô phỏng. Chưa xác nhận trên tài khoản Meta thực tế.

## Bản 6.4.1 — sửa ID import, 12/10/2026

- ID Campaign có tiền tố `cg:` được đối chiếu đúng với ID số trên Meta; tương tự `as:` cho Ad set và `ad:` cho Ad. ID luôn giữ dạng chuỗi để không mất chữ số.
- Chuẩn hóa cả ID cha và ID trong navigation/URL trước khi xác minh. Sai ID số hoặc tiền tố không đúng cấp vẫn dừng; không bỏ kiểm tra danh tính hay chọn gần đúng.
- File import và checkpoint cũ giữ nguyên; có thể bấm **Tiếp tục từ mục chưa xong** sau khi Reload extension và F5 tab Meta. Checkpoint vẫn dùng schema 6.4.0, không phải mã content đang chạy.
- Apps Script và giao thức upload **không thay đổi**, không cần Deploy lại. Lỗi ID này xảy ra trước bước upload.

Kiểm thử: `node tests/navigation-regression.js` kiểm tra ID có tiền tố ở ba cấp, ID cha, ID khác, tiền tố sai và ID dài vượt độ chính xác của Number. `tests/browser-id-prefix.js` là kiểm tra Chrome riêng tùy chọn với DOM mô phỏng, dùng cùng `MAC_PLAYWRIGHT_PATH` như UI smoke; chưa kiểm chứng trên tài khoản Meta thực tế.

## Bản 6.4.0 — cập nhật 12/10/2026

- Không có thanh cuộn bên trái: tìm trong danh sách đang hiển thị, không báo lỗi chỉ vì thiếu scrollbar. Có thanh cuộn: mỗi lượt tìm bắt đầu ở trên cùng và quét tới cuối nếu cần.
- Tên trùng: dùng Campaign/Ad set/Ad ID và ID cha từ file import, đối chiếu với ID thật trong navigation hoặc URL Edit đúng cấp. Không dùng `data-id` chung. Khi không có ID, phải quét đủ để xác định tên là duy nhất; trường hợp mơ hồ sẽ dừng, không tự chọn gần đúng hoặc đổi tên.
- Lỗi tìm/chuẩn bị/chụp/upload/preview: thử tối đa **3 lượt tổng cộng cho mục đó**, rồi dừng tại mục lỗi. Kết quả đã có xuất hiện ngay trong **Copy**, không xuất hoặc tải TXT. Dừng thủ công không tự thử lại.
- Thêm **Tiếp tục từ mục chưa xong**. Giữ cùng tài khoản, danh sách và cài đặt đầu ra; có thể tăng thời gian chờ. Dùng tab đang mở khi bấm tiếp tục. Ảnh đã upload thành công không bị chụp/upload lại khi chỉ thiếu preview. Các cấp cha vẫn được chọn đúng trước Ad, kể cả khi bỏ tick chụp Campaign/Ad set.
- Checkpoint lưu cục bộ trong extension, không chứa token hoặc ảnh base64. Bắt đầu một lượt mới sẽ thay checkpoint cũ. Nếu đổi danh sách/tài khoản/cài đặt đầu ra, khôi phục cài đặt cũ để tiếp tục hoặc bắt đầu lượt mới; kết quả Copy cũ không bị xóa bởi yêu cầu tiếp tục bị từ chối.
- Giữ nguyên zoom và DPR của tab, bỏ ép render tối thiểu 2×. Ảnh giữ pixel nguồn, không phóng bitmap để giả tăng độ nét. Chế độ Nhanh trên Meta chờ ít nhất 0,6 giây khi có ba mẫu ổn định; ảnh đang tải vẫn phải chờ, kể cả khi Campaign recommendations còn loader cố định.
- Khoanh **Advantage+** chỉ trong subsection đầu tiên, không dùng cả Ad creative/ảnh làm khung. Thêm hai checkbox độc lập **Khoanh TA / Đối tượng** (Ad set) và **Khoanh ngân sách** (Campaign/Ad set), tắt mặc định. Chỉ vẽ trên ảnh đầu ra; không bấm Edit/Try/Apply hoặc đổi quảng cáo. Nếu không xác định được vùng an toàn thì không khoanh cả trang để thay thế.

### Cách cập nhật

Reload extension tại `chrome://extensions`, sau đó F5 tab Meta một lần. Không cần Deploy lại Apps Script. Khi lỗi, mở tool để Copy phần đã hoàn tất hoặc bấm **Tiếp tục từ mục chưa xong**; **Bắt đầu xử lý** luôn tạo lượt mới.

### Kiểm chứng

Chạy `node tests/check.js`, `node tests/navigation-regression.js`, `node tests/recovery-regression.js`, `node tests/highlight-regression.js`, `node tests/performance-regression.js` và kiểm tra cú pháp các file JS. `tests/ui-smoke.js` là kiểm tra tùy chọn bằng Playwright có sẵn, dùng Chrome headless riêng và API extension mô phỏng, không truy cập tài khoản Ads.

Các kiểm tra trên đã qua. Chưa kiểm chứng chụp nền/độ mượt trên tài khoản Meta thực tế; không cam kết tương đương Amazing Screenshot. Số đo chờ 1.280 → 600 ms là mô phỏng readiness ổn định, không phải thời gian tổng của một ảnh hay số đo khung hình trên Meta thật. Xem [PERF.md](PERF.md) và [quyết định triển khai](docs/decisions/001-capture-resume-native-pixels.md).

Các phần bên dưới là lịch sử các phiên bản cũ; những thay đổi 6.4.0 ở trên thay thế các thiết lập cũ như ép 2× và tự tải TXT.

Chrome Extension Manifest V3 dùng cho Meta Ads Manager. Tool cuộn bằng **scrollbar ngoài cùng của màn hình Edit**, chụp từng đoạn và ghép thành một ảnh dài hoàn chỉnh. Sau đó tool chọn Ad kế tiếp trong danh sách bên trái và tự lặp lại. Mỗi Ad được map với một ảnh dài và một link riêng.

Bạn có thể dán danh sách tên thủ công hoặc nhập thẳng file `.xlsx`, CSV, TSV/TXT export từ Facebook. File Excel không cần mở hay Save As lại. Khi file có các cột ID và tên, tool tự dựng cây Campaign → Ad set → Ad, khử trùng theo ID và chụp đúng thứ tự đang hiển thị trong trình quản lý cây.

Không còn thiết lập số lượng Ad riêng: nếu danh sách có 5 tên, tool chụp đủ 5 tên. Nếu danh sách để trống, tool chỉ chụp Ad đang mở hiện tại và không tự chuyển sang Ad khác.

Tool phân biệt hàng Ad Set cha với hàng Ad creative con. Chỉ hàng Ad con có màn hình **Ad name** mới được chụp; scrollbar được lấy trực tiếp từ mép phải ngoài cùng của cửa sổ Edit.

Bản 4.1.6 dùng selector thực tế của Meta: `[role="rowheader"][aria-label="Ad"]` cho hàng creative và `[role="grid"]` cho danh sách virtualized. Lệnh dừng được lưu trong extension storage và gửi đồng thời vào content script, nên vẫn hoạt động nếu Side Panel hoặc service worker được mở lại trong lúc chạy.

Bản 4.2 có ba danh sách Campaign, Ad Set và Ad. Tool dùng selector `aria-label="Campaign"`, `aria-label="Ad set"` và `aria-label="Ad"`, matching tương đối rồi chụp lần lượt cả ba cấp. Sau mỗi lần chuyển mục, mọi scrollbar ngoài cùng của màn hình Edit được ép về đầu trước khi capture.

Bản 4.3 bỏ hoàn toàn Google Cloud OAuth Client ID. Upload Drive dùng một Google Apps Script Web App do chính bạn sở hữu: extension gửi ảnh cùng mã bảo vệ tới webhook, script lưu ảnh vào folder được chọn và trả link xem lại.

Bản 4.4 đọc trực tiếp file Meta export `.xlsx`, kể cả file có khai báo `styles.xml` không chuẩn. Tool dùng Campaign ID, Ad Set ID và Ad ID để dựng cây, khử trùng từng cấp rồi cho phép kéo thả thứ tự trước khi capture. Cây này đồng thời quyết định cấu trúc báo cáo. Scrollbar ngoài cùng được reset và kiểm tra nhiều lần trước mỗi ảnh; nút dừng cũng phục hồi được trạng thái khi service worker bị Chrome khởi động lại.

Bản 4.5 chờ đến khi nội dung Meta thực sự ổn định trước mỗi ảnh, chụp các đoạn chồng nhau để không mất nội dung khi lazy-load, và dừng có thông báo nếu Meta tải quá thời gian cho phép. Link ảnh Drive mới mở bằng trang xem vừa chiều ngang, không còn bị Chrome thu nhỏ toàn bộ ảnh dài trên nền đen.

Bản 4.5.1 đưa báo cáo cuối về định dạng TXT gọn nhẹ theo yêu cầu.

Bản 4.6 nhận diện thêm thẻ sticky **Estimated audience size** ở cấp Ad set, vì vậy thẻ này chỉ xuất hiện trong đoạn đầu thay vì lặp lại dọc ảnh ghép. Ở cấp Ad, tool có thể tự mở **Share previews → Share a link**, đọc hoặc bắt link từ nút Copy rồi ghi `Preview:` ngay dưới Ad tương ứng trong file TXT.

Bản 4.6.1 sửa lỗi nhận diện nhầm cấp sau khi ảnh dài đã cuộn đến cuối trang. Tool dùng chính cấp của mục đang chụp, tự đưa scrollbar ngoài cùng về đầu rồi mới lấy link preview, nên không còn báo sai `Link preview chỉ có ở cấp Ad` cho ảnh Ad.

Bản 4.7 thêm tùy chọn **Rút gọn link trong TXT** để rút gọn cả link ảnh Drive và link preview Meta. Link gốc vẫn được giữ trong dữ liệu kết quả; nếu dịch vụ rút gọn chậm, giới hạn hoặc lỗi mạng thì TXT tự dùng link gốc và phiên chụp vẫn hoàn tất.

Bản 4.7.1 thay is.gd bằng API CleanURI miễn phí, không cần API key, do một số mạng doanh nghiệp chặn hoặc không mở được tên miền is.gd.

Bản 4.8 loại bỏ hoàn toàn chức năng short link và mọi quyền truy cập dịch vụ rút gọn. TXT dùng link gốc từ Drive/Meta. Bước lấy preview không còn bắt buộc tiêu đề `Ad preview` phải đang hiển thị: tool tự bật preview nếu cần, chờ nội dung tải và ưu tiên nút `Share` ở vùng điều khiển phía trên.

Bản 4.9 sửa chế độ chạy nền: các khoảng chờ cuộn/lazy-load được thực thi bởi service worker thay vì timer trong tab Meta, tránh bị Chrome throttling khi người dùng chuyển tab. Phiên debugger cũng giữ lifecycle, focus giả lập và trạng thái người dùng hoạt động cho tới khi chụp xong, sau đó tự khôi phục.

Bản 5.0 từng hỗ trợ hai tab Ads Manager chạy đồng thời; chức năng này đã được gỡ ở bản 6.0 để tập trung độ ổn định cho một tab.

Mỗi cấp Campaign, Ad set và Ad có checkbox **Chụp**. Bỏ tick cấp nào thì mọi mục ở cấp đó được loại khỏi hàng đợi nhưng nội dung trong ô và file import vẫn được giữ để bật lại sau. Khi cha bị bỏ tick mà con vẫn bật, con được tự nâng lên trong cấu trúc TXT thay vì bị mất.

Bản 5.1 thêm tùy chọn **Lưu ý Advantage+**. Khi bật, tool tìm thẻ `Advantage+ creative` trong từng Ad, tính đúng vị trí của thẻ trên ảnh dài sau khi cuộn/ghép và vẽ khung đỏ vào PNG cuối. Campaign và Ad set không bị đánh dấu.

Bản 5.2 dùng link trang xem Apps Script cho ảnh Drive thay vì link PNG thô. Trang mở mặc định ở chế độ **Vừa chiều ngang** để ảnh dài dễ đọc và cuộn dọc tự nhiên; người xem có thể chuyển sang **Kích thước gốc** hoặc mở file trong Drive. Thay đổi này cần cập nhật `Code.gs` và Deploy lại Web App.

Bản 5.3 giải mã link chuyển hướng `l.facebook.com/l.php?u=...` và chỉ ghi link preview chính chủ dạng `https://fb.me/adspreview/facebook/...` vào TXT. Webhook ping cũng trả cờ `viewer: true`; extension từ chối Code.gs cũ để không tạo link ảnh chỉ mở ra JSON trạng thái.

Bản 6.2.3 tự chuyển URL Apps Script theo miền Workspace dạng `/a/ten-mien/macros/s/.../exec` về URL Web App chuẩn `/macros/s/.../exec`. Dạng theo miền có thể trả 404 hoặc trang đăng nhập cho extension dù deployment vẫn hoạt động. Thông báo lỗi webhook cũng phân biệt rõ deployment không tồn tại, Web App yêu cầu đăng nhập và dữ liệu upload quá lớn.

Bản 6.2.4 kiểm tra Web App bằng GET ổn định thay cho POST qua link googleusercontent dùng một lần, tránh báo nhầm deployment không tồn tại. Ở cấp Campaign, tool nhận biết nội dung chính đã sẵn sàng dù khung Campaign recommendations còn tự cập nhật; scrollbar bị Meta thay thế giữa chừng cũng được nhận diện lại trước khi cuộn.

### Bản 6.3.0

- Khóa thao tác vào input, Gender/radio, checkbox, switch và dropdown thiết lập khi đang chụp. Navigation chỉ click hàng ở cây bên trái; Share phải ở đúng toolbar, đóng hộp thoại phải có nhãn rõ. Bỏ fallback bấm nút góc phải theo tọa độ. Không tự bật switch Ad preview; hãy bật nó trước nếu cần lấy Preview.
- Tìm tên hỗ trợ nhãn tiếng Việt, tên đầy đủ trong tooltip/aria và nội dung lá. Quét scrollbar thực tế của cây thay vì giả định grid luôn cuộn. ID trong file import được chuyển vào bước tìm và ưu tiên khi có trong DOM; tên đầy đủ vẫn được xác minh trong màn Edit trước khi chụp. Nếu Meta không cung cấp ID trong DOM, không coi đó là đã xác minh bằng ID.
- Advantage+ chọn khối đầu tiên theo thứ tự dọc, kể cả khối nằm dưới viewport. Khi có nhiều khối, chỉ vẽ một khung đỏ. Nếu khối bị Meta gỡ khỏi DOM tới khi cuộn xuống, tool dùng khối đầu tiên xuất hiện trong lượt quét từ trên xuống.
- Chạy nền giữ viewport cố định, kiểm tra vị trí trước/sau screenshot và chụp lại mục đó nếu trang bị cuộn/đổi kích thước. Bỏ phát sự kiện focus/resize lặp lại mỗi lần chờ. Chrome phải tiếp tục mở; không đảm bảo hoạt động khi máy ngủ hoặc Chrome bị hệ điều hành treo.
- Sửa ảnh cuối bị bóp dọc khi ghép: cắt nguồn và đích với cùng chiều cao. Báo lỗi nếu ảnh chưa chụp hết hoặc vượt chiều cao canvas, không trả ảnh thiếu như hoàn tất.
- Google Ads: chọn nền tảng Google Ads, mở màn cần chụp và chọn cấp Campaign/Ad group/Ad. Để trống danh sách để chụp màn hiện tại, hoặc nhập mỗi dòng `Tên màn | https://ads.google.com/...` để tự mở và chụp lần lượt trên một tab. Dùng chung Drive, Copy, Stop và phím tắt. Mở sẵn các mục thu gọn cần chụp. Bản này chưa tự tìm entity từ file export Google, tự mở các thiết lập thu gọn hoặc lấy preview Google.

Sau khi tải lại extension, **F5 tab Meta/Google một lần** để dùng mã mới. Không cần Deploy lại Apps Script. Kiểm tra hồi quy bằng `node tests/check.js`.

### Bản 6.3.10

- Khung đỏ Advantage+ lấy vùng con từ tiêu đề creative enhancements, không ôm toàn bộ Ad creative chứa Primary text, Headline, Description và CTA phía trên. Giữ bố cục standalone Advantage+ creative và vẫn chọn khối đầu tiên.
- Bao gồm Essential enhancements, Try it out và phần creative translation/Turned on/Edit khi có; giới hạn cuối ở điều khiển của phần đó, không kéo tới Creative testing, Tracking, Conversions hoặc khối Advantage tiếp theo. Translation riêng không được nhận nhầm thành một khối mới. Không thay đổi DOM hay thiết lập quảng cáo; chỉ vẽ trên ảnh đã ghép.
- Kiểm tra mô phỏng đã tái hiện lỗi khung cha quá lớn và kiểm tra subsection, nhiều khối, translation dạng sibling, trường hợp không có translation, tọa độ sau cuộn và tùy chọn bật/tắt. Chưa xác nhận trên Meta thực tế.
- Reload extension và F5 tab Meta một lần; không cần Deploy lại Apps Script. Ảnh cũ cần chụp lại để có khung mới.

### Bản 6.3.9

- Nhận diện Share previews trong cả toolbar một hàng và hai hàng. Dùng hàng Review defaults trong đúng card Ad preview thay vì yêu cầu Share nằm cùng hàng với tiêu đề. Hỗ trợ nút chỉ có biểu tượng mũi tên + dropdown; không chọn nút phóng to, nút vô hiệu hóa, nút ngoài card hoặc nhiều ứng viên không phân biệt được.
- Luồng Share a link chờ theo thời gian tải cấu hình và dọn menu/hộp thoại cả khi lỗi hoặc Dừng. Đọc URL từ hộp thoại hiện tại hoặc thao tác Copy, không tìm link preview cũ ở toàn trang; loại URL không thuộc preview Meta. Link bọc l.facebook.com được trả về dạng fb.me/adspreview/facebook/… gốc.
- Kiểm tra mô phỏng đã tái hiện nút bị bỏ sót ở toolbar hai hàng và kiểm tra đầy đủ Share → Share a link → Copy/đọc trường link, canonical URL, Dừng và cleanup. Chưa xác nhận trên Meta thực tế.
- Reload extension và F5 tab Meta một lần; không cần Deploy lại Apps Script.

### Bản 6.3.8

- Sửa quét cây dài ở cả Campaign/Ad set/Ad: luôn bắt đầu từ đầu; thời gian chờ tải áp dụng cho từng đoạn, không cắt toàn bộ lượt tìm ở mốc 30 giây. Các đoạn chỉ có Ad con vẫn được cuộn tiếp khi đang tìm Campaign/Ad set.
- Chọn thanh cuộn thật thay vì wrapper `overflow:hidden` không cuộn. Sau mỗi bước, nhận diện lại vùng cuộn, đưa tới đúng vị trí và đợi hàng hiển thị ổn định; hỗ trợ Meta thay node khi render. Chỉ báo không tìm thấy sau khi xác nhận đã quét tới đáy và đọc lại đoạn cuối. Kẹt cuộn/tải lỗi/giới hạn 1.000 đoạn được báo là chưa quét hết, không phải không tồn tại tên.
- Giữ matching chính xác, không tự chọn tên cùng tiền tố. Bỏ hàng ngữ nghĩa lồng nhau bị đếm hai lần; đọc ID đúng cấp trên row hoặc label; ID đã xác định được ưu tiên hơn hàng khác chỉ trùng tên. Không lấy Ad set cha từ Campaign trước khi vùng cây ảo bỏ hàng cha hiện tại.
- Chỉ sau khi quét hết mới gợi ý các tên có thêm hậu tố. Nếu ID thuộc tên khác, báo rõ để cập nhật file/tên; không sửa naming trên Meta. Kiểm tra import giữ nguyên hậu tố và dấu phẩy trong tên CSV đã quote.
- Kiểm tra mô phỏng: tìm đúng tên RTG phía dưới qua hơn 30 giây và nhiều đoạn chỉ có Ad con, đủ ba cấp; thanh cuộn bị thay/kẹt, Dừng, xác nhận đáy, ID, tên trùng và nhóm cha. Chưa xác nhận trên Meta thực tế.
- Reload extension và F5 tab Meta một lần; không cần Deploy lại Apps Script.

### Bản 6.3.7

- Không dùng `data-id` chung của giao diện để so sánh ID từ file import. Chỉ ID ghi rõ cấp (`data-campaign-id`, `data-adset-id`, `data-ad-id`) mới được dùng để loại hoặc phân biệt các hàng. Khi không có ID quảng cáo, chỉ chọn tên khớp duy nhất trong đúng nhóm cha và vẫn xác minh tên đầy đủ trong Edit; không bỏ qua kiểm tra trùng tên.
- Tách lỗi đã thấy tên nhưng khác ID/nhóm cha, hoặc đã click nhưng Meta không mở đúng màn hình, khỏi lỗi thật sự không tìm thấy tên. Không lặp click hàng đã hết thời gian chờ mở.
- Kiểm tra mô phỏng đã tái hiện đúng lỗi “Không tìm thấy … Đã đọc” với cùng tên do ID giao diện, rồi kiểm tra cả ba cấp, ID đúng/sai, tên trùng, nhóm cha và lỗi mở màn hình. Chưa xác nhận trên tài khoản Meta thực tế.
- Reload extension và F5 tab Meta một lần để thay mã cũ; không cần Deploy lại Apps Script.

### Bản 6.3.6

- Khi bắt đầu chụp hàng loạt và trước mỗi lần tìm Campaign/Ad set/Ad, đưa cây bên trái về vị trí 0 rồi đợi các hàng tại đầu danh sách hiển thị ổn định. Có fallback nhận diện vùng cuộn khi Meta chưa render hàng nào.
- Không bỏ qua bước reset nếu chưa tìm thấy thanh cuộn; không tìm từ giữa danh sách nếu reset thất bại. Hỗ trợ cây ngắn không cần cuộn, kiểm tra nút Dừng trong lúc chờ. Thanh cuộn thiết lập bên phải vẫn về đầu riêng trước khi chụp mỗi mục.
- Reload extension và F5 tab Meta một lần để thay mã cũ; không cần Deploy lại Apps Script.

### Bản 6.3.5

- Đọc tên Campaign/Ad set/Ad từ cây sau khi loại node biểu tượng SVG/img và menu. Không nối nhãn SVG `default` vào tên, không dùng lại chữ nguyên hàng bị lẫn biểu tượng khi đã có phần tên sạch. Tên thật có chữ `default` vẫn giữ nguyên.
- Chẩn đoán và đối chiếu cấp cha dùng các biến thể tên sạch; tên đầy đủ trong màn Edit vẫn được kiểm tra trước khi chụp. Không chuyển sang matching mơ hồ.
- Không coi một tên đầy đủ là tiền tố của tên khác dài hơn. Chỉ thử tên rút gọn nếu Meta thực sự có dấu `…`/`...`, rồi xác minh lại tên đầy đủ trong Edit.
- Reload extension và F5 tab Meta một lần để thay mã cũ; không cần Deploy lại Apps Script.

### Bản 6.3.4

- Khởi tạo đúng phần xử lý cho cả chụp thường và chụp hàng loạt ở mỗi phiên, kể cả khi vừa Reload extension hoặc đổi chế độ trên cùng tab. Nếu Chrome không trả phản hồi, nạp lại phần xử lý phù hợp và thử gửi lại một lần.
- Meta/Google bỏ qua các lệnh không thuộc chức năng của mình thay vì giữ kênh phản hồi mở nhưng không trả kết quả. Khi tab không phản hồi, thông báo rõ cần F5 thay vì lỗi khởi tạo chung chung.
- Reload extension và F5 tab Meta một lần để thay mã cũ; không cần Deploy lại Apps Script.

### Bản 6.3.3

- Chụp thường với trang có vùng cuộn riêng (Meta, dashboard) lấy riêng vùng nội dung, không ghép cột menu không cuộn thành mảng trắng và không sao chép chân trang ngoài vùng đó. Trang cuộn bằng document vẫn chụp toàn trang.
- Chỉ nối phần mới của mỗi ảnh, không vẽ đè đoạn chồng lấn. Kiểm tra ảnh khác kích thước, vùng chụp bị dịch chuyển, thiếu khoảng giữa hoặc thiếu đáy; bỏ lượt lỗi và thử lại thay vì xuất ảnh sai.
- Bật mặc định **Ảnh nét hơn khi chạy nền**: render tối thiểu 2× mật độ điểm ảnh, giữ nguyên chiều rộng bố cục. File lớn hơn và giới hạn chiều dài canvas vẫn là 30.000 pixel; bỏ tick nếu cần ảnh rất dài/file nhẹ hơn. Chế độ không chạy nền dùng độ phân giải gốc của Chrome.
- Reload extension và F5 tab cần chụp; không cần Deploy lại Apps Script.

### Bản 6.3.2

- Mặc định dùng tốc độ **Nhanh**: tối thiểu 1 giây và tiếp tục chờ nếu nội dung/ảnh chưa sẵn sàng. Trong Cài đặt nâng cao, chọn **Chờ kỹ hơn** để dùng thời gian chờ tùy chỉnh cũ.
- Cuộn mượt bằng hiệu ứng của trình duyệt, kiểm tra điểm dừng trước khi chụp. Nếu animation bị treo ở tab nền, chuyển sang cuộn trực tiếp sau tối đa 600 ms; nút Dừng hủy được cả lúc đang cuộn.
- Bỏ những lần đưa về đầu và chờ tải trùng nhau khi chuyển mục; không cuộn/chờ thêm sau ảnh cuối. Vẫn kiểm tra vị trí trước/sau ảnh và chụp lại từ đầu nếu bị cuộn ngoài ý muốn.
- Reload extension và F5 tab cần chụp. Không cần Deploy lại Apps Script.

### Bản 6.3.1

- Trước mỗi lần tìm Campaign/Ad set/Ad, đưa scrollbar của cây bên trái về đầu, chờ danh sách render lại rồi mới quét xuống. Nhận diện scrollbar dựa trên các hàng thuộc mọi cấp và giới hạn ở nửa trái, tránh nhận nhầm vùng thiết lập bên phải khi tên cần tìm chưa xuất hiện. Loại nội dung nút menu khỏi tên hàng (`default` không còn bị nối vào tên Campaign).
- Thêm **Chụp thường — cả trang, một link**. Chế độ này chụp trang hiện tại, không đọc danh sách/import, không chuyển Campaign/Ad set/Ad và không lấy Preview. Chụp được trang HTTP/HTTPS; Chrome hỏi quyền đúng website nếu cần. Chọn Drive để nhận một link, hoặc Tải về máy để nhận một PNG. Không cần Deploy lại Apps Script.
- Ảnh chụp thường giữ header/sidebar ở đoạn đầu, tiếp tục ghép nội dung cuộn chính xuống dưới; không lặp lại menu cố định. Với trang có nhiều vùng cuộn độc lập, chụp vùng nội dung chính, không kéo các dropdown/khung phụ bên trong. Có thể chọn vùng cuộn ở Cài đặt nâng cao nếu trang có bố cục đặc biệt. Nội dung chưa mở/thu gọn không nằm trong ảnh.

Bản 5.4 thêm chế độ **Ads → Chỉ lấy link** theo từng phiên. Tool vẫn tìm và chuyển qua từng Ad nhưng bỏ bước cuộn, chụp, ghép và upload PNG; TXT ghi thẳng link `fb.me/adspreview` tại dòng Ad. Link xem ảnh Drive cũng có chữ ký HMAC riêng cho từng File ID, nên người nhận không thể thay ID trong URL để yêu cầu Web App đọc file khác.

Bản 5.4.1 tự xóa `tabId` đã hết hiệu lực khi tab Meta bị đóng hoặc Chrome khởi động lại. Chỉ Phiên 1 được tự chọn tab ban đầu; Phiên 2 chỉ chạy khi người dùng chủ động chọn tab, tránh lỗi `No tab with id` và tránh vô tình khởi chạy hai phiên.

Bản 6.0 bỏ chế độ hai phiên để ưu tiên độ ổn định của một tab. Ad có hai lựa chọn độc lập **Chụp ảnh** và **Lấy Preview**; bỏ tick chức năng nào thì tool không thực hiện chức năng đó. Tên Ad và Ad set được đối chiếu đầy đủ trước khi click, trang Edit được đưa về đầu ngay sau khi chuyển mục, và tool không còn quét/cuộn các vùng thiết lập con. Chế độ nền tái kích hoạt lifecycle/focus trong suốt quá trình, thời gian tải mặc định tăng lên 30 giây và tự thử render lại một lần trước khi dừng.

Phím **Ctrl + Shift + F** chạy nhanh cấu hình gần nhất trên tab Ads Manager đang active. Khi bấm nút chạy trong Side Panel, giao diện tự đóng để trả lại toàn bộ chiều rộng cho Meta; mở lại icon extension để xem tiến độ hoặc kết quả.

Bản 6.0.1 bỏ dropdown chọn tab. Cả nút **Bắt đầu xử lý** và phím tắt đều chỉ dùng tab Ads Manager đang active tại đúng thời điểm người dùng kích hoạt.

Bản 6.0.2 thêm **Link gọn** ngay trong khung kết quả. Khi bật, giao diện hiện chữ `Link`; nút Copy ghi cả HTML hyperlink để dán vào Word/Google Docs giống liên kết tạo bằng Ctrl+K. File TXT vẫn giữ URL thật, tự tải xuống và các mục được cách nhau bằng một dòng trống. Dòng `File TXT:` không còn được chèn vào đầu kết quả.

Bản 6.0.3 luôn điều hướng theo đủ cây Campaign → Ad set → Ad trước khi xử lý từng Ad, kể cả khi Campaign hoặc Ad set bị bỏ tick chụp. Nhờ vậy các Ad trùng tên ở những nhóm cha khác nhau vẫn được chọn đúng. Báo cáo vẫn ghi Campaign và Ad set làm tiêu đề nhóm một lần; cấp cha không được chụp sẽ không có link riêng.

Bản 6.0.4 chỉ áp dụng **Link gọn** cho link ảnh chụp. Link Preview Meta luôn hiện đầy đủ dưới dòng `Preview:`, kể cả khi Ad chỉ được cấu hình lấy Preview mà không chụp ảnh.

Bản 6.1.0 nhận diện vùng sticky **Estimated audience size** theo từng khung hình để chỉ giữ nó ở đoạn đầu của ảnh Ad set. Side Panel không còn tự đóng khi bắt đầu. Báo cáo và nội dung Copy căn trái hoàn toàn. Chế độ nền bổ sung visibility/focus render shim cùng nhịp đánh thức CDP trước và sau mỗi lần chờ. Nếu một mục gặp lỗi cuộn, các ảnh tạm của mục đó bị bỏ và mục được đưa về đầu để chụp lại, tối đa ba lượt.

Bản 6.2.0 bỏ tải và upload file TXT; kết quả được giữ để Copy trong Side Panel. Khi hoàn tất, Chrome hiện thông báo ở góc màn hình và có thể bấm thông báo để quay lại kết quả. Checkbox **Ẩn giao diện khi bắt đầu** cho phép người dùng tự chọn đóng hay giữ Side Panel trong lúc chạy.

Bản 6.2.1 sửa lỗi Meta rút gọn tên Campaign/Ad set/Ad trong cây trái. Tool cho phép dùng tiền tố đã bị cắt để click ứng viên, nhưng chỉ chấp nhận sau khi ô tên đầy đủ trên màn hình Edit khớp chính xác; đường dẫn cha đã chọn cũng được dùng để tránh loại nhầm Ad set con.

Bản 6.2.2 loại chuỗi accessibility ẩn `defaultAction menu` mà Meta nối vào cuối tên hàng trong DOM. Chuỗi này không hiển thị trên màn hình nhưng trước đây làm tên Ad set đầy đủ bị coi là khác với dữ liệu import.

Kết thúc phiên, tool giữ kết quả theo cấu trúc Campaign → Ad set → Ad trong Side Panel để Copy. Tool không còn tải hoặc upload file TXT; Drive chỉ nhận các ảnh chụp.

Tùy chọn **Tự lấy link preview của Ad** được bật mặc định. Campaign và Ad set không có link preview nên tool chỉ chạy bước này ở cấp Ad. Nếu Meta đổi giao diện hoặc không tạo URL kịp, phiên chụp vẫn tiếp tục và kết quả Copy ghi rõ mục nào không lấy được link.

Tên trong cây Ads Manager có thể bị rút gọn bằng `...`. Tool dùng matching tương đối theo số `Post`, phần prefix còn nhìn thấy và độ trùng từ khóa. Có thể nhập tên Ad hoặc tên Ad Set; nếu cùng số Post, hàng Ad creative con vẫn được ưu tiên để mở và chụp.

Giao diện chạy trong Chrome Side Panel nên không tự đóng khi bạn click vào Ads Manager. Ở chế độ **Chạy nền**, Chrome cấp quyền Debugger một lần; tool có thể tiếp tục cuộn/chụp tab Ads Manager trong khi bạn làm việc ở tab khác. Chrome có thể hiện banner thông báo tab đang được debug cho tới khi phiên chụp hoàn tất.

Ad Preview là thành phần sticky. Bản 4.0 chỉ giữ cột preview trong đoạn đầu của ảnh; từ đoạn thứ hai trở đi cột phải được tự che bằng màu nền, tránh lặp preview nhiều lần khi stitch.

## Cài nhanh (không cần Google Drive)

1. Mở `chrome://extensions`.
2. Bật **Developer mode**.
3. Chọn **Load unpacked** và chọn thư mục `meta-ads-capture` này.
4. Click icon extension để mở Side Panel; nhập/dán danh sách Ad tại đây.
5. Mở một Ad trong màn hình Edit và bảo đảm danh sách Ad hiện ở bên trái.
6. Chọn nơi lưu, bật **Chạy nền**, rồi bấm **Bắt đầu chụp**.

Ảnh được tải vào `Downloads/MetaAdsCapture/`. JSON kỹ thuật mặc định không xuất; có thể bật lại trong **Cài đặt nâng cao**.

## Cấu hình Drive đơn giản — không cần Google Cloud

1. Mở [script.new](https://script.new) để tạo thẳng một Apps Script project mới.
2. Mở file `apps-script/Code.gs` trong thư mục extension, copy toàn bộ rồi dán đè vào `Code.gs` trên Apps Script.
3. Trong dòng `UPLOAD_TOKEN`, đổi chuỗi mẫu thành một mã riêng khó đoán và lưu lại.
4. Chọn **Deploy > New deployment > Web app**.
5. Chọn **Execute as: Me** và **Who has access: Anyone**, sau đó bấm **Deploy** và cấp quyền cho script.
6. Copy URL kết thúc bằng `/exec`.
7. Trong Side Panel, chọn **Drive đơn giản**, dán URL `/exec`, mã bảo vệ và link folder Google Drive. Bấm **Kiểm tra**.

Nếu đã deploy từ bản cũ: chọn **Deploy > Manage deployments > Edit > New version > Deploy**. URL `/exec` cũ được giữ nguyên. Bước này cần làm để link ảnh dùng trình xem mới vừa chiều ngang.

Nếu Google hiện **Google hasn't verified this app**, bấm **Advanced > Go to [tên project] (unsafe) > Allow**. Chỉ thực hiện khi đây đúng là project do bạn vừa tạo và nội dung đến từ `apps-script/Code.gs` của tool.

Không cần bật Drive API, không cần OAuth consent screen và không cần tạo Credential. Hướng dẫn riêng nằm tại `apps-script/README.md`.

Tùy chọn **Đồng thời chia sẻ file gốc trên Drive** không cần bật để khách xem link ảnh có chữ ký. Nếu bật, Apps Script còn đặt file gốc ở chế độ `Anyone with the link`; quản trị viên Workspace có thể chặn quyền này.

Bạn có thể dán nguyên link thư mục dạng `https://drive.google.com/drive/folders/...`; tool tự tách Folder ID. Để trống thì lưu vào My Drive. Mã bảo vệ chỉ được lưu cục bộ trên máy, không đồng bộ qua Chrome Sync.

## Cách tool hoạt động

Mỗi vòng lặp tool thực hiện: đọc tên mục đang mở → đưa scrollbar ngoài cùng về đầu → chờ DOM/lazy-load ổn định → cuộn với 25% phần chồng → chụp toàn bộ → crop đúng vùng → ghép theo `scrollTop` → lưu/upload một PNG dài → chọn mục kế tiếp. Nếu nội dung vẫn thay đổi, tool tự chờ tối đa theo **Cài đặt nâng cao** thay vì chụp vội.

Không dùng OCR. Screenshot là bằng chứng; tên Ad lấy từ DOM.

## Giao diện sử dụng

Các thiết lập thường dùng được trình bày thành ba bước: chuẩn bị Ads Manager, chọn nơi lưu và chọn kiểu kết quả. Selector, thời gian chờ và giới hạn số ảnh được giấu trong **Cài đặt nâng cao**; bạn chỉ cần mở phần này khi tool nhận diện hoặc cuộn chưa đúng.

## Khi Meta thay DOM

Mở phần **Tùy chỉnh DOM** trong popup:

- `Row selector`: CSS selector cho một hàng, mặc định tự dùng `[role="row"], [data-testid*="row"], tr`.
- `Ad name selector`: selector tương đối bên trong từng row. Dùng khi tên được auto-detect chưa đúng.
- `Scroll container selector`: selector của vùng bảng có scrollbar. Dùng khi tool cuộn nhầm vùng.

Gợi ý tìm selector: mở DevTools → Inspect một hàng/tên Ad → chọn selector dựa trên `role` hoặc thuộc tính ổn định; tránh class ngẫu nhiên của Meta.

## Giới hạn phiên bản 1.0

- Mỗi mục tạo một PNG dài. Ảnh cao trên 30.000 px sẽ bị giới hạn để tránh vượt giới hạn canvas của Chrome; file JSON đánh dấu `truncated: true` nếu xảy ra.
- Meta thay giao diện thường xuyên; ba selector tùy chỉnh là cơ chế hiệu chỉnh dự phòng.
- Nếu tắt **Chạy nền**, tab Ads Manager phải tiếp tục là tab đang active. Khi bật **Chạy nền**, tool dùng Chrome Debugger để tiếp tục capture khi bạn chuyển tab.
- Không thao tác chuột/bàn phím trong Ads Manager cho tới khi hoàn tất.

## Quyền extension

- `activeTab`, `scripting`, host Meta: đọc DOM và chụp tab hiện tại sau thao tác của người dùng.
- `debugger`: chụp tab Ads Manager trong chế độ chạy nền.
- `downloads`: lưu PNG/JSON cục bộ.
- `storage`: lưu cài đặt và tiến độ.
- Host `script.google.com` và `script.googleusercontent.com`: gọi đúng Web App URL mà người dùng dán vào.

Không có server của bên thứ ba; dữ liệu đi từ extension đến Apps Script do chính bạn deploy, rồi vào Google Drive của bạn.
