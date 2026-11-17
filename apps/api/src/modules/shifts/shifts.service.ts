import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateShiftTemplateDto } from './dto/create-shift.dto';
import { AssignScheduleDto } from './dto/assign-schedule.dto';
import {
  addDays,
  COMPANY_TIMEZONE,
  todayInCompany,
  weekday,
} from '../../common/utils/company-date';

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
   * Xem lịch ca cá nhân (Alias hỗ trợ FE ShiftsPage và RequestsPage)
   */
  async getMySchedule(caller: { id: string; role: string }) {
    // 1. Tìm thông tin nhân viên đăng nhập kèm thông tin quản lý & phòng ban
    const emp = await this.prisma.employee.findUnique({
      where: { id: caller.id },
      include: {
        defaultShift: true,
        department: true,
        manager: { select: { id: true, fullName: true } },
      },
    });

    // 2. Xác định phạm vi tuần hiện tại (Thứ Hai -> Chủ Nhật) theo múi giờ công ty
    const todayStr = todayInCompany();
    const dow = weekday(todayStr); // 0 = CN, 1 = T2, ..., 6 = T7
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    const mondayStr = addDays(todayStr, diffToMonday);
    const sundayStr = addDays(mondayStr, 6);

    const mondayDate = new Date(`${mondayStr}T00:00:00.000Z`);
    const sundayDate = new Date(`${sundayStr}T23:59:59.999Z`);

    // 3. Lấy lịch phân ca của nhân viên trong tuần này
    const mySchedules = await this.prisma.schedule.findMany({
      where: {
        employeeId: caller.id,
        date: { gte: mondayDate, lte: sundayDate },
      },
      orderBy: { date: 'asc' },
    });

    // 4. Lấy lịch trực của đồng nghiệp cùng phòng ban trong tuần
    const deptId = emp?.departmentId;
    const deptSchedules = deptId
      ? await this.prisma.schedule.findMany({
          where: {
            employee: { departmentId: deptId },
            date: { gte: mondayDate, lte: sundayDate },
          },
          include: {
            employee: { select: { id: true, fullName: true } },
          },
        })
      : [];

    const dayNames = [
      'Chủ Nhật',
      'Thứ Hai',
      'Thứ Ba',
      'Thứ Tư',
      'Thứ Năm',
      'Thứ Sáu',
      'Thứ Bảy',
    ];

    const weekShifts: any[] = [];
    let todayShiftData: any = null;

    for (let i = 0; i < 7; i++) {
      const currentDayStr = addDays(mondayStr, i);
      const currentDow = weekday(currentDayStr);
      const dayLabel = `${dayNames[currentDow]} (${currentDayStr.slice(8, 10)}/${currentDayStr.slice(5, 7)})`;

      const foundSchedule = mySchedules.find(
        (s) => s.date.toISOString().slice(0, 10) === currentDayStr,
      );

      let shiftCode = 'NGHI_CA';
      let shiftTime = '—';
      let room = '—';
      let colleaguesList = '—';
      let shiftName = 'Nghỉ ca';

      if (foundSchedule) {
        const startH = new Intl.DateTimeFormat('en-GB', {
          timeZone: COMPANY_TIMEZONE,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(foundSchedule.shiftStart);
        const endH = new Intl.DateTimeFormat('en-GB', {
          timeZone: COMPANY_TIMEZONE,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(foundSchedule.shiftEnd);

        shiftTime = `${startH} - ${endH}`;
        room = emp?.department?.name
          ? `${emp.department.name} (Tầng 3)`
          : 'Phòng Kỹ thuật (Tầng 3)';

        const startHour = Number(startH.split(':')[0]);
        if (startHour >= 6 && startHour < 12) {
          shiftCode = 'CA_SANG';
          shiftName = 'Ca Sáng';
        } else if (startHour >= 12 && startHour < 18) {
          shiftCode = 'CA_CHIEU';
          shiftName = 'Ca Chiều';
        } else {
          shiftCode = 'CA_DEM';
          shiftName = 'Ca Đêm';
        }

        const sameShiftColleagues = deptSchedules
          .filter(
            (ds) =>
              ds.employeeId !== caller.id &&
              ds.date.toISOString().slice(0, 10) === currentDayStr &&
              Math.abs(ds.shiftStart.getTime() - foundSchedule.shiftStart.getTime()) < 3600000,
          )
          .map((ds) => ds.employee.fullName);

        colleaguesList =
          sameShiftColleagues.length > 0
            ? sameShiftColleagues.slice(0, 3).join(', ')
            : 'Trực ca độc lập';
      } else if (currentDow !== 0 && currentDow !== 6 && emp?.defaultShift) {
        shiftTime = `${emp.defaultShift.startTime} - ${emp.defaultShift.endTime}`;
        room = emp?.department?.name || 'Văn phòng chính (Tầng 4)';
        const startHour = Number(emp.defaultShift.startTime.split(':')[0]);
        if (startHour >= 6 && startHour < 12) {
          shiftCode = 'CA_SANG';
          shiftName = 'Ca Sáng';
        } else if (startHour >= 12 && startHour < 18) {
          shiftCode = 'CA_CHIEU';
          shiftName = 'Ca Chiều';
        } else {
          shiftCode = 'CA_DEM';
          shiftName = 'Ca Đêm';
        }
        colleaguesList = 'Theo phân bổ mặc định';
      }

      const item = {
        key: foundSchedule?.id || `sch-${currentDayStr}`,
        id: foundSchedule?.id || `sch-${currentDayStr}`,
        date: currentDayStr,
        day: dayLabel,
        shift: shiftCode,
        shiftName,
        time: shiftTime,
        room,
        colleagues: colleaguesList,
      };

      weekShifts.push(item);

      if (currentDayStr === todayStr) {
        todayShiftData = {
          name: shiftName,
          time: shiftTime !== '—' ? shiftTime : 'Nghỉ theo lịch tuần',
          location: room !== '—' ? room : 'Văn phòng chính (Tầng 4)',
          manager: emp?.manager?.fullName || 'Nguyễn Tiến Dũng',
        };
      }
    }

    if (!todayShiftData) {
      todayShiftData = {
        name: 'Ca Sáng',
        time: '08:30 - 17:30',
        location: emp?.department?.name || 'Văn phòng chính (Tầng 4)',
        manager: emp?.manager?.fullName || 'Nguyễn Tiến Dũng',
      };
    }

    return {
      todayShift: todayShiftData,
      weekShifts,
      schedules: mySchedules.map((s) => ({
        id: s.id,
        date: s.date.toISOString().slice(0, 10),
        shiftStart: s.shiftStart.toISOString(),
        shiftEnd: s.shiftEnd.toISOString(),
        shiftTemplate:
          weekShifts.find((w) => w.key === s.id)?.shiftName || 'Ca làm việc',
      })),
    };
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
        position: { select: { title: true } },
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
