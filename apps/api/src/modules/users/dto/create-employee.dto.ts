import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateEmployeeDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;

  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  fullName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN'], {
    message: 'Vai trò phải là EMPLOYEE, MANAGER, HR hoặc ADMIN',
  })
  role?: 'EMPLOYEE' | 'MANAGER' | 'HR' | 'ADMIN';

  @IsOptional()
  @IsEnum(['ACTIVE', 'ON_PROBATION', 'RESIGNED'], {
    message: 'Trạng thái nhân sự không hợp lệ',
  })
  status?: 'ACTIVE' | 'ON_PROBATION' | 'RESIGNED';

  @IsOptional()
  @IsUUID('all', { message: 'Mã phòng ban không hợp lệ' })
  departmentId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Mã chức danh không hợp lệ' })
  positionId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Mã người quản lý không hợp lệ' })
  managerId?: string;

  @IsOptional()
  @IsUUID('all', { message: 'Mã ca làm việc mặc định không hợp lệ' })
  defaultShiftId?: string;

  @IsOptional()
  @IsString()
  joinDate?: string;
}
