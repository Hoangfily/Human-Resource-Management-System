import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class AssignScheduleDto {
  @IsString()
  @IsNotEmpty({ message: 'employeeId không được để trống' })
  employeeId: string;

  @IsDateString({}, { message: 'date phải có định dạng ngày hợp lệ (YYYY-MM-DD)' })
  date: string;

  @IsDateString({}, { message: 'shiftStart phải là thời gian hợp lệ' })
  shiftStart: string;

  @IsDateString({}, { message: 'shiftEnd phải là thời gian hợp lệ' })
  shiftEnd: string;
}
