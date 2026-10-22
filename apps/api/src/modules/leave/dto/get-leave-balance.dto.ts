import { IsOptional, IsString } from 'class-validator';

export class GetLeaveBalanceQueryDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  year?: string;
}
