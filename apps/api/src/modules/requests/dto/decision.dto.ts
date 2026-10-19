import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RequestStatus, RiskLevel } from '@prisma/client';

export class DecisionDto {
  @IsEnum(RequestStatus, {
    message: 'Trạng thái phê duyệt phải là APPROVED hoặc REJECTED',
  })
  @IsNotEmpty({ message: 'Quyết định phê duyệt không được để trống' })
  status: RequestStatus;

  @IsOptional()
  @IsString({ message: 'Lý do phải là chuỗi ký tự' })
  reason?: string;
}

export class EscalateDto {
  @IsNotEmpty({ message: 'Lý do chuyển cấp thẩm định không được để trống' })
  @IsString({ message: 'Lý do phải là chuỗi ký tự' })
  reason: string;

  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;
}

export class ReturnDto {
  @IsNotEmpty({ message: 'Lý do trả lại đơn không được để trống' })
  @IsString({ message: 'Lý do phải là chuỗi ký tự' })
  reason: string;
}
