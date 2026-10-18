import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [EmployeesController],
})
export class UsersModule {}
