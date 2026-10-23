import { Injectable, BadRequestException } from '@nestjs/common';
import { AttendanceEventType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async clockIn(employeeId: string, location?: string, deviceInfo?: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const event = await this.prisma.attendanceEvent.create({
      data: {
        employeeId,
        type: AttendanceEventType.CLOCK_IN,
        location: location || 'Văn phòng chính (Tầng 4)',
        deviceInfo: deviceInfo || 'Web Application',
      },
    });

    return {
      success: true,
      type: 'CLOCK_IN',
      time: event.timestamp,
      location: event.location,
      message: `Đã check-in thành công lúc ${new Date(event.timestamp).toLocaleTimeString('vi-VN')}!`,
    };
  }

  async clockOut(employeeId: string, location?: string, deviceInfo?: string) {
    const event = await this.prisma.attendanceEvent.create({
      data: {
        employeeId,
        type: AttendanceEventType.CLOCK_OUT,
        location: location || 'Văn phòng chính (Tầng 4)',
        deviceInfo: deviceInfo || 'Web Application',
      },
    });

    return {
      success: true,
      type: 'CLOCK_OUT',
      time: event.timestamp,
      location: event.location,
      message: `Đã check-out thành công lúc ${new Date(event.timestamp).toLocaleTimeString('vi-VN')}!`,
    };
  }

  async getStatus(employeeId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEvents = await this.prisma.attendanceEvent.findMany({
      where: {
        employeeId,
        timestamp: { gte: todayStart },
      },
      orderBy: { timestamp: 'asc' },
    });

    const firstIn = todayEvents.find((e) => e.type === AttendanceEventType.CLOCK_IN);
    const lastOut = [...todayEvents].reverse().find((e) => e.type === AttendanceEventType.CLOCK_OUT);
    const lastEvent = todayEvents[todayEvents.length - 1];

    const isCheckedIn = lastEvent ? lastEvent.type === AttendanceEventType.CLOCK_IN : false;

    // Tính toán số giờ làm việc trong ngày
    let workedHours = 0;
    if (firstIn) {
      const endTime = lastOut ? lastOut.timestamp.getTime() : new Date().getTime();
      const diffMs = Math.max(0, endTime - firstIn.timestamp.getTime());
      workedHours = Math.round((diffMs / (1000 * 3600)) * 10) / 10;
    }

    // Lấy 10 sự kiện gần nhất
    const recentLogs = await this.prisma.attendanceEvent.findMany({
      where: { employeeId },
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    return {
      isCheckedIn,
      firstClockIn: firstIn ? firstIn.timestamp : null,
      lastClockOut: lastOut ? lastOut.timestamp : null,
      workedHours,
      todayEventsCount: todayEvents.length,
      recentLogs: recentLogs.map((l) => ({
        id: l.id,
        type: l.type,
        timestamp: l.timestamp,
        location: l.location,
      })),
    };
  }

  async getHistory(employeeId: string) {
    const events = await this.prisma.attendanceEvent.findMany({
      where: { employeeId },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    // Gom nhóm theo ngày
    const map = new Map<string, { date: string; in?: string; out?: string; status: string; location: string }>();

    for (const e of events) {
      const dateKey = new Date(e.timestamp).toLocaleDateString('vi-VN');
      const timeStr = new Date(e.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

      if (!map.has(dateKey)) {
        map.set(dateKey, {
          date: dateKey,
          status: 'ON_TIME',
          location: e.location || 'Văn phòng chính',
        });
      }

      const item = map.get(dateKey)!;
      if (e.type === AttendanceEventType.CLOCK_IN && !item.in) {
        item.in = timeStr;
      } else if (e.type === AttendanceEventType.CLOCK_OUT && !item.out) {
        item.out = timeStr;
      }
    }

    return Array.from(map.values());
  }
}
