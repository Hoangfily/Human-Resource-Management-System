import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    caller: { id: string; role: string },
    query?: {
      action?: string;
      entityType?: string;
      entityId?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    if (caller.role !== 'ADMIN' && caller.role !== 'HR') {
      throw new ForbiddenException('Chỉ Quản trị viên (ADMIN) và Nhân sự (HR) mới có quyền xem Nhật ký kiểm toán');
    }

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query?.action) {
      where.action = query.action;
    }

    if (query?.entityType) {
      where.entityType = query.entityType;
    }

    if (query?.entityId) {
      where.entityId = query.entityId;
    }

    if (query?.search) {
      where.OR = [
        { action: { contains: query.search, mode: 'insensitive' } },
        { entityType: { contains: query.search, mode: 'insensitive' } },
        { entityId: { contains: query.search, mode: 'insensitive' } },
        {
          actor: {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
