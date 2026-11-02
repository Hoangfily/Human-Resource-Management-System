import {
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { RequestStatus, RequestType } from '@prisma/client';

export class CreateRequestDto {
  @IsEnum(RequestType, {
    message: 'Loại yêu cầu phải là LEAVE, OVERTIME, ATTENDANCE_EXPLANATION hoặc SHIFT_CHANGE',
  })
  @IsNotEmpty({ message: 'Loại yêu cầu không được để trống' })
  type: RequestType;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsObject()
  @IsNotEmpty({ message: 'Payload chi tiết không được để trống' })
  payload: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  // Chỉ được tạo bản nháp hoặc gửi duyệt: các trạng thái khác chỉ đạt được qua luồng duyệt
  @IsOptional()
  @IsIn([RequestStatus.DRAFT, RequestStatus.PENDING], {
    message: 'Trạng thái khi tạo đơn chỉ có thể là DRAFT hoặc PENDING',
  })
  status?: RequestStatus;
}
