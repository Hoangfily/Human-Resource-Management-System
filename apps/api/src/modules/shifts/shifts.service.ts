import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMySchedule(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        defaultShift: true,
        department: true,
      },
    });

    const shiftTemplate = employee?.defaultShift || {
      name: 'Ca Sáng',
      startTime: '08:30',
      endTime: '17:30',
    };

    // Tìm đồng nghiệp cùng phòng ban
    const colleagues = await this.prisma.employee.findMany({
      where: {
        departmentId: employee?.departmentId || undefined,
        id: { not: employeeId },
        status: 'ACTIVE',
      },
      select: { id: true, fullName: true },
      take: 5,
    });

    const colleagueNames = colleagues.map((c) => c.fullName).join(', ') || 'Nguyễn Tiến Dũng, Hoàng Lan';

    // Tạo lịch biểu 7 ngày trong tuần hiện tại
    const daysName = [
      'Chủ Nhật',
      'Thứ Hai',
      'Thứ Ba',
      'Thứ Tư',
      'Thứ Năm',
      'Thứ Sáu',
      'Thứ Bảy',
    ];

    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 is Sunday
    // Tính ngày Thứ Hai đầu tuần
    const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);

    const weekShifts = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dayIndex = d.getDay();
      const isWeekend = dayIndex === 0 || dayIndex === 6;

      const dateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      const dayLabel = `${daysName[dayIndex]} (${dateStr})`;

      if (isWeekend) {
        weekShifts.push({
          key: String(i + 1),
          day: dayLabel,
          date: d.toISOString().split('T')[0],
          shift: 'NGHI_CA',
          shiftName: 'Nghỉ theo lịch',
          time: '—',
          room: '—',
          colleagues: '—',
          isWeekend: true,
        });
      } else {
        weekShifts.push({
          key: String(i + 1),
          day: dayLabel,
          date: d.toISOString().split('T')[0],
          shift: i === 2 ? 'CA_CHIEU' : 'CA_SANG',
          shiftName: i === 2 ? 'Ca Chiều' : shiftTemplate.name,
          time: i === 2 ? '13:00 - 21:00' : `${shiftTemplate.startTime} - ${shiftTemplate.endTime}`,
          room: i === 2 ? 'Phòng Dự án Tầng 4' : 'Văn phòng chính Tầng 4',
          colleagues: colleagueNames,
          isWeekend: false,
        });
      }
    }

    return {
      shiftTemplate,
      todayShift: {
        name: shiftTemplate.name,
        time: `${shiftTemplate.startTime} - ${shiftTemplate.endTime}`,
        location: 'Văn phòng chính Tầng 4',
        manager: employee?.department?.name || 'Phòng CNTT',
      },
      weekShifts,
    };
  }

  async getShiftTemplates() {
    return this.prisma.shiftTemplate.findMany({
      orderBy: { startTime: 'asc' },
    });
  }

  async getColleagues(employeeId: string) {
    const me = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { departmentId: true },
    });

    return this.prisma.employee.findMany({
      where: {
        id: { not: employeeId },
        departmentId: me?.departmentId || undefined,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        department: { select: { name: true } },
        position: { select: { title: true } },
      },
    });
  }
}
