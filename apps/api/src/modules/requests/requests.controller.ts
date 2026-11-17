import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequestsService } from './requests.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateRequestDto } from './dto/create-request.dto';
import { QueryRequestsDto } from './dto/query-requests.dto';
import { DecisionDto, EscalateDto, ReturnDto } from './dto/decision.dto';
import { AiDecisionDto } from './dto/ai-decision.dto';

@Controller('requests')
@UseGuards(JwtAuthGuard)
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  async create(
    @CurrentUser() caller: { id: string; role: string },
    @Body() dto: CreateRequestDto,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.requestsService.create(caller, dto, correlationId);
  }

  @Get()
  async findAll(
    @CurrentUser() caller: { id: string; role: string },
    @Query() query: QueryRequestsDto,
  ) {
    return this.requestsService.findAll(caller, query);
  }

  // Hàng đợi phê duyệt dành cho Quản lý & HR (đặt trước :id để tránh xung đột routing)
  @Get('approvals/queue')
  async getApprovalsQueue(
    @CurrentUser() caller: { id: string; role: string },
    @Query('tab') tab?: 'pending' | 'history',
  ) {
    return this.requestsService.getApprovalsQueue(caller, tab);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() caller: { id: string; role: string },
    @Param('id') id: string,
  ) {
    return this.requestsService.findOne(caller, id);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentUser() caller: { id: string; role: string },
    @Param('id') id: string,
    @Body('reason') reason?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.requestsService.cancel(caller, id, reason, correlationId);
  }

  @Post(':id/submit')
  async submit(
    @CurrentUser() caller: { id: string; role: string },
    @Param('id') id: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.requestsService.submit(caller, id, correlationId);
  }

  // Cổng dành riêng cho AI Service tự động phê duyệt hoặc từ chối (doc 06 item 2)
  @Post(':id/ai-decision')
  async aiDecision(
    @CurrentUser() caller: { id: string; role: string },
    @Param('id') id: string,
    @Body() dto: AiDecisionDto,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.requestsService.aiDecision(caller, id, dto, correlationId);
  }

  // Ra quyết định phê duyệt hoặc từ chối bởi Con người (Manager / HR / Admin)
  @Post(':id/decision')
  async decision(
    @CurrentUser() caller: { id: string; role: string },
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.requestsService.decision(caller, id, dto, correlationId);
  }

  // Chuyển cấp thẩm định lên HR (do Quản lý hoặc AI chuyển)
  @Post(':id/escalate')
  async escalate(
    @CurrentUser() caller: { id: string; role: string },
    @Param('id') id: string,
    @Body() dto: EscalateDto,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.requestsService.escalate(caller, id, dto, correlationId);
  }

  // Trả lại đơn về DRAFT để nhân viên sửa đổi
  @Post(':id/return')
  async returnToDraft(
    @CurrentUser() caller: { id: string; role: string },
    @Param('id') id: string,
    @Body() dto: ReturnDto,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.requestsService.returnToDraft(caller, id, dto, correlationId);
  }
}
