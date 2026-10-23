import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PolicyService } from './policy.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpsertPolicyDto } from './dto/upsert-policy.dto';

@Controller('policy')
@UseGuards(JwtAuthGuard)
export class PolicyController {
  constructor(private readonly policyService: PolicyService) {}

  /**
   * Tra cứu danh sách chính sách công ty (Dành cho nhân viên, quản lý và AI RAG)
   */
  @Get()
  async getAllPolicies(
    @Query('search') search?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const isActiveOnly = activeOnly !== 'false';
    return this.policyService.getAllPolicies(search, isActiveOnly);
  }

  /**
   * Lấy chi tiết một điều khoản chính sách theo Key
   */
  @Get(':key')
  async getByKey(@Param('key') key: string) {
    return this.policyService.getPolicyByKey(key);
  }

  /**
   * Tạo mới hoặc cập nhật chính sách công ty (HR / Admin)
   */
  @Post()
  async upsertPolicy(
    @CurrentUser() caller: { role: string },
    @Body() dto: UpsertPolicyDto,
  ) {
    return this.policyService.upsertPolicy(caller, dto);
  }
}
