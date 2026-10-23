import {
  Body,
  Controller,
  Get,
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
  ) {
    return this.requestsService.create(caller, dto);
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
  ) {
    return this.requestsService.cancel(caller, id, reason);
  }

  @Post(':id/submit')
  async submit(
    @CurrentUser() caller: { id: string; role: string },
    @Param('id') id: string,
  ) {
    return this.requestsService.submit(caller, id);
  }

  // Ra quyết định phê duyệt hoặc từ chối (Manager / HR / Admin)
  @Post(':id/decision')
  async decision(
    @CurrentUser() caller: { id: string; role: string },
    @Param('id') id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.requestsService.decision(caller, id, dto);
  }

  // Chuyển cấp thẩm định lên HR
  @Post(':id/escalate')
  async escalate(
    @CurrentUser() caller: { id: string; role: string },
    @Param('id') id: string,
    @Body() dto: EscalateDto,
  ) {
    return this.requestsService.escalate(caller, id, dto);
  }

  // Trả lại đơn về DRAFT để nhân viên sửa đổi
  @Post(':id/return')
  async returnToDraft(
    @CurrentUser() caller: { id: string; role: string },
    @Param('id') id: string,
    @Body() dto: ReturnDto,
  ) {
    return this.requestsService.returnToDraft(caller, id, dto);
  }

  // Kiểm tra tính hợp lệ và tuân thủ chính sách trước khi duyệt
  @Post(':id/check')
  async checkRequest(
    @CurrentUser() caller: { id: string; role: string },
    @Param('id') id: string,
  ) {
    return this.requestsService.checkRequest(id, caller);
  }

  // AI Agent ra quyết định hoặc chuyển thẩm định (escalate)
  @Post(':id/ai-decision')
  async aiDecision(
    @CurrentUser() caller: { id: string; role: string },
    @Param('id') id: string,
    @Body() dto: AiDecisionDto,
  ) {
    return this.requestsService.aiDecision(id, dto, caller);
  }
}
