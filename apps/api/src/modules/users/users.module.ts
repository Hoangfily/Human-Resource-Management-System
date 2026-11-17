import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { UsersService } from './users.service';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [EmployeesController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
