// In ra các secret ngẫu nhiên cho môi trường production, dạng dòng KEY=value để dán vào .env ở gốc repo.
//
//   npm run secrets:generate
//
// Chỉ in ra màn hình, không ghi file nào: tránh ghi đè .env đang dùng, và không để lại secret trong thư mục dự án.
import { randomBytes } from 'node:crypto';

// 48 byte ngẫu nhiên của hệ điều hành = 64 ký tự base64url (chỉ có A-Z a-z 0-9 - _, an toàn khi nằm trong URL kết nối DB)
const secret = () => randomBytes(48).toString('base64url');

const lines = [
  '# Dán vào .env ở gốc repo (cùng thư mục docker-compose.prod.yml). Không commit file này.',
  `POSTGRES_PASSWORD=${secret()}`,
  `JWT_ACCESS_SECRET=${secret()}`,
  `JWT_REFRESH_SECRET=${secret()}`,
  `AI_SERVICE_TOKEN=${secret()}`,
  `AI_INBOUND_TOKEN=${secret()}`,
  '# Còn phải tự điền: OPENAI_API_KEY (và SITE_ADDRESS nếu có tên miền)',
];

console.log(lines.join('\n'));
console.error(
  '\nMỗi giá trị chỉ hiện một lần ở đây. Đổi JWT_* sẽ đăng xuất mọi người; đổi POSTGRES_PASSWORD trên DB đã có dữ liệu ' +
    'thì phải đổi cả mật khẩu trong Postgres (ALTER USER), không chỉ trong .env.',
);
