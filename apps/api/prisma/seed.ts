import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create a Department
  const hrDept = await prisma.department.upsert({
    where: { name: 'Human Resources' },
    update: {},
    create: {
      name: 'Human Resources',
      description: 'Manages employee relations and policies',
    },
  });

  // 2. Create an Admin Employee
  const admin = await prisma.employee.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      fullName: 'System Admin',
      role: Role.ADMIN,
      departmentId: hrDept.id,
    },
  });

  // 3. Create a Leave Type
  const annualLeave = await prisma.leaveType.upsert({
    where: { code: 'ANNUAL' },
    update: {},
    create: {
      code: 'ANNUAL',
      name: 'Nghỉ phép năm',
    },
  });

  console.log('Database has been seeded successfully!');
  console.log('Admin:', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
