import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceEventType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper: Lấy mốc thời gian bắt đầu (00:00:00) và kết thúc (23:59:59) của một ngày
   */
  private getDayRange(date = new Date()) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return { startOfDay, endOfDay };
  }

  /**
   * 1. Quẹt thẻ vào ca (Check-in / Clock-in)
   */
  async clockIn(caller: { id: string }, dto: CheckInDto) {
    const now = new Date();
    const { startOfDay, endOfDay } = this.getDayRange(now);

    // Kiểm tra xem nhân viên này hôm nay đã check-in chưa
    const existingIn = await this.prisma.attendanceEvent.findFirst({
      where: {
        employeeId: caller.id,
        type: AttendanceEventType.CLOCK_IN,
        timestamp: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { timestamp: 'desc' },
    });

    const existingOut = await this.prisma.attendanceEvent.findFirst({
      where: {
        employeeId: caller.id,
        type: AttendanceEventType.CLOCK_OUT,
        timestamp: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { timestamp: 'desc' },
    });

    // Nếu đã check-in và chưa check-out thì nhắc nhở
    if (existingIn && (!existingOut || existingOut.timestamp < existingIn.timestamp)) {
      const timeStr = existingIn.timestamp.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      });
      throw new BadRequestException(
        `Bạn đã thực hiện Check-in hôm nay lúc ${timeStr}. Vui lòng Check-out khi hết ca làm.`,
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

    // Tìm sự kiện check-in gần nhất trong ngày
    const lastIn = await this.prisma.attendanceEvent.findFirst({
      where: {
        employeeId: caller.id,
        type: AttendanceEventType.CLOCK_IN,
        timestamp: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { timestamp: 'desc' },
    });

    if (!lastIn) {
      throw new BadRequestException(
        'Bạn chưa thực hiện Check-in ngày hôm nay. Vui lòng Check-in trước khi Check-out.',
      );
    }

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

    const isCheckedIn = Boolean(firstIn);
    // Đã checkout nếu có event OUT sau event IN cuối cùng
    const isCheckedOut = Boolean(
      lastOut && firstIn && lastOut.timestamp.getTime() > firstIn.timestamp.getTime(),
    );

    let workingHours = 0;
    if (firstIn) {
      const endTime = lastOut ? lastOut.timestamp.getTime() : now.getTime();
      workingHours = parseFloat(((endTime - firstIn.timestamp.getTime()) / (1000 * 60 * 60)).toFixed(2));
    }

    return {
      date: now.toISOString().split('T')[0],
      isCheckedIn,
      isCheckedOut,
      clockInTime: firstIn?.timestamp || null,
      clockOutTime: lastOut?.timestamp || null,
      workingHours,
      eventsCount: events.length,
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
      const dateKey = evt.timestamp.toISOString().split('T')[0];
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

      return {
        date: dateStr,
        clockIn: firstIn?.timestamp ? firstIn.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—',
        clockOut: lastOut?.timestamp ? lastOut.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—',
        totalHours,
        status,
        location: firstIn?.location || 'Văn phòng',
      };
    });

    return {
      month: targetMonth,
      year: targetYear,
      totalDaysWorked: history.length,
      history,
    };
  }
}
