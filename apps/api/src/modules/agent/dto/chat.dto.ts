import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ChatDto {
  @IsString({ message: 'Nội dung tin nhắn phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Nội dung tin nhắn không được để trống' })
  message: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}
