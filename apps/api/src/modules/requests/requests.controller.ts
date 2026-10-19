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
}
