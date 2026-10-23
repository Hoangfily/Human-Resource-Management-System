import { IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { RequestStatus, RiskLevel } from '@prisma/client';

export class AiDecisionDto {
  @IsEnum(RequestStatus, { message: 'Quyết định phải là APPROVED hoặc REJECTED' })
  @IsNotEmpty({ message: 'Quyết định không được để trống' })
  decision: RequestStatus;

  @IsString({ message: 'Lý do phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Lý do quyết định không được để trống' })
  reason: string;

  @IsEnum(RiskLevel, { message: 'Mức rủi ro phải là LOW, MEDIUM hoặc HIGH' })
  @IsNotEmpty({ message: 'Mức rủi ro không được để trống' })
  riskLevel: RiskLevel;

  @IsNumber({}, { message: 'Độ tin cậy phải là số' })
  @Min(0, { message: 'Độ tin cậy tối thiểu là 0' })
  @Max(1, { message: 'Độ tin cậy tối đa là 1' })
  confidence: number;

  @IsArray({ message: 'Căn cứ quy chế policyRefs phải là một mảng' })
  @IsString({ each: true })
  policyRefs: string[];

  @IsOptional()
  @IsString()
  traceId?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
