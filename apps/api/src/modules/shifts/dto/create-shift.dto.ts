import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateShiftTemplateDto {
  @IsString()
  @IsNotEmpty({ message: 'Tên ca làm việc không được để trống' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Giờ bắt đầu không được để trống' })
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Giờ bắt đầu phải có định dạng HH:mm (Ví dụ: 08:30)',
  })
  startTime: string;

  @IsString()
  @IsNotEmpty({ message: 'Giờ kết thúc không được để trống' })
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Giờ kết thúc phải có định dạng HH:mm (Ví dụ: 17:30)',
  })
  endTime: string;
}
