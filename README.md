# HR Agent

Monorepo cho Hệ thống Quản lý Yêu cầu Nhân sự với AI hỗ trợ phê duyệt.

## Cấu trúc

- `apps/web`: React, Vite và Ant Design.
- `apps/api`: NestJS, Prisma và PostgreSQL.
- `apps/ai`: FastAPI agent; chỉ gọi API, không kết nối trực tiếp database.
- `packages/shared`: kiểu dữ liệu và enum dùng chung cho web/API.
- `docs`: phạm vi, API contract, agent tools, policy và DB schema.

## Bắt đầu

1. Sao chép `.env.example` thành `.env` và cập nhật giá trị phù hợp.
2. Chạy `docker compose up --build`.
3. Web: `http://localhost:5173`; API health: `http://localhost:3000/health`; AI health: `http://localhost:8000/health`.

Compose khởi chạy các service mẫu để kiểm tra kết nối. Các luồng nghiệp vụ và schema HR sẽ được triển khai theo hợp đồng trong `docs/`.

## Quy ước

- Chốt `docs/01-api-contract.md` và `docs/02-agent-tools.md` trước khi triển khai tích hợp.
- Enum/type chia sẻ được định nghĩa trong `packages/shared`.
- `apps/ai` chỉ giao tiếp với hệ thống qua API của `apps/api`.
- Không commit `.env`, token hoặc dữ liệu nhân sự thật.
