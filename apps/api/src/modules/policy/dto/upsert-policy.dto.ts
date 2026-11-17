import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpsertPolicyDto {
  @IsString()
  @IsNotEmpty({ message: 'Key chính sách không được để trống' })
  key: string;

  @IsString()
  @IsNotEmpty({ message: 'Tiêu đề chính sách không được để trống' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'Nội dung chính sách không được để trống' })
  content: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
