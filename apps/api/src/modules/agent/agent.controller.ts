import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { AgentService } from './agent.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatDto } from './dto/chat.dto';
import { UpdateAutonomyDto } from './dto/update-autonomy.dto';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('chat')
  async chat(
    @CurrentUser() caller: { id: string; role: string },
    @Body() dto: ChatDto,
  ) {
    return this.agentService.chat(caller, dto);
  }

  @Get('traces')
  async getTraces() {
    return this.agentService.getTraces();
  }

  @Get('autonomy')
  async getAutonomyConfigs() {
    return this.agentService.getAutonomyConfigs();
  }

  @Put('autonomy')
  async updateAutonomyConfig(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateAutonomyDto,
  ) {
    return this.agentService.updateAutonomyConfig(dto, userId);
  }
}
