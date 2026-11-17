import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GetLeaveBalanceQueryDto } from './dto/get-leave-balance.dto';

@Controller('leave')
@UseGuards(JwtAuthGuard)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('balance')
  async getBalance(
    @CurrentUser() caller: { id: string; role: string },
    @Query() query: GetLeaveBalanceQueryDto,
  ) {
    return this.leaveService.getBalance(
      caller,
      query.employeeId,
      query.year ? parseInt(query.year, 10) : undefined,
    );
  }

  @Get('types')
  async getTypes() {
    return this.leaveService.getLeaveTypes();
  }

  @Post('balance/adjust')
  async adjustBalance(
    @CurrentUser() caller: { id: string; role: string },
    @Body()
    body: {
      employeeId: string;
      leaveTypeId: string;
      year?: number;
      totalDays?: number;
      usedDays?: number;
      pendingDays?: number;
    },
  ) {
    return this.leaveService.adjustBalance(caller, body);
  }
}
