import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.position.findMany({
      orderBy: { title: 'asc' },
    });
  }
}
