import { AutonomyLevel, PrismaClient, RequestType, Role } from '@prisma/client';

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

  // 3. Create Leave Types (see docs/05-business-spec.md §3.1)
  const leaveTypes = [
    { code: 'ANNUAL', name: 'Nghỉ phép năm' },
    { code: 'SICK', name: 'Nghỉ ốm' },
    { code: 'UNPAID', name: 'Nghỉ không lương' },
    { code: 'PERSONAL', name: 'Nghỉ việc riêng có lương' },
  ];
  for (const leaveType of leaveTypes) {
    await prisma.leaveType.upsert({
      where: { code: leaveType.code },
      update: {},
      create: leaveType,
    });
  }

  // 4. Default AI autonomy per request type (see docs/03-policy.md "AI autonomy")
  const autonomyDefaults = [
    { requestType: RequestType.LEAVE, level: AutonomyLevel.AUTO_DECIDE_LOW_RISK },
    { requestType: RequestType.OVERTIME, level: AutonomyLevel.AUTO_APPROVE_LOW_RISK },
    { requestType: RequestType.ATTENDANCE_EXPLANATION, level: AutonomyLevel.AUTO_APPROVE_LOW_RISK },
    { requestType: RequestType.SHIFT_CHANGE, level: AutonomyLevel.AUTO_DECIDE_LOW_RISK },
  ];
  for (const config of autonomyDefaults) {
    await prisma.autonomyConfig.upsert({
      where: { requestType: config.requestType },
      update: {},
      create: { ...config, minConfidence: 0.85 },
    });
  }

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
