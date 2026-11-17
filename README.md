# Hệ thống Quản trị Nhân sự Doanh nghiệp Hiện đại (Enterprise HRMS)

Monorepo cho Hệ thống Quản lý Nhân sự, Chấm công, Phân ca làm việc và Phê duyệt Đơn từ tự động với Trợ lý AI.

---

## 🏛️ Kiến trúc Monorepo

- `apps/web`: Frontend Web React 18, Vite, Ant Design Doanh nghiệp cao cấp.
- `apps/api`: Backend Core NestJS, Prisma ORM, PostgreSQL & Redis.
- `apps/ai`: AI Decision Service (FastAPI / OpenAI, có thể đổi sang Gemini); giao tiếp qua API chuẩn mực, không can thiệp trực tiếp Database.
- `packages/shared`: Thư viện kiểu dữ liệu (DTO, Interfaces, Enums) dùng chung giữa Web và Backend.
- `docs/`: Tài liệu đặc tả nghiệp vụ, API Contracts, Chính sách quy chế và Bàn giao AI:
  - [01-api-contract.md](docs/01-api-contract.md): Đặc tả RESTful API.
  - [02-agent-tools.md](docs/02-agent-tools.md): Danh mục công cụ cho AI Agent.
  - [03-policy.md](docs/03-policy.md): 9 chính sách quy chế nhân sự công ty.
  - [05-business-spec.md](docs/05-business-spec.md): Đặc tả luồng nghiệp vụ phê duyệt đơn từ.
  - [06-ai-integration.md](docs/06-ai-integration.md): Cấu chế tích hợp ngầm giữa API và AI.
  - [07-ai-service-handover.md](docs/07-ai-service-handover.md): **Tài liệu bàn giao & hướng dẫn kết nối nhanh cho AI Service**.

---

## 🚀 Khởi chạy Hệ thống

### 1. Khởi chạy bằng Docker Compose (Khuyên dùng)
```bash
# 1. Sao chép biến môi trường mẫu, rồi điền OPENAI_API_KEY và đổi JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
cp .env.example .env

# 2. Khởi chạy toàn bộ hệ thống
docker compose up --build

# 3. Lần đầu: nạp dữ liệu mẫu (chạy từ máy host, cần apps/api/.env như mục 2).
#    Container API tự tạo bảng khi khởi động (prisma migrate deploy).
npm run seed:api
```
> Nếu DB đã có sẵn từ trước, tạo bằng `db:push` (container API báo lỗi `P3005`), chạy **một lần** `npm run db:baseline` để đánh dấu migration đầu tiên đã áp dụng, rồi khởi động lại API.
- **Web UI:** `http://localhost:5173`
- **Backend API:** `http://localhost:3000/api/v1` (Health: `/api/v1/health`)
- **AI Service:** `http://localhost:8000` (Health: `/health`)

### 2. Khởi chạy Local Development (Từng service)
```bash
# Khởi động CSDL PostgreSQL và Redis
docker compose up -d postgres redis

# Lần đầu: cấu hình và chuẩn bị Backend API
cp apps/api/.env.example apps/api/.env
npm install
npm run prisma:generate   # npm bản mới chặn install script của Prisma, phải chạy tay
npm run db:migrate        # tạo bảng (áp dụng các migration trong apps/api/prisma/migrations)
npm run seed:api          # tạo tài khoản mẫu
# Đổi schema.prisma: npm run db:migrate:dev -- --name <ten_thay_doi> rồi commit thư mục migrations.
# DB cũ tạo bằng db:push: chạy một lần npm run db:baseline.

# Chạy Backend API
npm run dev:api

# Chạy Frontend Web
npm run dev:web

# Chạy AI Service (Python 3.12+, không có script npm)
cd apps/ai
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # Linux/macOS: .venv/bin/pip
cp .env.example .env                            # điền OPENAI_API_KEY
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

### 3. Chạy thật (production) trên một máy chủ
Dùng `docker-compose.prod.yml` (không phải `docker-compose.yml`): chỉ proxy Caddy mở cổng ra ngoài, Postgres/API/AI/Web nằm trong mạng nội bộ; API và AI từ chối khởi động nếu còn bí mật mẫu; AI tự quyết đơn **tắt** (chỉ đề xuất) cho tới khi quản trị viên bật.

```bash
cp .env.production.example .env.production   # rồi điền: npm run secrets:generate sinh 5 bí mật; thêm OPENAI_API_KEY
npm run prod:up                              # build và chạy (lần đầu mất vài phút)
npm run prod:seed                            # lần đầu: nạp loại nghỉ, quy chế, ca, mức tự chủ AI (KHÔNG tạo nhân viên mẫu)
npm run prod:admin -- admin@congty.vn "Họ và tên" "MatKhauTam123"   # lần đầu: quản trị viên đầu tiên
```
Mở `http://<địa chỉ máy chủ>/`, đăng nhập quản trị viên (hệ thống bắt đổi mật khẩu ngay), rồi thêm nhân viên ở trang Quản trị.

- **HTTPS:** có tên miền trỏ về máy chủ thì đặt `SITE_ADDRESS=hr.congty.vn` trong `.env.production` và mở cổng 80 + 443: Caddy tự xin và gia hạn chứng chỉ. Để trống thì chạy HTTP cổng 80 (chỉ nên dùng thử, mật khẩu đi qua mạng không mã hóa).
- **Vận hành:** `npm run prod:logs` xem log; `npm run prod:down` tắt (giữ dữ liệu, **không** thêm `-v`); cập nhật bản mới: `git pull` rồi `npm run prod:up` (API tự áp dụng migration).
- **Sao lưu:** `npm run prod:backup` tạo `backups/hr-<ngày-giờ>.sql.gz`. File này chứa dữ liệu nhân sự và các phiên đăng nhập đang mở: cất nơi an toàn. Cách khôi phục ở đầu `scripts/backup-db.mjs`. Nên chạy định kỳ (Task Scheduler/cron) và chép sang máy khác.
- **Bật AI tự duyệt:** sau vài tuần để AI chỉ đề xuất và đối chiếu với quyết định của người duyệt, vào *Agent settings* đổi mức tự chủ từng loại đơn.
- **Một bản API duy nhất:** bộ đếm giới hạn số lần gọi và lịch sử chat của AI nằm trong bộ nhớ tiến trình; chạy nhiều bản thì phải chuyển sang Redis.

### Kiểm tra tự động (CI)
Mỗi Pull Request và mỗi lần đẩy lên `api`/`main`, GitHub Actions (`.github/workflows/`) tự chạy:

| Job | Kiểm tra gì | Chạy cùng việc đó ở máy bạn |
|---|---|---|
| `API + Web build` | `npm ci`, sinh client Prisma, build API và Web | `npm run prisma:generate && npm run build` |
| `AI tests` | toàn bộ test của AI (Python 3.12, LLM giả, không cần key) | `cd apps/ai && python -m pytest -q` |
| `Prisma migrations` | migration áp dụng được lên DB trống; **`schema.prisma` khớp với thư mục migrations**; seed chạy ở cả hai chế độ | `npm run db:migrate`, rồi `npx prisma migrate diff --from-migrations apps/api/prisma/migrations --to-schema-datamodel apps/api/prisma/schema.prisma --shadow-database-url <url> --exit-code` |
| `Docker` (chỉ khi `infra/`, compose hoặc `package*.json` đổi) | dựng cả stack production, chờ mọi dịch vụ `healthy`, gọi thử qua proxy | `npm run prod:up` (cần `.env.production`) |

Job `Prisma migrations` đỏ nghĩa là bạn đổi `schema.prisma` mà chưa tạo migration: chạy `npm run db:migrate:dev -- --name <ten_thay_doi>` rồi commit thư mục `apps/api/prisma/migrations`.
Muốn CI **chặn** merge khi đỏ: GitHub, Settings, Branches, thêm rule cho `api` và `main`, bật *Require status checks to pass before merging* và chọn các job trên.

---

## 👥 Danh sách Tài khoản Kiểm thử Mẫu

Tạo bởi `npm run seed:api`. Đăng nhập bằng email và mật khẩu; **mật khẩu mẫu (chỉ môi trường phát triển) là `Demo@12345`**, đổi bằng biến `SEED_PASSWORD` khi chạy seed:

| Vai trò | Email đăng nhập | Quyền hạn trong hệ thống |
|---|---|---|
| **ADMIN** | `admin@gmail.com` | Quản trị toàn hệ thống, cấu hình 9 quy chế, cấp quyền tự trị AI, giám sát kiểm toán. |
| **HR** | `huyhoang@gmail.com` | Quản lý nhân tài, thêm mới nhân viên, xem toàn bộ đơn từ và nhật ký kiểm toán. |
| **MANAGER** | `tiendung@gmail.com` | Quản lý trực tiếp: xem hàng đợi phê duyệt đơn, duyệt/từ chối đơn cấp dưới. |
| **EMPLOYEE** | `minhphong@gmail.com` | Nhân viên: quẹt thẻ chấm công, nộp 4 loại đơn (Nghỉ phép, Làm thêm OT, Đổi ca, Giải trình công). |

### Quản lý mật khẩu
- Nhân viên mới do HR/Admin tạo nhận **mật khẩu tạm** (hiện đúng một lần trên màn hình); họ phải đổi ngay ở lần đăng nhập đầu. Quên mật khẩu hoặc bị khóa: HR/Admin bấm **Cấp lại** ở danh sách nhân sự (HR chỉ cấp lại cho EMPLOYEE/MANAGER).
- Sai mật khẩu 5 lần liên tiếp thì tài khoản bị khóa 15 phút.
- Tạo hoặc đặt lại **quản trị viên** (đầu tiên khi triển khai, hoặc khi mất quyền truy cập): `npm run admin:create -- admin@congty.vn "Họ và tên" "MatKhauTam123"`, hoặc đặt biến `ADMIN_PASSWORD` thay cho tham số thứ 3.
- Seed với `NODE_ENV=production` khóa các tài khoản mẫu (trừ khi đặt `SEED_DEMO=1` và `SEED_PASSWORD`).

### Bí mật khi chạy thật
Các giá trị trong `.env.example` (mật khẩu Postgres `change-me-local`, `JWT_*`, `AI_*_TOKEN`) **chỉ dành cho máy phát triển** và nằm công khai trong repo. Khi chạy với `NODE_ENV=production` (API) và `APP_ENV=production` (AI), cả hai dịch vụ **từ chối khởi động** nếu còn giá trị mẫu, giá trị ngắn hơn 32 ký tự, hoặc hai bí mật cùng mục đích bị đặt trùng nhau (liệt kê hết các vấn đề một lần).

```bash
npm run secrets:generate   # in POSTGRES_PASSWORD, JWT_*, AI_*_TOKEN ngẫu nhiên (64 ký tự); dán vào .env, không ghi file nào
```
Đổi `JWT_*` thì mọi người phải đăng nhập lại; đổi mật khẩu Postgres trên DB đã có dữ liệu thì phải đổi cả trong Postgres (`ALTER USER`), không chỉ trong `.env`.

---

## 🔒 Quy chuẩn Tích hợp & Bảo mật

- Giao tiếp giữa API và AI được bảo vệ bởi cặp Secret Token: `AI_SERVICE_TOKEN` và `AI_INBOUND_TOKEN`.
- Toàn bộ hành vi nhạy cảm của người dùng và AI đều được ghi vết tự động vào **Nhật ký Kiểm toán (Audit Logs)**.
- Chi tiết hướng dẫn kỹ thuật dành cho đội ngũ AI xem tại: [`docs/07-ai-service-handover.md`](docs/07-ai-service-handover.md).
