import { Module } from '@nestjs/common';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [LeaveController],
  providers: [LeaveService],
  exports: [LeaveService],
})
export class LeaveModule {}
