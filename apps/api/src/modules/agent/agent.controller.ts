import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequestType } from '@prisma/client';
import { AgentService } from './agent.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateAutonomyDto } from './dto/update-autonomy.dto';
import { ChatMessageDto } from './dto/chat-message.dto';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  /**
   * Xem cấu hình mức độ tự chủ của AI cho các loại đơn
   */
  @Get('autonomy-config')
  async getAutonomyConfigs() {
    return this.agentService.getAutonomyConfigs();
  }

  /**
   * Cập nhật mức độ tự chủ của AI (HR / Admin)
   */
  @Put('autonomy-config/:requestType')
  async updateAutonomyConfig(
    @CurrentUser() caller: { id: string; role: string },
    @Param('requestType') requestType: RequestType,
    @Body() dto: UpdateAutonomyDto,
  ) {
    return this.agentService.updateAutonomyConfig(caller, requestType, dto);
  }

  /**
   * Xem nhật ký suy luận và vết gọi công cụ của AI (Agent Trace)
   */
  @Get('traces')
  async getTraces(@Query('limit') limit?: string) {
    return this.agentService.getTraces(limit ? parseInt(limit, 10) : 20);
  }

  /**
   * Cổng hội thoại chat giữa Nhân viên và Trợ lý AI
   */
  @Post('chat')
  async chat(
    @CurrentUser() caller: { id: string; role: string },
    @Body() dto: ChatMessageDto,
  ) {
    return this.agentService.chatWithAgent(caller, dto);
  }
}
