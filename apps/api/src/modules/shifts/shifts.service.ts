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
    query: { employeeId?: string; departmentId?: string; from?: string; to?: string },
  ) {
    const where: any = {};

    if (query.departmentId) {
      if (caller.role === 'EMPLOYEE') {
        throw new ForbiddenException('Nhân viên không có quyền xem lịch phân ca theo phòng ban');
      }
      if (caller.role === 'MANAGER') {
        const me = await this.prisma.employee.findUnique({
          where: { id: caller.id },
          select: { departmentId: true },
        });
        if (me?.departmentId !== query.departmentId) {
          throw new ForbiddenException('Quản lý chỉ có quyền xem lịch phân ca của phòng ban mình');
        }
      }
      where.employee = {
        departmentId: query.departmentId,
      };
      if (query.employeeId) {
        where.employeeId = query.employeeId;
      }
    } else {
      const targetEmployeeId = query.employeeId || caller.id;

      if (caller.role === 'EMPLOYEE' && targetEmployeeId !== caller.id) {
        throw new ForbiddenException('Bạn chỉ có quyền xem lịch phân ca của chính mình.');
      }
      if (caller.role === 'MANAGER' && targetEmployeeId !== caller.id) {
        const isSubordinate =
          (await this.prisma.employee.count({
            where: { id: targetEmployeeId, managerId: caller.id },
          })) > 0;
        if (!isSubordinate) {
          throw new ForbiddenException('Quản lý chỉ có quyền xem lịch của nhân viên trực thuộc');
        }
      }
      where.employeeId = targetEmployeeId;
    }

    if (query.from || query.to) {
      where.date = {};
      if (query.from) {
        where.date.gte = new Date(`${query.from.slice(0, 10)}T00:00:00.000Z`);
      }
      if (query.to) {
        where.date.lte = new Date(`${query.to.slice(0, 10)}T23:59:59.999Z`);
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
   * Xem lịch ca cá nhân (Alias hỗ trợ FE)
   */
  async getMySchedule(caller: { id: string; role: string }) {
    const list = await this.getSchedules(caller, { employeeId: caller.id });
    if (list.length > 0) return list;

    const emp = await this.prisma.employee.findUnique({
      where: { id: caller.id },
      include: { defaultShift: true },
    });

    return [
      {
        id: 'default-schedule',
        employeeId: caller.id,
        shiftTemplate: emp?.defaultShift?.name || 'Ca Sáng (08:30 - 17:30)',
        shiftStart: '08:30',
        shiftEnd: '17:30',
        date: new Date(),
      },
    ];
  }

  /**
   * Lấy danh sách đồng nghiệp cùng bộ phận để xin đổi ca
   */
  async getColleagues(caller: { id: string }) {
    const me = await this.prisma.employee.findUnique({
      where: { id: caller.id },
      select: { departmentId: true },
    });

    return this.prisma.employee.findMany({
      where: {
        id: { not: caller.id },
        ...(me?.departmentId ? { departmentId: me.departmentId } : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        defaultShift: true,
        department: { select: { name: true } },
      },
      take: 10,
    });
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

    const targetDate = new Date(`${dto.date.slice(0, 10)}T00:00:00.000Z`);

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
