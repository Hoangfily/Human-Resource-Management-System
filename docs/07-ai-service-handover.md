# TÀI LIỆU BÀN GIAO & HƯỚNG DẪN KẾT NỐI AI SERVICE
> **Phiên bản:** 1.0 (Chính thức)  
> **Dành cho:** Kỹ sư / Đội ngũ phát triển AI Service (`apps/ai`)  
> **Dự án:** Hệ thống Quản trị Nhân sự Doanh nghiệp Hiện đại (Enterprise HRMS)  
> **Trạng thái:** Backend API & Frontend Web đã hoàn tất 100%, sẵn sàng kết nối.

---

## 1. TỔNG QUAN KIẾN TRÚC TÍCH HỢP

Hệ thống được thiết kế theo kiến trúc tách rời (Decoupled Architecture), giao tiếp giữa Backend API (`apps/api`) và AI Service (`apps/ai`) thông qua giao thức HTTP RESTful được bảo vệ bởi **Cặp Service Token 2 chiều**:

```mermaid
sequenceDiagram
    autonumber
    actor NV as Nhân viên (Web)
    participant API as Backend API (:3000)
    participant AI as AI Service (:8000)
    actor QL as Quản lý (Web)

    NV->>API: 1. Gửi đơn mới (POST /api/v1/requests)
    API->>API: 2. Lưu trạng thái PENDING
    API-->>NV: 3. Trả về thành công (UI mượt mà, không bị treo)
    
    API-)AI: 4. Kích hoạt ngầm (POST :8000/evaluate)<br/>Header: x-service-token: AI_INBOUND_TOKEN
    
    AI->>API: 5. Đọc bổ trợ dữ liệu: quẹt thẻ, lịch ca, 9 quy chế<br/>Header: Authorization: Bearer AI_SERVICE_TOKEN
    API-->>AI: 6. Trả về dữ liệu thô (Events, Schedules, Policies)
    
    Note over AI: AI suy luận & đối soát 9 quy chế<br/>Đánh giá Rủi ro (LOW / MEDIUM / HIGH)
    
    alt Đạt ngưỡng tự trị an toàn (Low Risk, Confidence >= 0.85)
        AI->>API: 7a. Phê duyệt tự động (POST /api/v1/requests/:id/ai-decision)<br/>action: APPROVE, decision: APPROVED
        API->>API: 8a. Tự động duyệt đơn & trừ ngày phép
    else Có rủi ro hoặc vượt ngưỡng tự trị (Escalation)
        AI->>API: 7b. Gửi khuyến nghị (POST /api/v1/requests/:id/ai-decision)<br/>action: ESCALATE_TO_HUMAN, riskLevel: HIGH
        API->>API: 8b. Chuyển vào hàng đợi của Quản lý kèm giải trình AI
        QL->>API: 8c. Quản lý xem xét và ra quyết định cuối cùng
    end
```

---

## 2. THÔNG TIN BẢO MẬT & CẤU HÌNH TOKEN NỘI BỘ

Để đảm bảo an toàn tuyệt đối, hai dịch vụ giao tiếp nội bộ thông qua cặp Secret Token đã được cấu hình đồng bộ sẵn:

| Tên biến môi trường | Giá trị mặc định (Local/Docker) | Mục đích sử dụng |
|---|---|---|
| `AI_SERVICE_TOKEN` | `ai-service-secret-token-hr-2026` | **AI gọi vào API**: Dùng trong header `Authorization: Bearer ...` khi AI gọi các API của Backend. |
| `AI_INBOUND_TOKEN` | `ai-inbound-secret-token-hr-2026` | **API gọi sang AI**: Dùng trong header `x-service-token: ...` khi API kích hoạt endpoint `/evaluate` của AI. |
| `API_BASE_URL` | `http://localhost:3000/api/v1` (Local) <br/> `http://api:3000/api/v1` (Docker) | Địa chỉ gốc của Backend API. |
| `AI_SERVICE_URL` | `http://localhost:8000` (Local) <br/> `http://ai:8000` (Docker) | Địa chỉ gốc của AI Service. |

---

## 3. DANH SÁCH API CONTRACTS DÀNH RIÊNG CHO AI SERVICE

### 3.1. Gửi Quyết định Thẩm định / Duyệt tự động (AI ➔ API)
* **Endpoint:** `POST /api/v1/requests/:id/ai-decision`
* **Xác thực:** Header `Authorization: Bearer ai-service-secret-token-hr-2026` (hoặc `x-service-token`)
* **Body Request mẫu:**
```json
{
  "action": "APPROVE",
  "confidenceScore": 0.95,
  "reason": "Nhân viên còn đủ 11 ngày phép năm 2026. Đơn tạo trước 3 ngày, không trùng lịch dự án quan trọng theo Điều 2 Quy chế Nghỉ phép.",
  "riskLevel": "LOW",
  "policyViolations": [],
  "metadata": {
    "model": "gemini-3.8-flash",
    "executionTimeMs": 620
  }
}
```
* **Các giá trị hợp lệ:**
  - `action`: `'APPROVE'` (Duyệt thẳng) | `'REJECT'` (Từ chối thẳng) | `'ESCALATE_TO_HUMAN'` (Chuyển cấp quản lý) | `'FLAG'` (Gắn cờ nghi vấn)
  - `riskLevel`: `'LOW'` | `'MEDIUM'` | `'HIGH'`
  - `confidenceScore`: Số thực từ `0.0` đến `1.0`
* **Response (200 OK):**
```json
{
  "success": true,
  "requestId": "d8fee2db-3679-4a7c-8ed9-90b30cae4a58",
  "status": "APPROVED",
  "appliedAutonomyLevel": "FULL",
  "message": "Đơn đã được phê duyệt tự động bởi AI"
}
```

---

### 3.2. Đọc Dữ liệu Quẹt thẻ Chấm công thô (AI ➔ API)
* **Endpoint:** `GET /api/v1/attendance/events`
* **Xác thực:** Header `Authorization: Bearer <AI_SERVICE_TOKEN>`
* **Query Parameters:**
  - `employeeId` (string, UUID): Mã nhân viên cần tra cứu
  - `startDate` (string, ISO: `YYYY-MM-DD`)
  - `endDate` (string, ISO: `YYYY-MM-DD`)
* **Response (200 OK):**
```json
[
  {
    "id": "cf7ea4be-89fa-4d99-a03b-08bfe782fb65",
    "employeeId": "db5c74fa-67eb-4fc3-9331-422807c76a72",
    "type": "CLOCK_IN",
    "timestamp": "2026-11-02T01:30:00.000Z",
    "location": "Văn phòng chính (Tầng 4)",
    "deviceInfo": "Web Client"
  },
  {
    "id": "087303d6-7436-4143-acac-a9cd0d0a5543",
    "employeeId": "db5c74fa-67eb-4fc3-9331-422807c76a72",
    "type": "CLOCK_OUT",
    "timestamp": "2026-11-02T10:30:00.000Z",
    "location": "Văn phòng chính (Tầng 4)",
    "deviceInfo": "Web Client"
  }
]
```

---

### 3.3. Đọc Lịch phân ca phòng ban (AI ➔ API)
* **Endpoint:** `GET /api/v1/shifts/schedules`
* **Xác thực:** Header `Authorization: Bearer <AI_SERVICE_TOKEN>`
* **Query Parameters:**
  - `departmentId` (string, UUID): Lấy lịch ca của toàn bộ nhân viên trong phòng
  - `date` (string, `YYYY-MM-DD`): Ngày cần kiểm tra
* **Response (200 OK):**
```json
[
  {
    "id": "schedule-uuid-1",
    "employeeId": "emp-uuid-1",
    "employeeName": "Nguyễn Văn A",
    "date": "2026-11-02",
    "shift": {
      "id": "shift-uuid-1",
      "name": "Ca hành chính tiêu chuẩn",
      "startTime": "08:30",
      "endTime": "17:30"
    }
  }
]
```

---

### 3.4. Đọc 9 Chính sách & Quy chế Công ty (AI ➔ API)
* **Endpoint:** `GET /api/v1/policies`
* **Xác thực:** Header `Authorization: Bearer <AI_SERVICE_TOKEN>`
* **Mô tả:** Trả về toàn bộ nội dung 9 điều khoản quy chế được Admin cấu hình (Nghỉ phép năm, Nghỉ ốm đau, Làm thêm giờ OT, Đổi ca, Quên chấm công...). AI dùng làm Grounding/Context để kiểm tra tính hợp lệ của đơn.

---

## 4. HƯỚNG DẪN KHỞI CHẠY KIỂM THỬ NHANH (QUICKSTART)

### Bước 1: Khởi động Cơ sở dữ liệu & Cache
```bash
docker compose up -d postgres redis
```
*(Postgres chạy tại port 5432, Redis tại port 6379).*

### Bước 2: Chạy Backend API
```bash
npm run dev:api
```
*(API khởi động tại: `http://localhost:3000`).*

### Bước 3: Chạy AI Service
Tại thư mục gốc hoặc trong thư mục `apps/ai`:
```bash
# Đảm bảo file apps/ai/.env đã có GEMINI_API_KEY nếu muốn dùng LLM thật,
# hoặc để LLM_PROVIDER=fake để chạy kiểm thử logic không tốn token LLM
npm run dev:ai
```
*(AI Service lắng nghe tại: `http://localhost:8000`).*

### Bước 4: Chạy Giao diện Web
```bash
npm run dev:web
```
*(Web mở tại: `http://localhost:5173`).*

---

## 5. TÀI KHOẢN MẪU KIỂM THỬ (TEST ACCOUNTS)

Hệ thống đã có sẵn các tài khoản mẫu chuẩn nghiệp vụ:

| Vai trò | Email đăng nhập | Mô tả & Thẩm quyền |
|---|---|---|
| **ADMIN** | `admin@company.com` | Quản trị toàn hệ thống, cấu hình quy chế, quản lý phân quyền, cấu hình tự trị AI. |
| **HR** | `huyhoang@gmail.com` | Phòng nhân sự, tạo nhân viên mới, xem toàn bộ đơn từ và nhật ký kiểm toán. |
| **MANAGER** | `manager@company.com` | Quản lý phê duyệt đơn từ của cấp dưới trực tiếp. |
| **EMPLOYEE** | `minhphong@gmail.com` | Nhân viên nộp đơn xin nghỉ, quẹt thẻ chấm công, đổi ca, làm thêm giờ OT. |

---

## 6. ĐẦU MỐI HỖ TRỢ KỸ THUẬT

- Toàn bộ các API trên đều đã được xác minh kiểm thử tự động đạt **Exit Code 0** và không có lỗi biên dịch.
- Nếu cần bổ sung thêm tham số hoặc trường dữ liệu đặc thù nào cho mô hình học máy, phía Backend API có thể điều chỉnh và mở rộng tức thì.
