// Tạo hoặc đặt lại tài khoản ADMIN (quản trị viên đầu tiên khi triển khai, hoặc khi mất quyền truy cập).
//
//   npm run admin:create -- <email> "<Họ tên>" [mật khẩu]
//   (không truyền mật khẩu thì đọc biến môi trường ADMIN_PASSWORD, tránh để mật khẩu trong lịch sử lệnh)
//
// Mật khẩu này là mật khẩu tạm: lần đăng nhập đầu người dùng phải đổi.
import { EmployeeStatus, PrismaClient, Role } from '@prisma/client';
import { hashSync } from 'bcryptjs';

try {
  process.loadEnvFile(); // apps/api/.env (npm chạy script với thư mục hiện tại là apps/api); biến đã đặt sẵn không bị ghi đè
} catch {
  /* Không có .env: dùng biến môi trường của tiến trình */
}

const prisma = new PrismaClient();

async function main() {
  const [emailArg, fullName, passwordArg] = process.argv.slice(2);
  const password = passwordArg || process.env.ADMIN_PASSWORD || '';
  const email = (emailArg || '').trim().toLowerCase();

  if (!email.includes('@') || !fullName) {
    throw new Error('Cách dùng: npm run admin:create -- <email> "<Họ tên>" [mật khẩu]');
  }
  // Cùng quy tắc với API (modules/auth/password.util.ts)
  if (password.length < 10 || password.length > 72 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('Mật khẩu dài 10–72 ký tự, gồm cả chữ và số (truyền làm tham số thứ 3 hoặc đặt ADMIN_PASSWORD)');
  }

  const data = {
    fullName,
    role: Role.ADMIN,
    status: EmployeeStatus.ACTIVE,
    passwordHash: hashSync(password, 12),
    mustChangePassword: true,
    failedLoginCount: 0,
    lockedUntil: null,
  };
  const admin = await prisma.employee.upsert({
    where: { email },
    update: data,
    create: { email, ...data },
  });
  await prisma.refreshSession.deleteMany({ where: { employeeId: admin.id } }); // Đăng xuất mọi phiên cũ
  console.log(`Đã tạo/đặt lại quản trị viên ${email}. Đăng nhập bằng mật khẩu vừa nhập, hệ thống sẽ yêu cầu đổi ngay.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
