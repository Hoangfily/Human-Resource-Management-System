import { Controller, Get, UseGuards } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('shifts')
@UseGuards(JwtAuthGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get('my-schedule')
  async getMySchedule(@CurrentUser('id') employeeId: string) {
    return this.shiftsService.getMySchedule(employeeId);
  }

  @Get('templates')
  async getShiftTemplates() {
    return this.shiftsService.getShiftTemplates();
  }

  @Get('colleagues')
  async getColleagues(@CurrentUser('id') employeeId: string) {
    return this.shiftsService.getColleagues(employeeId);
  }
}
