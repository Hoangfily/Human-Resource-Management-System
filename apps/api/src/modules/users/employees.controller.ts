import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  async getMe(@CurrentUser('id') employeeId: string) {
    return this.authService.getProfile(employeeId);
  }
}
