import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UpsertPolicyDto } from './dto/upsert-policy.dto';

@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 1. Lấy danh sách toàn bộ chính sách công ty (Hỗ trợ tìm kiếm từ khóa cho người dùng và AI RAG)
   */
  async getAllPolicies(search?: string, activeOnly = true) {
    const where: Prisma.CompanyPolicyWhereInput = {};

    if (activeOnly) {
      where.isActive = true;
    }

    if (search && search.trim()) {
      const keyword = search.trim();
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { content: { contains: keyword, mode: 'insensitive' } },
        { key: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    return this.prisma.companyPolicy.findMany({
      where,
      orderBy: { key: 'asc' },
    });
  }

  /**
   * 2. Lấy chi tiết một quy chế cụ thể theo mã Key (Ví dụ: LEAVE.NOTICE_DAYS)
   */
  async getPolicyByKey(key: string) {
    const policy = await this.prisma.companyPolicy.findFirst({
      where: { key, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!policy) {
      throw new NotFoundException(`Không tìm thấy chính sách với mã: ${key}`);
    }

    return policy;
  }

  /**
   * 3. Thêm mới hoặc cập nhật chính sách công ty (Dành cho Quản trị HR / Admin)
   */
  async upsertPolicy(caller: { role: string }, dto: UpsertPolicyDto) {
    if (caller.role !== 'HR' && caller.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Chỉ có bộ phận HR hoặc Quản trị viên mới có quyền cập nhật chính sách công ty.',
      );
    }

    const version = dto.version || '2026.10-active';

    return this.prisma.companyPolicy.upsert({
      where: {
        key_version: {
          key: dto.key,
          version,
        },
      },
      update: {
        title: dto.title,
        content: dto.content,
        isActive: dto.isActive ?? true,
        lastUpdated: new Date(),
      },
      create: {
        key: dto.key,
        version,
        title: dto.title,
        content: dto.content,
        isActive: dto.isActive ?? true,
        lastUpdated: new Date(),
      },
    });
  }
}
