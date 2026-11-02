# Hệ thống Quản trị Nhân sự Doanh nghiệp Hiện đại (Enterprise HRMS)

Monorepo cho Hệ thống Quản lý Nhân sự, Chấm công, Phân ca làm việc và Phê duyệt Đơn từ tự động với Trợ lý AI.

---

## 🏛️ Kiến trúc Monorepo

- `apps/web`: Frontend Web React 18, Vite, Ant Design Doanh nghiệp cao cấp.
- `apps/api`: Backend Core NestJS, Prisma ORM, PostgreSQL & Redis.
- `apps/ai`: AI Decision Service (FastAPI / Gemini AI Agent); giao tiếp qua API chuẩn mực, không can thiệp trực tiếp Database.
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
# 1. Sao chép biến môi trường mẫu
cp .env.example .env

# 2. Khởi chạy toàn bộ hệ thống
docker compose up --build
```
- **Web UI:** `http://localhost:5173`
- **Backend API:** `http://localhost:3000` (Health: `/health`)
- **AI Service:** `http://localhost:8000` (Health: `/health`)

### 2. Khởi chạy Local Development (Từng service)
```bash
# Khởi động CSDL PostgreSQL và Redis
docker compose up -d postgres redis

# Chạy Backend API
npm run dev:api

# Chạy Frontend Web
npm run dev:web

# Chạy AI Service
npm run dev:ai
```

---

## 👥 Danh sách Tài khoản Kiểm thử Mẫu

Hệ thống đã nạp sẵn dữ liệu kiểm thử chuẩn doanh nghiệp:

| Vai trò | Email đăng nhập | Quyền hạn trong hệ thống |
|---|---|---|
| **ADMIN** | `admin@company.com` | Quản trị toàn hệ thống, cấu hình 9 quy chế, cấp quyền tự trị AI, giám sát kiểm toán. |
| **HR** | `huyhoang@gmail.com` | Quản lý nhân tài, thêm mới nhân viên, xem toàn bộ đơn từ và nhật ký kiểm toán. |
| **MANAGER** | `manager@company.com` | Quản lý trực tiếp: xem hàng đợi phê duyệt đơn, duyệt/từ chối đơn cấp dưới. |
| **EMPLOYEE** | `minhphong@gmail.com` | Nhân viên: quẹt thẻ chấm công, nộp 4 loại đơn (Nghỉ phép, Làm thêm OT, Đổi ca, Giải trình công). |

---

## 🔒 Quy chuẩn Tích hợp & Bảo mật

- Giao tiếp giữa API và AI được bảo vệ bởi cặp Secret Token: `AI_SERVICE_TOKEN` và `AI_INBOUND_TOKEN`.
- Toàn bộ hành vi nhạy cảm của người dùng và AI đều được ghi vết tự động vào **Nhật ký Kiểm toán (Audit Logs)**.
- Chi tiết hướng dẫn kỹ thuật dành cho đội ngũ AI xem tại: [`docs/07-ai-service-handover.md`](docs/07-ai-service-handover.md).
