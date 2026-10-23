import { Controller, Get, Module } from '@nestjs/common';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LeaveModule } from './modules/leave/leave.module';
import { RequestsModule } from './modules/requests/requests.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { PolicyModule } from './modules/policy/policy.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { AgentModule } from './modules/agent/agent.module';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'api' };
  }
}

@Module({ 
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    LeaveModule,
    RequestsModule,
    AttendanceModule,
    PolicyModule,
    ShiftsModule,
    AgentModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}