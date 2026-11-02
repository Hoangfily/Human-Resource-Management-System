import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AttendanceEventType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper: Lấy mốc thời gian bắt đầu (00:00:00) và kết thúc (23:59:59) theo múi giờ Việt Nam
   */
  private getDayRange(date = new Date()) {
    const vnDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
    const startOfDay = new Date(`${vnDateStr}T00:00:00+07:00`);
    const endOfDay = new Date(`${vnDateStr}T23:59:59.999+07:00`);

    return { startOfDay, endOfDay };
  }

  /**
   * 1. Quẹt thẻ vào ca (Check-in / Clock-in)
   */
  async clockIn(caller: { id: string }, dto: CheckInDto) {
    const now = new Date();
    const { startOfDay, endOfDay } = this.getDayRange(now);

    // Lấy sự kiện quẹt thẻ gần nhất hôm nay
    const latestEvent = await this.prisma.attendanceEvent.findFirst({
      where: {
        employeeId: caller.id,
        timestamp: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { timestamp: 'desc' },
    });

    // Nếu lần quẹt gần nhất là CLOCK_IN -> đang trong ca, không cho check-in tiếp
    if (latestEvent && latestEvent.type === AttendanceEventType.CLOCK_IN) {
      const timeStr = latestEvent.timestamp.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      });
      throw new BadRequestException(
        `Bạn đang trong ca làm việc (đã Check-in lúc ${timeStr}). Vui lòng Check-out khi kết thúc ca.`,
      );
    }

    // Lấy ca làm việc tiêu chuẩn của nhân viên để so sánh giờ vào
    const employee = await this.prisma.employee.findUnique({
      where: { id: caller.id },
      include: { defaultShift: true },
    });

    // Lưu sự kiện CLOCK_IN vào cơ sở dữ liệu
    const event = await this.prisma.attendanceEvent.create({
      data: {
        employeeId: caller.id,
        type: AttendanceEventType.CLOCK_IN,
        timestamp: now,
        location: dto.location || 'Văn phòng chính',
        deviceInfo: dto.deviceInfo || 'Web Browser',
      },
    });

    let isLate = false;
    let lateMinutes = 0;
    if (employee?.defaultShift?.startTime) {
      const [shiftHour, shiftMin] = employee.defaultShift.startTime.split(':').map(Number);
      const shiftStartTime = new Date(now);
      shiftStartTime.setHours(shiftHour, shiftMin, 0, 0);

      // Nếu vào sau giờ ca quy định quá 5 phút
      if (now.getTime() > shiftStartTime.getTime() + 5 * 60 * 1000) {
        isLate = true;
        lateMinutes = Math.round((now.getTime() - shiftStartTime.getTime()) / (60 * 1000));
      }
    }

    return {
      message: 'Check-in thành công!',
      event: {
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        location: event.location,
        isLate,
        lateMinutes,
      },
    };
  }

  /**
   * 2. Quẹt thẻ ra ca (Check-out / Clock-out)
   */
  async clockOut(caller: { id: string }, dto: CheckOutDto) {
    const now = new Date();
    const { startOfDay, endOfDay } = this.getDayRange(now);

    // Lấy sự kiện quẹt thẻ gần nhất hôm nay
    const latestEvent = await this.prisma.attendanceEvent.findFirst({
      where: {
        employeeId: caller.id,
        timestamp: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { timestamp: 'desc' },
    });

    if (!latestEvent || latestEvent.type !== AttendanceEventType.CLOCK_IN) {
      if (latestEvent && latestEvent.type === AttendanceEventType.CLOCK_OUT) {
        const outTime = latestEvent.timestamp.toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
        });
        throw new BadRequestException(
          `Bạn đã thực hiện Check-out hôm nay lúc ${outTime} rồi. Vui lòng Check-in ca mới nếu muốn tiếp tục làm việc.`,
        );
      }
      throw new BadRequestException(
        'Bạn chưa thực hiện Check-in ngày hôm nay. Vui lòng Check-in trước khi Check-out.',
      );
    }

    // Tìm lần check-in gần nhất để tính thời gian làm
    const lastIn = latestEvent;

    // Tạo sự kiện CLOCK_OUT
    const event = await this.prisma.attendanceEvent.create({
      data: {
        employeeId: caller.id,
        type: AttendanceEventType.CLOCK_OUT,
        timestamp: now,
        location: dto.location || 'Văn phòng chính',
        deviceInfo: dto.deviceInfo || 'Web Browser',
      },
    });

    // Tính tổng thời gian làm việc (giờ)
    const workDurationMs = now.getTime() - lastIn.timestamp.getTime();
    const workingHours = parseFloat((workDurationMs / (1000 * 60 * 60)).toFixed(2));

    return {
      message: 'Check-out thành công! Tạm biệt và hẹn gặp lại.',
      event: {
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        location: event.location,
        workingHours,
      },
    };
  }

  /**
   * 3. Lấy trạng thái chấm công hôm nay của cá nhân
   */
  async getTodayStatus(caller: { id: string }) {
    const now = new Date();
    const { startOfDay, endOfDay } = this.getDayRange(now);

    const events = await this.prisma.attendanceEvent.findMany({
      where: {
        employeeId: caller.id,
        timestamp: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { timestamp: 'asc' },
    });

    const firstIn = events.find((e) => e.type === AttendanceEventType.CLOCK_IN);
    const lastOut = [...events].reverse().find((e) => e.type === AttendanceEventType.CLOCK_OUT);
    const latestEvent = events[events.length - 1];

    const isCurrentlyWorking = Boolean(latestEvent && latestEvent.type === AttendanceEventType.CLOCK_IN);
    const hasCompletedShift = Boolean(latestEvent && latestEvent.type === AttendanceEventType.CLOCK_OUT);

    let workingHours = 0;
    if (firstIn) {
      const endTime = lastOut ? lastOut.timestamp.getTime() : now.getTime();
      workingHours = parseFloat(((endTime - firstIn.timestamp.getTime()) / (1000 * 60 * 60)).toFixed(2));
    }

    const firstInFormatted = firstIn?.timestamp
      ? firstIn.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      : null;
    const lastOutFormatted = lastOut?.timestamp
      ? lastOut.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      : null;

    return {
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now),
      // Phục vụ giao diện: isCheckedIn chỉ là TRUE khi người đó thực sự đang trong ca (chưa check-out)
      isCheckedIn: isCurrentlyWorking,
      isCheckedOut: hasCompletedShift,
      status: isCurrentlyWorking ? 'CHECKED_IN' : hasCompletedShift ? 'CHECKED_OUT' : 'NOT_CHECKED_IN',
      clockInTime: firstIn?.timestamp || null,
      clockOutTime: lastOut?.timestamp || null,
      firstClockIn: firstIn?.timestamp || null,
      lastClockOut: lastOut?.timestamp || null,
      checkInTime: firstInFormatted,
      checkOutTime: lastOutFormatted,
      workingHours,
      workedHours: workingHours,
      eventsCount: events.length,
      todayEventsCount: events.length,
      recentLogs: events.map((e) => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp.toISOString(),
        location: e.location,
      })),
    };
  }

  /**
   * 4. Xem lịch sử chấm công theo tháng/năm của nhân viên
   */
  async getMyHistory(caller: { id: string }, month?: number, year?: number) {
    const now = new Date();
    const targetYear = year ?? now.getFullYear();
    const targetMonth = month ?? now.getMonth() + 1;

    // Tính ngày bắt đầu và kết thúc của tháng cần xem
    const startDate = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    const events = await this.prisma.attendanceEvent.findMany({
      where: {
        employeeId: caller.id,
        timestamp: { gte: startDate, lte: endDate },
      },
      orderBy: { timestamp: 'asc' },
    });

    // Gom nhóm theo từng ngày (YYYY-MM-DD)
    const groupedByDate: Record<string, typeof events> = {};
    for (const evt of events) {
      const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(evt.timestamp);
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = [];
      }
      groupedByDate[dateKey].push(evt);
    }

    // Định dạng dữ liệu cho từng ngày
    const history = Object.entries(groupedByDate).map(([dateStr, dayEvents]) => {
      const firstIn = dayEvents.find((e) => e.type === AttendanceEventType.CLOCK_IN);
      const lastOut = [...dayEvents].reverse().find((e) => e.type === AttendanceEventType.CLOCK_OUT);

      let totalHours = 0;
      let status: 'ON_TIME' | 'LATE' | 'IN_PROGRESS' = 'IN_PROGRESS';

      if (firstIn && lastOut) {
        totalHours = parseFloat(
          ((lastOut.timestamp.getTime() - firstIn.timestamp.getTime()) / (1000 * 60 * 60)).toFixed(2),
        );
        status = 'ON_TIME';
      } else if (firstIn && !lastOut) {
        status = 'IN_PROGRESS';
      }

      const inFormatted = firstIn?.timestamp ? firstIn.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';
      const outFormatted = lastOut?.timestamp ? lastOut.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—';

      return {
        date: dateStr,
        in: inFormatted,
        out: outFormatted,
        clockIn: inFormatted,
        clockOut: outFormatted,
        duration: `${totalHours} giờ`,
        totalHours,
        status,
        location: firstIn?.location || 'Văn phòng chính',
      };
    });

    return {
      month: targetMonth,
      year: targetYear,
      totalDaysWorked: history.length,
      history,
    };
  }

  /**
   * 5. Lấy danh sách sự kiện quẹt thẻ thô (raw events) cho AI & HR (docs/06 item 5)
   */
  async getRawEvents(
    caller: { id: string; role: string },
    query: { employeeId?: string; from?: string; to?: string },
  ) {
    const targetEmployeeId = query.employeeId || caller.id;

    if (caller.role === 'EMPLOYEE' && targetEmployeeId !== caller.id) {
      throw new ForbiddenException('Nhân viên chỉ có quyền xem dữ liệu chấm công của chính mình');
    }

    if (caller.role === 'MANAGER') {
      const isSubordinate =
        targetEmployeeId === caller.id ||
        (await this.prisma.employee.count({
          where: { id: targetEmployeeId, managerId: caller.id },
        })) > 0;
      if (!isSubordinate) {
        throw new ForbiddenException('Quản lý chỉ có quyền xem dữ liệu của nhân viên trực thuộc');
      }
    }

    const where: any = {
      employeeId: targetEmployeeId,
    };

    if (query.from || query.to) {
      where.timestamp = {};
      if (query.from) {
        where.timestamp.gte = new Date(`${query.from.slice(0, 10)}T00:00:00.000Z`);
      }
      if (query.to) {
        where.timestamp.lte = new Date(`${query.to.slice(0, 10)}T23:59:59.999Z`);
      }
    }

    const events = await this.prisma.attendanceEvent.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      select: {
        id: true,
        employeeId: true,
        type: true,
        timestamp: true,
      },
    });

    return events;
  }
}
