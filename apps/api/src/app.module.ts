import { Controller, Get, Module } from '@nestjs/common';
import { PrismaModule } from './database/prisma.module';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'api' };
  }
}

@Module({ 
  imports: [PrismaModule],
  controllers: [HealthController] 
})
export class AppModule {}