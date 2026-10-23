import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { AutonomyLevel } from '@prisma/client';

export class UpdateAutonomyDto {
  @IsEnum(AutonomyLevel, {
    message: 'level phải là SUGGEST_ONLY, AUTO_APPROVE_LOW_RISK, hoặc AUTO_DECIDE_LOW_RISK',
  })
  level: AutonomyLevel;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidence?: number;
}
