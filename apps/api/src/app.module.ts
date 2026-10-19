import { Controller, Get, Module } from '@nestjs/common';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LeaveModule } from './modules/leave/leave.module';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'api' };
  }
}

@Module({ 
  imports: [PrismaModule, AuthModule, UsersModule, LeaveModule],
  controllers: [HealthController],
})
export class AppModule {}