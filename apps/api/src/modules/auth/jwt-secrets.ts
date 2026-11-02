/**
 * Đọc JWT secret từ biến môi trường. Không có giá trị mặc định: secret ghi cứng trong code
 * thì ai đọc được repo cũng tự ký được token với quyền bất kỳ.
 *
 * Gọi lúc khởi tạo provider (không gọi lúc import module) để .env đã được nạp.
 */

// Giá trị mẫu có trong repo (.env.example): dùng được ở máy local, cấm khi NODE_ENV=production
const PUBLIC_EXAMPLES = new Set([
  'hr_agent_super_secret_jwt_access_token_key_2026',
  'hr_agent_super_secret_jwt_refresh_token_key_2026',
  'replace-with-a-long-random-secret',
  'replace-with-another-long-random-secret',
]);
const MIN_PRODUCTION_LENGTH = 32;

export function jwtSecret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} chưa được cấu hình: API không khởi động khi thiếu biến này (xem apps/api/.env.example)`);
  }
  if (process.env.NODE_ENV === 'production' && (PUBLIC_EXAMPLES.has(value) || value.length < MIN_PRODUCTION_LENGTH)) {
    throw new Error(
      `${name} đang là giá trị mẫu công khai hoặc ngắn hơn ${MIN_PRODUCTION_LENGTH} ký tự: hãy đặt chuỗi ngẫu nhiên dài khi deploy`,
    );
  }
  return value;
}
