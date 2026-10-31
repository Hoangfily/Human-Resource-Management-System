import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /**
   * Điểm danh vào ca làm việc (Check-in)
   */
  @Post('clock-in')
  async clockIn(
    @CurrentUser() caller: { id: string },
    @Body() dto: CheckInDto,
  ) {
    return this.attendanceService.clockIn(caller, dto);
  }

  /**
   * Điểm danh tan ca làm việc (Check-out)
   */
  @Post('clock-out')
  async clockOut(
    @CurrentUser() caller: { id: string },
    @Body() dto: CheckOutDto,
  ) {
    return this.attendanceService.clockOut(caller, dto);
  }

  /**
   * Lấy trạng thái chấm công của ngày hôm nay (hỗ trợ cả /today và alias /status)
   */
  @Get('today')
  async getTodayStatus(@CurrentUser() caller: { id: string }) {
    return this.attendanceService.getTodayStatus(caller);
  }

  @Get('status')
  async getStatusAlias(@CurrentUser() caller: { id: string }) {
    return this.attendanceService.getTodayStatus(caller);
  }

  /**
   * Xem lịch sử chấm công theo tháng của cá nhân
   */
  @Get('history')
  async getMyHistory(
    @CurrentUser() caller: { id: string },
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.attendanceService.getMyHistory(
      caller,
      month ? parseInt(month, 10) : undefined,
      year ? parseInt(year, 10) : undefined,
    );
  }
}
