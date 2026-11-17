# Backend Cloudflare

Stack: React/Vite + Hono + Cloudflare Workers + D1 + Drizzle + Better Auth.

## Chạy local

Yêu cầu Node.js 22.23+ (nhánh 22 LTS, xem `.nvmrc`) và npm. Vite được nâng từ 5 lên 7 để dùng Cloudflare Vite plugin. Project dùng Cloudflare CLI (`cf`) và `cloudflare.config.ts`; không cần tạo cấu hình Wrangler.

```bash
nvm use
npm ci
cp .dev.vars.example .dev.vars
```

Điền `BETTER_AUTH_SECRET` riêng trong `.dev.vars`. Có thể tạo bằng `openssl rand -base64 32`. File này đã được bỏ qua bởi Git. Các biến không được mang tiền tố `VITE_`.

```bash
npm run db:migrate:local
npm run dev
```

Mở `http://localhost:5173` (dùng đúng hostname để khớp Origin/cookie). Dữ liệu local nằm trong `.cloudflare/state`. Nếu cổng đã bị chiếm:

```bash
DEV_PORT=18763 APP_ORIGIN=http://localhost:18763 npm run dev
```

Migration local dùng UUID cố định `11111111-1111-4111-8111-111111111111`, chỉ dùng để định danh database mô phỏng. Development và production dùng database riêng. `npm run build` tạo `.cloudflare/output/` và không deploy.

## Cấu hình production

Các thay đổi trong nhánh này chưa được triển khai lên Cloudflare. Cần gắn đúng Worker/domain hiện có và tạo D1 trước khi phát hành.

1. Đăng nhập bằng `npx cf auth login`, hoặc cung cấp `CLOUDFLARE_API_TOKEN` qua môi trường CI.
2. Tra cứu cú pháp với `npx cf d1 create --help`, tạo database tên `meowlanguage-production` trong đúng account và ghi nhận ID.
3. Export các biến cấu hình dưới đây trong terminal hoặc CI (thay bằng giá trị thực tế):

```bash
export CLOUDFLARE_WORKER_NAME='your-existing-worker'
export APP_ORIGIN='https://your-domain.example'
export D1_DATABASE_ID='your-d1-uuid'
```

`APP_ORIGIN` chỉ gồm scheme + hostname + port nếu có, không có dấu `/` cuối hoặc đường dẫn. Đây là giá trị cố định được dùng cho cookie, OAuth callback và kiểm tra Origin.

4. Sao lưu D1 hiện có trước migration. Áp dụng migration bằng ID database thực:

```bash
npx cf d1 migrations apply "$D1_DATABASE_ID" --dir migrations
```

5. Đặt secret `BETTER_AUTH_SECRET` trong môi trường Worker qua Dashboard hoặc cung cấp trong file `.env.production` như hướng dẫn bên dưới. Dùng giá trị ngẫu nhiên tối thiểu 32 ký tự; không dùng secret local cho production.
6. Chạy `npm test` và deploy bằng một trong các cách bên dưới. Script deploy yêu cầu đủ tên Worker, origin HTTPS và database ID, rồi build lại trước khi upload.

### Deploy bằng file env

Sao chép `.env.example` thành `.env.production`, điền tên Worker, origin, ID database và `BETTER_AUTH_SECRET`. Tạo secret một lần bằng `openssl rand -base64 32` rồi lưu giá trị vào file; giữ nguyên giá trị đó cho những lần deploy tiếp theo. File `.env.production` đã được bỏ qua bởi Git.

```bash
node --env-file=.env.production scripts/deploy.mjs
```

Script nạp cấu hình từ môi trường của Node. Khi có `BETTER_AUTH_SECRET`, script gửi secret qua `cf deploy --secrets-file` cùng phiên bản Worker. Google/AI secrets chỉ được gửi khi provider tương ứng được bật. File JSON tạm chỉ chứa các secret trong danh sách cho phép, có quyền `0600` và được xóa khi lệnh kết thúc, kể cả khi upload lỗi. Các biến cấu hình như `APP_ORIGIN` và `D1_DATABASE_ID` không được upload dưới dạng secret.

Nếu không cung cấp secret trong môi trường, script giữ secret đã tồn tại trên Cloudflare. Khi deploy lần đầu, cần cung cấp `BETTER_AUTH_SECRET` trong file env hoặc tạo sẵn trên Worker; chỉ khai báo `bindings.secret()` trong cấu hình không tạo giá trị secret.

Nếu đã export biến vào terminal/CI, tiếp tục dùng `npm run deploy`. File `.dev.vars` chỉ phục vụ local và không được tự dùng làm secret production.

`npm run deploy` không tự chạy migration production. Build thông thường không đòi hỏi đăng nhập Cloudflare. CLI/plugin hiện dùng API cấu hình release candidate; lockfile giữ phiên bản đã kiểm tra.

Để tạo staging riêng, dùng `npx cf build --mode staging` / `npx cf deploy --prebuilt --mode staging` với tên Worker, origin và D1 ID riêng. Kiểm tra các giá trị trước khi deploy.

## Đăng nhập

- Better Auth lưu session và hash mật khẩu trong D1. Cookie production dùng HTTPS. Session được kiểm tra ở backend cho mỗi API riêng tư.
- Đăng ký bằng email và mật khẩu >= 8 ký tự. `preferredLanguage` được kiểm tra bởi Better Auth.
- Tài khoản/mật khẩu demo cũ trên trình duyệt không được dùng làm tài khoản server. Người dùng tạo tài khoản thật; credential local cũ được xóa khi ứng dụng khởi tạo auth.
- Chế độ khách lưu tiến độ trong khóa riêng `manabi_progress_v2:guest-local`. Có thể xuất backup từ Cài đặt rồi nhập vào tài khoản thật.
- Xác minh email, quên mật khẩu và gửi email chưa được triển khai. Khi mở rộng đăng ký công khai, cần nối dịch vụ email và bật các luồng này.

Đăng nhập Google là tùy chọn. Đặt `GOOGLE_LOGIN_ENABLED=true` khi chạy dev/build và cấu hình `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` trong secrets. Callback là `<APP_ORIGIN>/api/auth/callback/google`. Giao diện tự hiện nút khi backend đã được cấu hình. Khi dùng Google ở local, điền các secret trong `.dev.vars`.

Workers Free có giới hạn CPU/request. Local simulation không chứng minh được hashing mật khẩu nằm trong quota Free. Cần đo trên Worker trước phát hành; nếu vượt giới hạn, dùng Google login hoặc Workers Paid. Không giảm độ mạnh hashing để cố vừa quota.

## Lưu và đồng bộ tiến độ

- `GET /api/progress`: trả tiến độ, revision, mutationId gần nhất và trạng thái import.
- `PUT /api/progress`: nhận `{ state, revision, mutationId, importLegacy? }`; user luôn lấy từ session.
- D1 có `learning_head` lưu revision/summary, và `learning_record` lưu từng entity bài học, từ vựng đã thay đổi, nhiệm vụ, ghi chú, bài kiểm tra, study log. Các field của entity nằm trong JSON được Zod kiểm tra; summary chứa settings, skill stats và các chỉ số tổng hợp.
- Vocab có sẵn chưa thay đổi được bỏ khỏi payload. Nội dung giáo trình giữ trong frontend. Backend không cần import toàn bộ curriculum.
- D1 batch thực hiện compare-and-swap revision và cập nhật các entity một cách nguyên tử. Tất cả lệnh ghi/xóa entity đều có điều kiện revision + mutationId. Gửi lại mutation gần nhất trả cùng kết quả, không cộng thêm XP hoặc revision.
- Frontend gộp thay đổi trong 800 ms, chỉ có một request ghi đang chạy. Request chưa xác nhận được lưu cùng mã mutation trước khi gửi. Cache và bản sửa chưa lưu tách theo user.
- Chỉ bật thao tác học sau khi tải tiến độ server thành công. Khi đang học bị mất mạng, tiếp tục lưu bản sao local và cho retry. Sau reload cần kết nối để đối chiếu revision trước khi tiếp tục.
- Tự kiểm tra lại khi cửa sổ được focus hoặc có mạng trở lại. Không dùng realtime/polling.
- Trả `409` khi hai thiết bị sửa từ cùng revision. Không tự ghi đè. Người dùng có thể xuất bản sao local rồi tải bản server. Bản bị thay được giữ ở `manabi_progress_v2:<userId>:conflict-backup` trong localStorage.
- Chuyển khóa legacy `manabi_learning_platform_v1` chỉ xảy ra khi người dùng xác nhận. Có marker server để chuyển một lần cho mỗi tài khoản; khóa legacy vẫn giữ nguyên. Nút cảnh báo rõ vì dữ liệu cũ vốn dùng chung giữa các tài khoản local.
- Import file và reset tiến độ là thay thế state của đúng user, qua cùng cơ chế revision. Có xác nhận trước khi thực hiện trong Cài đặt.
- XP, điểm và lịch SRS hiện phục vụ tự học, được kiểm tra cấu trúc nhưng chưa được backend chấm lại. Cần chuyển logic chấm điểm sang server trước khi dùng cho phần thưởng hoặc leaderboard công khai.

## AI

AI demo hoạt động cục bộ. Để bật AI trực tiếp:

- Đặt `AI_PROVIDER=gemini` hoặc `AI_PROVIDER=openai_compatible`, `AI_MODEL=<model thực tế>` khi dev/build.
- Đặt `AI_API_KEY` trong secret Worker (local: `.dev.vars`).
- Trong Cài đặt, chọn AI trực tiếp và đăng nhập tài khoản thật.

`POST /api/ai/tutor` nhận `language`, `prompt` (tối đa 4000 ký tự), `level`. Provider/model/URL lấy từ server; frontend không truyền API key hoặc URL tùy ý. Bản đầu hỗ trợ Gemini và endpoint OpenAI chính thức. API key, model và endpoint legacy đều bị loại khỏi dữ liệu import/persistence/export.

Mỗi user có 30 lượt/ngày UTC; bộ đếm D1 tăng nguyên tử trước khi gọi provider. Lượt lỗi upstream vẫn tính quota để hạn chế retry vô hạn. Hạn mức output 1000 token, timeout 25 giây, response được giới hạn kích thước. Lỗi upstream trả thông báo chung; frontend hiển thị lỗi và chuyển sang demo. Phí provider AI tính riêng.

## Kiểm tra và vận hành

```bash
npm run typecheck
npm test
npm run build
```

Test chạy Better Auth + D1 mô phỏng, kiểm tra phân quyền, Origin, xung đột ghi đồng thời, import lặp, lọc secrets, logout và khôi phục request khi mất phản hồi/reload. Các test sync dùng storage giả riêng; không chạm database production.

Worker bật logs/traces và loại query string khỏi log. Handler lỗi chỉ ghi mã request và loại lỗi, không log body/cookie/API key. Theo dõi CPU, số request và số dòng D1 đọc/ghi sau phát hành. Phục hồi code không tự phục hồi database: migration và backup cần quản lý riêng.

R2, KV, gửi email và đo CPU trên gói Free thực tế là các phần triển khai tiếp theo khi có nhu cầu/cấu hình dịch vụ phù hợp.
