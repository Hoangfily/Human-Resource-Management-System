import { IsEnum, IsNotEmpty, IsNumber, Max, Min } from 'class-validator';
import { AutonomyLevel, RequestType } from '@prisma/client';

export class UpdateAutonomyDto {
  @IsEnum(RequestType, { message: 'Loại yêu cầu không hợp lệ' })
  @IsNotEmpty({ message: 'Loại yêu cầu không được để trống' })
  requestType: RequestType;

  @IsEnum(AutonomyLevel, { message: 'Mức tự chủ không hợp lệ' })
  @IsNotEmpty({ message: 'Mức tự chủ không được để trống' })
  level: AutonomyLevel;

  @IsNumber({}, { message: 'Độ tin cậy tối thiểu phải là số' })
  @Min(0, { message: 'Độ tin cậy tối thiểu là 0' })
  @Max(1, { message: 'Độ tin cậy tối đa là 1' })
  minConfidence: number;
}
