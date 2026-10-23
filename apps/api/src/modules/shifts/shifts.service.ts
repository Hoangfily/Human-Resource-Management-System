import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateShiftTemplateDto } from './dto/create-shift.dto';
import { AssignScheduleDto } from './dto/assign-schedule.dto';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 1. Lấy danh sách tất cả các Mẫu ca làm việc tiêu chuẩn (ShiftTemplate)
   */
  async getAllShiftTemplates() {
    return this.prisma.shiftTemplate.findMany({
      orderBy: { startTime: 'asc' },
    });
  }

  /**
   * 2. Tạo mới mẫu ca làm việc (Dành cho HR / Admin)
   */
  async createShiftTemplate(caller: { role: string }, dto: CreateShiftTemplateDto) {
    if (caller.role !== 'HR' && caller.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Chỉ có bộ phận HR hoặc Quản trị viên mới có quyền tạo mẫu ca làm việc.',
      );
    }

    const existing = await this.prisma.shiftTemplate.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new BadRequestException(`Ca làm việc '${dto.name}' đã tồn tại.`);
    }

    return this.prisma.shiftTemplate.create({
      data: {
        name: dto.name,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });
  }

  /**
   * 3. Lấy lịch phân ca làm việc (Schedule) của nhân viên hoặc phòng ban
   */
  async getSchedules(
    caller: { id: string; role: string },
    query: { employeeId?: string; from?: string; to?: string },
  ) {
    const targetEmployeeId = query.employeeId || caller.id;

    // Nhân viên chỉ được xem lịch của mình, trừ khi là Manager / HR / Admin
    if (
      caller.role === 'EMPLOYEE' &&
      targetEmployeeId !== caller.id
    ) {
      throw new ForbiddenException('Bạn chỉ có quyền xem lịch phân ca của chính mình.');
    }

    const where: any = {
      employeeId: targetEmployeeId,
    };

    if (query.from || query.to) {
      where.date = {};
      if (query.from) {
        where.date.gte = new Date(query.from);
      }
      if (query.to) {
        where.date.lte = new Date(query.to);
      }
    }

    const schedules = await this.prisma.schedule.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            email: true,
            department: { select: { id: true, name: true } },
            position: { select: { id: true, title: true } },
            defaultShift: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    });

    return schedules;
  }

  /**
   * 4. Phân ca làm việc cho nhân viên theo ngày (Manager / HR / Admin)
   */
  async assignSchedule(caller: { role: string }, dto: AssignScheduleDto) {
    if (caller.role === 'EMPLOYEE') {
      throw new ForbiddenException(
        'Nhân viên không có quyền phân ca làm việc.',
      );
    }

    const targetDate = new Date(dto.date);
    targetDate.setHours(0, 0, 0, 0);

    return this.prisma.schedule.upsert({
      where: {
        employeeId_date: {
          employeeId: dto.employeeId,
          date: targetDate,
        },
      },
      update: {
        shiftStart: new Date(dto.shiftStart),
        shiftEnd: new Date(dto.shiftEnd),
      },
      create: {
        employeeId: dto.employeeId,
        date: targetDate,
        shiftStart: new Date(dto.shiftStart),
        shiftEnd: new Date(dto.shiftEnd),
      },
    });
  }
}
