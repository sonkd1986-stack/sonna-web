# SONNA (Node.js + JSON)

    node server.js        # http://localhost:3000

- Không cần `npm install` (Node >= 16).
- Lần chạy đầu tạo tài khoản admin và in mật khẩu ra console. Tự đặt: xóa `data/admin.json`, rồi
  PowerShell: `$env:ADMIN_PASSWORD="matkhau"` (dòng riêng) rồi `node server.js`; cmd: `set ADMIN_PASSWORD=Son12345@` rồi `node server.js`.
- Máy chủ dùng `process.env.PORT` do hosting cấp; chạy cục bộ sẽ dùng cổng dự phòng `3000`. Lệnh khởi động chuẩn: `npm start` (`node server.js`).
- Máy chủ có cấu hình dự phòng tích hợp nếu `data/defaults.json` hoặc `data/nav.json` bị thiếu lúc deploy; với cấu hình đầy đủ, vẫn nên giữ hai tệp mẫu này trong thư mục `data/`.
- Trên hosting, khai báo `ADMIN_USER`, `ADMIN_PASSWORD`, `NODE_ENV=production`, `COOKIE_SECURE=1` (nếu cần) và các biến môi trường khác trong mục Environment Variables/Secrets của dịch vụ. `ADMIN_USER` và `ADMIN_PASSWORD` được áp dụng mỗi lần máy chủ khởi động, kể cả khi `data/admin.json` đã tồn tại; nếu đổi mật khẩu trên hosting, hãy khởi động lại dịch vụ. Không commit `.env`, mật khẩu hay API key; `.env` và `.env.*` được loại khỏi Git. Ứng dụng hiện không tự đọc `.env`, nên chỉ tạo tệp đó sẽ không cấu hình biến môi trường.
- Khóa SePay được đọc từ `data/payment.json`; tệp này nằm trong `data/` và được `.gitignore` loại trừ. Chỉ cấu hình trên máy chủ đang chạy, không đưa khóa lên GitHub hoặc gói ZIP cập nhật.

## Gói cập nhật máy chủ
- ZIP phát hành chứa mã nguồn, giao diện và cấu hình mẫu; không chứa dữ liệu tài khoản/đơn hàng, cấu hình thanh toán, phiên đăng nhập hoặc ảnh đã tải lên.
- Khi cập nhật, sao lưu và giữ nguyên thư mục `data/` đang chạy trên máy chủ; chỉ thay các tệp ứng dụng. Không ghi dữ liệu mẫu cục bộ đè lên dữ liệu thật.
- Khách truy cập chỉ thấy cửa hàng. Để mở trang đăng nhập quản trị, truy cập `/#AdminDashboard`; thanh điều hướng quản trị chỉ hiện sau khi đăng nhập admin thành công.
- Cửa hàng có liên kết đăng nhập admin ở cuối trang; trên điện thoại, các ô danh mục biểu tượng ngọc rồng trên trang chủ được ẩn để tiết kiệm không gian, còn trên PC vẫn hiển thị. Thanh menu phía trên vẫn giữ nguyên.
- Đăng nhập từ liên kết cuối trang sẽ tự chuyển vào trang quản trị. Ảnh banner và ảnh acc hỗ trợ GIF/WebP động, tối đa 8 MB mỗi ảnh.
- Admin > Nội dung website > Màu giao diện cho phép chọn Tím SONNA, Navy hiện đại, Emerald chuyên nghiệp hoặc một màu chủ đạo tùy chỉnh. Chọn “Lưu và đăng” để áp dụng lên màu menu, nút chính, điểm nhấn, huy hiệu và banner mặc định; màu chữ trên nền chủ đạo tự chọn theo độ tương phản để dễ đọc, banner đã tùy chỉnh vẫn được giữ nguyên. Dòng “GAME ACCOUNT STORE” dưới logo đã được tăng kích thước và độ tương phản.

## Dữ liệu (thư mục data/, không đưa lên git, nhớ sao lưu)
- `store.json`: cấu hình/dữ liệu admin (danh mục, khuyến mãi, nội dung, số đã bán).
- `accounts.json`: kho TK|MK thật; chỉ API admin được đọc, không đưa lên Git.
- `admin.json`: tài khoản admin (mật khẩu băm).
- `users.json`: khách hàng (mật khẩu băm, ví, mã giảm giá đã dùng). `orders.json`: đơn hàng.
- `deposits.json`: mọi giao dịch tiền vào từ ngân hàng (đã cộng ví hoặc chưa khớp khách).
- `sessions.json`: phiên đăng nhập còn hạn; được giữ qua lần khởi động lại.
- `payment.json`: cấu hình ngân hàng + khóa SePay (CHỨA BÍ MẬT, không chia sẻ).

## Nạp tiền tự động bằng SePay
Luồng: khách chuyển khoản đúng nội dung `SONNA<ID>` (ví dụ `SONNA28`) -> SePay gọi webhook của bạn -> máy chủ cộng ví -> trang nạp của khách tự báo "Đã nhận tiền".

1. Đăng ký sepay.vn, liên kết tài khoản ngân hàng nhận tiền.
2. Mở `data/payment.json` điền: `bankName`, `bankShortName` (tên bank dùng tạo QR, đúng theo danh sách của SePay/VietQR), `accountNumber`, `accountName`.
3. Trong SePay tạo Webhook: URL `https://TEN-MIEN-CUA-BAN/api/webhook/sepay`, phương thức POST, chọn "Có tiền vào". Kiểu xác thực chọn **API Key** (điền cùng khóa vào `sepay.apiKey`) hoặc **HMAC-SHA256** (điền secret vào `sepay.hmacSecret`). Có thể dùng một trong hai.
4. Khởi động lại server. Nạp giả lập **mặc định tắt**; chỉ bật rõ ràng bằng `SIM_TOPUP=1` khi thử nghiệm cục bộ. `SIM_TOPUP=0` luôn giữ chức năng này tắt. Khi cấu hình SePay hợp lệ, giả lập vẫn bị khóa.
- SePay chỉ gọi được địa chỉ công khai có HTTPS, nên cần đưa web lên mạng (hoặc dùng ngrok để thử).
- SePay gửi lại webhook khi lỗi: máy chủ chống cộng trùng theo mã giao dịch.
- Tiền vào mà nội dung sai (không tìm thấy ID khách) được ghi `unmatched` trong `deposits.json`. Xem: `GET /api/admin/deposits` (đăng nhập admin). Cộng ví tay: `POST /api/admin/users/<id>/wallet` với `{"delta": 50000}`.
- Mã QR dùng mẫu `qrTemplate` trong `payment.json`; nếu ảnh QR không hiện, sửa mẫu theo tài liệu SePay.
- Thưởng nạp mặc định TẮT (nạp bao nhiêu nhận bấy nhiêu). Bật trong Admin > Thanh toán > Khuyến mãi nạp.
- Thử khi chưa có SePay: đặt `SIM_TOPUP=1` trước khi chạy (PowerShell: `$env:SIM_TOPUP="1"`). Không bật biến này trên môi trường bán thật.

## Khách hàng
- Đăng ký / đăng nhập trên cửa hàng, mỗi khách có ví và lịch sử đơn riêng.
- Admin > Quản lý acc lưu TK|MK vào kho riêng. Có thể sửa mã ID và tên sản phẩm; khi đổi ID, máy chủ cập nhật liên kết ảnh, thứ tự/số bán và tham chiếu đơn hàng. Trong cửa sổ sửa acc có thể thêm hoặc gỡ ảnh (tối đa 5 ảnh). Tồn kho trang khách được tính từ số acc đang bán có đủ TK|MK; sau khi mua, máy chủ gửi danh sách tồn kho mới để giao diện cập nhật ngay, không trừ lặp số bán tích lũy. Đặt hàng (`POST /api/orders`) chỉ bán tài khoản đang có đủ TK|MK; khi hết hàng hoặc thông tin chưa đầy đủ, máy chủ không trừ ví và không tạo đơn.
- Trong Quản lý acc, “Giá gốc” dùng làm mốc so sánh sale, “Giá bán” là số tiền khách thanh toán. Khi giá gốc lớn hơn giá bán, cửa hàng tự hiện giá gạch ngang và phần trăm giảm; ví dụ giá gốc 100.000₫, giá bán 90.000₫ sẽ hiện Sale 10%. Bấm danh mục Character + Chrono iOS/Android sẽ lọc danh sách và tự chọn cùng danh mục trong biểu mẫu thêm acc; acc chưa bán có thể chỉnh sửa như các loại khác, còn acc đã bán, đang đặt giữ hoặc đã tặng sẽ khóa sửa. Ảnh xem trước acc trong danh sách và cửa sổ sửa được phóng lớn hơn; thẻ cửa hàng dùng huy hiệu Android/iOS tương phản cao trên ảnh.
- Trong Quản lý acc có thể tạo danh mục sản phẩm tùy chỉnh, chọn nền tảng, thêm acc bán lẻ hoặc tạo thư mục con. Acc và thư mục thuộc danh mục tùy chỉnh được đồng bộ ra cửa hàng; acc bán lẻ dùng giá/giá gốc và huy hiệu sale như các danh mục khác. Chỉ xóa được danh mục khi đã xóa các acc còn hoạt động và các thư mục bên trong.
- Trong Quản lý acc, bảng thư mục và danh sách acc đều có vùng cuộn riêng, giữ tiêu đề bảng khi cuộn; danh sách hiển thị TK|MK và có thể xóa một acc hoặc xóa hàng loạt. Kho acc quà có bộ lọc riêng “Quà trong kho” / “Quà đã tặng” / “Tất cả trạng thái”; số lượng từng thư mục thể hiện cả acc còn trong kho lẫn acc đã tặng. Nút “Hiện lại” trong kho quà đưa acc đã ẩn về trạng thái “Trong kho”.
- Danh sách kho có bộ lọc riêng cho acc chưa bán và đã bán; nút “Làm mới kho” tải trạng thái mới nhất sau khi có đơn. Giá và thư mục con trong Quản lý acc lấy từ catalog đang lưu thay vì giá mẫu mặc định.
- Admin > Người dùng hiển thị toàn bộ đơn hàng, giao dịch nạp/điều chỉnh ví và TK|MK đã giao theo từng đơn. Danh sách giao dịch có vùng cuộn riêng với thanh màu cam luôn hiện để xem toàn bộ lịch sử; vị trí cuộn được giữ khi giao diện cập nhật. Danh sách khách cũng cuộn độc lập khi dài. Mục hoạt động gần đây là phần riêng, không thay thế hay giới hạn danh sách giao dịch. ID đăng nhập là tên người dùng; mật khẩu cũ không thể khôi phục vì chỉ lưu dạng mã băm. Khi khách quên mật khẩu, admin có thể đặt mật khẩu mới và gửi cho khách qua kênh riêng; phiên đăng nhập cũ bị thu hồi.
- Các danh sách vận hành dài trên trang khách và trang admin (acc, đơn hàng, tài khoản đã giao, giao dịch/nạp tiền, CTV, khuyến mãi, nội dung và kho) đều có vùng cuộn giới hạn chiều cao riêng; các bảng giữ tiêu đề khi cuộn. Menu và các nhóm thông tin cố định không bị biến thành vùng cuộn.
- Kho quà khuyến mãi nằm riêng ở danh mục khuyến mãi, không tính vào tồn kho bán. Khi chuyển acc sang kho tặng, chọn thư mục quà tương ứng; tạo quy tắc Mua/Tặng và thời hạn trong Quản lý acc. Đơn đủ số lượng sẽ tự giao acc mua và acc quà, chỉ trừ tiền theo acc mua. Nếu kho quà không đủ, đơn bị từ chối và ví không bị trừ. Ô ngày chỉ xác nhận sau khi nhập xong để tránh làm gián đoạn lúc nhập năm.
- Danh mục tùy chỉnh cũng xuất hiện trong Nội dung website và có thể chọn làm phạm vi áp dụng mã khuyến mãi. Acc đã bán ở danh mục tùy chỉnh hiển thị đúng tên danh mục trong mục bán gần đây.
- Admin > Nội dung website > Acc đã bán cho phép bật/tắt mục acc bán gần đây và chọn số acc hiển thị. Cửa hàng chỉ công khai tên sản phẩm, danh mục, ảnh đã duyệt và thời điểm bán; không công khai TK/MK hay thông tin khách. Đơn hoàn tiền bị loại khỏi danh sách và tổng số.
- Đơn hợp lệ trừ ví, đánh dấu acc đã bán và ghi đơn trong cùng journal.
- Mỗi IP được đăng ký tối đa 5 tài khoản trong 15 phút.
- Trang Admin Đơn hàng, Người dùng và Tổng quan đọc dữ liệu thật; admin có thể giao đơn, hoàn tiền, khóa/mở khóa tài khoản và điều chỉnh ví.
- Cập nhật ví, tài khoản, đơn hàng và giao dịch webhook dùng journal giao dịch để khôi phục trạng thái nếu tiến trình dừng giữa các lần ghi JSON. Không xóa `data/transaction.json` khi nó đang tồn tại sau sự cố; khởi động lại máy chủ để tự khôi phục.
- Cookie phiên tự thêm `Secure` khi `NODE_ENV=production`; nếu kết thúc TLS ở proxy nhưng không đặt biến này, cấu hình `COOKIE_SECURE=1`.

## Chưa làm
- Nạp thẻ cào Gạch Thẻ chưa được kết nối: giao diện không gửi PIN/serial và không báo thành công giả. Cần tài liệu API merchant/callback chính thức cùng cấu hình tài khoản Gạch Thẻ để tích hợp; chuyển khoản SePay vẫn hoạt động độc lập.
