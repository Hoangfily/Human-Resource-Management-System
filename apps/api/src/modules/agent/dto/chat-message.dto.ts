import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ChatMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'Nội dung tin nhắn không được để trống' })
  message: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}
