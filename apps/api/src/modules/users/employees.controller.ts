import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser('id') employeeId: string) {
    return this.usersService.getProfile(employeeId);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser('id') employeeId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(employeeId, dto);
  }

  @Get(':id')
  async getById(
    @CurrentUser() caller: { id: string; role: string },
    @Param('id') targetId: string,
  ) {
    return this.usersService.getEmployeeById(caller, targetId);
  }

  @Get()
  async listEmployees(
    @CurrentUser() caller: { id: string; role: string },
    @Query('departmentId') departmentId?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.listEmployees(caller, { departmentId, search });
  }
}
