import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateShiftTemplateDto } from './dto/create-shift.dto';
import { AssignScheduleDto } from './dto/assign-schedule.dto';

@Controller('shifts')
@UseGuards(JwtAuthGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  /**
   * Lấy danh sách mẫu ca làm việc tiêu chuẩn (Ca sáng, Ca chiều...)
   */
  @Get('templates')
  async getTemplates() {
    return this.shiftsService.getAllShiftTemplates();
  }

  /**
   * Xem ca làm việc cá nhân (Hỗ trợ alias FE)
   */
  @Get('my-schedule')
  async getMySchedule(@CurrentUser() caller: { id: string; role: string }) {
    return this.shiftsService.getMySchedule(caller);
  }

  /**
   * Xem đồng nghiệp cùng bộ phận để đổi ca (Hỗ trợ FE)
   */
  @Get('colleagues')
  async getColleagues(@CurrentUser() caller: { id: string }) {
    return this.shiftsService.getColleagues(caller);
  }

  /**
   * Tạo mới mẫu ca làm việc (HR / Admin)
   */
  @Post('templates')
  async createTemplate(
    @CurrentUser() caller: { role: string },
    @Body() dto: CreateShiftTemplateDto,
  ) {
    return this.shiftsService.createShiftTemplate(caller, dto);
  }

  /**
   * Xem lịch phân ca làm việc
   */
  @Get('schedules')
  async getSchedules(
    @CurrentUser() caller: { id: string; role: string },
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.shiftsService.getSchedules(caller, { employeeId, from, to });
  }

  /**
   * Phân ca làm việc cho nhân sự (Manager / HR / Admin)
   */
  @Post('schedules/assign')
  async assignSchedule(
    @CurrentUser() caller: { role: string },
    @Body() dto: AssignScheduleDto,
  ) {
    return this.shiftsService.assignSchedule(caller, dto);
  }
}
