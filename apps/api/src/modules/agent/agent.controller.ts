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
   * Hỗ trợ cả /autonomy-config và alias /autonomy
   */
  @Get('autonomy-config')
  async getAutonomyConfigs() {
    return this.agentService.getAutonomyConfigs();
  }

  @Get('autonomy')
  async getAutonomyConfigsAlias() {
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
   * Cập nhật mức độ tự chủ qua alias PUT /autonomy (Hỗ trợ FE gửi requestType trong body)
   */
  @Put('autonomy')
  async updateAutonomyAlias(
    @CurrentUser() caller: { id: string; role: string },
    @Body() body: { requestType: RequestType; level: any; minConfidence?: number },
  ) {
    const reqType = body.requestType || RequestType.LEAVE;
    return this.agentService.updateAutonomyConfig(caller, reqType, {
      level: body.level,
      minConfidence: body.minConfidence,
    });
  }

  /**
   * Xem nhật ký suy luận và vết gọi công cụ của AI (Agent Trace)
   */
  @Get('traces')
  async getTraces(@Query('limit') limit?: string) {
    return this.agentService.getTraces(limit ? parseInt(limit, 10) : 50);
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
