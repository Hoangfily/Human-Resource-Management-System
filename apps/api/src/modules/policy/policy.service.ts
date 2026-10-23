import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query?: string, key?: string) {
    const where: any = { isActive: true };

    if (key) {
      where.key = { contains: key, mode: 'insensitive' };
    }

    if (query) {
      where.OR = [
        { key: { contains: query, mode: 'insensitive' } },
        { title: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
      ];
    }

    return this.prisma.companyPolicy.findMany({
      where,
      orderBy: { key: 'asc' },
    });
  }

  async findByKey(key: string) {
    const policy = await this.prisma.companyPolicy.findFirst({
      where: { key, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!policy) {
      throw new NotFoundException(`Không tìm thấy quy chế với mã: ${key}`);
    }

    return policy;
  }

  async update(key: string, data: { title?: string; content?: string }) {
    const existing = await this.prisma.companyPolicy.findFirst({
      where: { key, isActive: true },
    });

    if (!existing) {
      throw new NotFoundException(`Không tìm thấy quy chế với mã: ${key}`);
    }

    return this.prisma.companyPolicy.update({
      where: { id: existing.id },
      data: {
        title: data.title ?? existing.title,
        content: data.content ?? existing.content,
        lastUpdated: new Date(),
      },
    });
  }
}
