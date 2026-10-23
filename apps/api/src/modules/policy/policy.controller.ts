import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('policies')
@UseGuards(JwtAuthGuard)
export class PolicyController {
  constructor(private readonly policyService: PolicyService) {}

  @Get()
  async getPolicies(
    @Query('query') query?: string,
    @Query('key') key?: string,
  ) {
    return this.policyService.findAll(query, key);
  }

  @Get(':key')
  async getPolicyByKey(@Param('key') key: string) {
    return this.policyService.findByKey(key);
  }

  @Put(':key')
  async updatePolicy(
    @Param('key') key: string,
    @Body() body: { title?: string; content?: string },
  ) {
    return this.policyService.update(key, body);
  }
}
