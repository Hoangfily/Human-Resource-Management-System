import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SkipThrottle, ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard, GLOBAL_LIMIT, THROTTLE_WINDOW_MS } from './common/guards/app-throttler.guard';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LeaveModule } from './modules/leave/leave.module';
import { RequestsModule } from './modules/requests/requests.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { PolicyModule } from './modules/policy/policy.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { AgentModule } from './modules/agent/agent.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { PositionsModule } from './modules/positions/positions.module';
import { AuditModule } from './modules/audit/audit.module';

@SkipThrottle() // Healthcheck của Docker gọi đều đặn
@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'api' };
  }
}

@Module({ 
  imports: [
    // Bộ đếm nằm trong bộ nhớ của tiến trình: đúng với 1 bản API (chạy nhiều bản thì cần Redis)
    ThrottlerModule.forRoot([{ name: 'default', ttl: THROTTLE_WINDOW_MS, limit: GLOBAL_LIMIT }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    LeaveModule,
    RequestsModule,
    AttendanceModule,
    PolicyModule,
    ShiftsModule,
    AgentModule,
    DepartmentsModule,
    PositionsModule,
    AuditModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
