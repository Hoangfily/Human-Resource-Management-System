import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('clock-in')
  async clockIn(
    @CurrentUser('id') employeeId: string,
    @Body('location') location?: string,
    @Body('deviceInfo') deviceInfo?: string,
  ) {
    return this.attendanceService.clockIn(employeeId, location, deviceInfo);
  }

  @Post('clock-out')
  async clockOut(
    @CurrentUser('id') employeeId: string,
    @Body('location') location?: string,
    @Body('deviceInfo') deviceInfo?: string,
  ) {
    return this.attendanceService.clockOut(employeeId, location, deviceInfo);
  }

  @Get('status')
  async getStatus(@CurrentUser('id') employeeId: string) {
    return this.attendanceService.getStatus(employeeId);
  }

  @Get('history')
  async getHistory(@CurrentUser('id') employeeId: string) {
    return this.attendanceService.getHistory(employeeId);
  }
}
