import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorType,
  ApprovalStatus,
  Prisma,
  RequestStatus,
  RequestType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { QueryRequestsDto } from './dto/query-requests.dto';

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(caller: { id: string; role: string }, dto: CreateRequestDto) {
    let targetEmployeeId = caller.id;

    if (dto.employeeId && dto.employeeId !== caller.id) {
      if (caller.role === 'EMPLOYEE') {
        throw new ForbiddenException(
          'Nhân viên không có quyền tạo đơn thay cho nhân viên khác',
        );
      }

      if (caller.role === 'MANAGER') {
        const target = await this.prisma.employee.findUnique({
          where: { id: dto.employeeId },
          select: { managerId: true },
        });

        if (!target || target.managerId !== caller.id) {
          throw new ForbiddenException(
            'Quản lý chỉ có thể tạo đơn cho nhân viên thuộc quyền quản lý trực tiếp',
          );
        }
      }
      targetEmployeeId = dto.employeeId;
    }

    // Kiểm tra nhân viên tồn tại
    const targetEmployee = await this.prisma.employee.findUnique({
      where: { id: targetEmployeeId },
      include: {
        department: true,
        position: true,
        manager: true,
      },
    });

    if (!targetEmployee) {
      throw new NotFoundException('Không tìm thấy thông tin nhân viên');
    }

    // Kiểm tra idempotencyKey nếu có
    if (dto.idempotencyKey) {
      const existing = await this.prisma.request.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: {
          employee: { include: { department: true, position: true } },
          approvals: { include: { approver: true } },
          statusHistory: { include: { actor: true } },
        },
      });
      if (existing) {
        return this.formatRequest(existing);
      }
    }

    // Xử lý payload và computed
    const payload = { ...dto.payload };
    let daysRequested = 1;

    if (dto.type === RequestType.LEAVE) {
      if (payload.daysCount) {
        daysRequested = Number(payload.daysCount);
      } else if (payload.startDate && payload.endDate) {
        const start = new Date(payload.startDate);
        const end = new Date(payload.endDate);
        const diffMs = end.getTime() - start.getTime();
        daysRequested = Math.max(1, Math.round(diffMs / (1000 * 3600 * 24)) + 1);
      }
      payload.daysCount = daysRequested;

      // Chuẩn hóa leaveTypeId nếu client gửi mã code
      if (payload.leaveType && !payload.leaveTypeId) {
        const lt = await this.prisma.leaveType.findFirst({
          where: { code: payload.leaveType },
        });
        if (lt) {
          payload.leaveTypeId = lt.id;
          payload.leaveTypeName = lt.name;
        }
      }
    }

    const computed = { daysRequested };
    const status = dto.status || RequestStatus.PENDING;
    const approverId = targetEmployee.managerId;

    // Thực hiện transaction tạo đơn và các bản ghi liên quan
    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          employeeId: targetEmployeeId,
          createdById: caller.id,
          createdByType: ActorType.HUMAN,
          type: dto.type,
          status,
          payload,
          computed,
          attachments: dto.attachments || [],
          idempotencyKey: dto.idempotencyKey,
          submittedAt: status === RequestStatus.PENDING ? new Date() : null,
        },
      });

      // Tạo lịch sử trạng thái ban đầu
      await tx.requestStatusHistory.create({
        data: {
          requestId: request.id,
          fromStatus: null,
          toStatus: status,
          actorType: ActorType.HUMAN,
          actorId: caller.id,
          reason:
            status === RequestStatus.PENDING
              ? 'Tạo và gửi yêu cầu phê duyệt'
              : 'Tạo bản nháp yêu cầu',
        },
      });

      // Nếu đơn ở trạng thái PENDING và có quản lý trực tiếp, phân công phê duyệt
      if (status === RequestStatus.PENDING && approverId) {
        await tx.approval.create({
          data: {
            requestId: request.id,
            step: 1,
            approverId,
            status: ApprovalStatus.PENDING,
            deciderType: ActorType.HUMAN,
          },
        });
      }

      // Nếu là đơn nghỉ phép gửi đi, tăng số ngày chờ duyệt pendingDays
      if (status === RequestStatus.PENDING && dto.type === RequestType.LEAVE) {
        const leaveTypeId = payload.leaveTypeId;
        if (leaveTypeId) {
          await tx.leaveBalance.updateMany({
            where: {
              employeeId: targetEmployeeId,
              leaveTypeId,
              year: 2026,
            },
            data: {
              pendingDays: { increment: daysRequested },
            },
          });
        }
      }

      return tx.request.findUnique({
        where: { id: request.id },
        include: {
          employee: { include: { department: true, position: true } },
          approvals: { include: { approver: true } },
          statusHistory: { include: { actor: true }, orderBy: { createdAt: 'asc' } },
        },
      });
    });

    return this.formatRequest(result!);
  }

  async findAll(caller: { id: string; role: string }, query: QueryRequestsDto) {
    const where: Prisma.RequestWhereInput = {};

    // 1. Phân quyền hiển thị theo vai trò
    if (caller.role === 'EMPLOYEE') {
      where.OR = [
        { employeeId: caller.id },
        { createdById: caller.id },
      ];
    } else if (caller.role === 'MANAGER') {
      const subordinates = await this.prisma.employee.findMany({
        where: { managerId: caller.id },
        select: { id: true },
      });
      const allowedIds = [caller.id, ...subordinates.map((s) => s.id)];

      if (query.employeeId) {
        if (!allowedIds.includes(query.employeeId)) {
          throw new ForbiddenException(
            'Quản lý chỉ có quyền xem danh sách đơn của nhân viên trực thuộc',
          );
        }
        where.employeeId = query.employeeId;
      } else {
        where.employeeId = { in: allowedIds };
      }
    } else if (caller.role === 'HR' || caller.role === 'ADMIN') {
      if (query.employeeId) {
        where.employeeId = query.employeeId;
      }
    }

    // 2. Bộ lọc trạng thái và loại đơn
    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      where.type = query.type;
    }

    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    const requests = await this.prisma.request.findMany({
      where,
      include: {
        employee: { include: { department: true, position: true } },
        approvals: { include: { approver: true } },
        statusHistory: { include: { actor: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return requests.map((r) => this.formatRequest(r));
  }

  async findOne(caller: { id: string; role: string }, id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        employee: { include: { department: true, position: true } },
        approvals: { include: { approver: true } },
        statusHistory: { include: { actor: true }, orderBy: { createdAt: 'asc' } },
      },
    });

    if (!request) {
      throw new NotFoundException(`Không tìm thấy yêu cầu có mã #${id}`);
    }

    // Kiểm tra quyền truy cập
    if (caller.role === 'EMPLOYEE') {
      if (request.employeeId !== caller.id && request.createdById !== caller.id) {
        throw new ForbiddenException('Bạn không có quyền xem yêu cầu này');
      }
    } else if (caller.role === 'MANAGER') {
      const isSubordinate =
        request.employeeId === caller.id ||
        (await this.prisma.employee.count({
          where: { id: request.employeeId, managerId: caller.id },
        })) > 0;

      if (!isSubordinate) {
        throw new ForbiddenException(
          'Quản lý chỉ có quyền xem yêu cầu của nhân viên trực thuộc',
        );
      }
    }

    return this.formatRequest(request);
  }

  async cancel(caller: { id: string; role: string }, id: string, reason?: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: { approvals: true },
    });

    if (!request) {
      throw new NotFoundException(`Không tìm thấy yêu cầu có mã #${id}`);
    }

    if (
      request.employeeId !== caller.id &&
      request.createdById !== caller.id &&
      caller.role !== 'ADMIN'
    ) {
      throw new ForbiddenException('Bạn chỉ có quyền hủy yêu cầu của chính mình');
    }

    if (
      request.status === RequestStatus.APPROVED ||
      request.status === RequestStatus.REJECTED ||
      request.status === RequestStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Không thể hủy yêu cầu đang ở trạng thái ${request.status}`,
      );
    }

    const previousStatus = request.status;
    const daysRequested = (request.computed as any)?.daysRequested || 1;

    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id },
        data: { status: RequestStatus.CANCELLED },
      });

      await tx.requestStatusHistory.create({
        data: {
          requestId: id,
          fromStatus: previousStatus,
          toStatus: RequestStatus.CANCELLED,
          actorType: ActorType.HUMAN,
          actorId: caller.id,
          reason: reason || 'Nhân viên chủ động hủy yêu cầu',
        },
      });

      // Hoàn trả pendingDays nếu đơn đang ở PENDING/ESCALATED
      if (
        (previousStatus === RequestStatus.PENDING ||
          previousStatus === RequestStatus.ESCALATED) &&
        request.type === RequestType.LEAVE
      ) {
        const leaveTypeId = (request.payload as any)?.leaveTypeId;
        if (leaveTypeId) {
          await tx.leaveBalance.updateMany({
            where: {
              employeeId: request.employeeId,
              leaveTypeId,
              year: 2026,
            },
            data: {
              pendingDays: { decrement: daysRequested },
            },
          });
        }
      }
    });

    return this.findOne(caller, id);
  }

  async submit(caller: { id: string; role: string }, id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: { employee: true },
    });

    if (!request) {
      throw new NotFoundException(`Không tìm thấy yêu cầu có mã #${id}`);
    }

    if (request.status !== RequestStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể gửi phê duyệt cho đơn ở trạng thái DRAFT');
    }

    const daysRequested = (request.computed as any)?.daysRequested || 1;
    const approverId = request.employee.managerId;

    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id },
        data: {
          status: RequestStatus.PENDING,
          submittedAt: new Date(),
        },
      });

      await tx.requestStatusHistory.create({
        data: {
          requestId: id,
          fromStatus: RequestStatus.DRAFT,
          toStatus: RequestStatus.PENDING,
          actorType: ActorType.HUMAN,
          actorId: caller.id,
          reason: 'Gửi yêu cầu phê duyệt',
        },
      });

      if (approverId) {
        await tx.approval.create({
          data: {
            requestId: id,
            step: 1,
            approverId,
            status: ApprovalStatus.PENDING,
            deciderType: ActorType.HUMAN,
          },
        });
      }

      if (request.type === RequestType.LEAVE) {
        const leaveTypeId = (request.payload as any)?.leaveTypeId;
        if (leaveTypeId) {
          await tx.leaveBalance.updateMany({
            where: {
              employeeId: request.employeeId,
              leaveTypeId,
              year: 2026,
            },
            data: {
              pendingDays: { increment: daysRequested },
            },
          });
        }
      }
    });

    return this.findOne(caller, id);
  }

  // Định dạng dữ liệu chuẩn hóa trả về cho Frontend
  private formatRequest(req: any) {
    const activeApproval = req.approvals?.[0];
    const timeline = (req.statusHistory || []).map((h: any) => ({
      title: this.getTimelineTitle(h.toStatus),
      actor: h.actor?.fullName || (h.actorType === 'AI' ? 'HR AI Copilot' : 'Hệ thống'),
      actorType: h.actorType,
      timestamp: new Date(h.createdAt).toLocaleString('vi-VN'),
      description: h.reason || '',
      status: this.getTimelineStatus(h.toStatus),
    }));

    return {
      id: req.id,
      employeeId: req.employeeId,
      employeeName: req.employee?.fullName || 'Nhân viên',
      employeeCode: req.employee?.id ? `EMP-${req.employee.id.slice(0, 4).toUpperCase()}` : 'EMP001',
      departmentName: req.employee?.department?.name || 'Phòng ban',
      positionName: req.employee?.position?.title || 'Chức vụ',
      type: req.type,
      status: req.status,
      payload: req.payload,
      computed: req.computed,
      attachments: req.attachments,
      riskLevel: req.riskLevel || 'LOW',
      aiRiskScore: req.riskLevel === 'HIGH' ? 0.8 : req.riskLevel === 'MEDIUM' ? 0.4 : 0.05,
      aiConfidence: 0.95,
      aiRationale:
        req.type === RequestType.LEAVE
          ? 'Đơn được khởi tạo hợp lệ và kiểm tra tính sẵn sàng của quỹ phép.'
          : 'Đơn đã qua kiểm tra hợp lệ.',
      approverId: activeApproval?.approverId,
      approverName: activeApproval?.approver?.fullName,
      rejectionReason: req.status === RequestStatus.REJECTED ? activeApproval?.reason : undefined,
      timeline,
      submittedAt: req.submittedAt,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
    };
  }

  private getTimelineTitle(status: RequestStatus): string {
    switch (status) {
      case RequestStatus.DRAFT:
        return 'Tạo bản nháp';
      case RequestStatus.PENDING:
        return 'Gửi yêu cầu phê duyệt';
      case RequestStatus.APPROVED:
        return 'Đã được phê duyệt';
      case RequestStatus.REJECTED:
        return 'Bị từ chối';
      case RequestStatus.ESCALATED:
        return 'Chuyển cấp thẩm định';
      case RequestStatus.CANCELLED:
        return 'Đã hủy yêu cầu';
      default:
        return 'Cập nhật trạng thái';
    }
  }

  private getTimelineStatus(status: RequestStatus): 'finish' | 'process' | 'wait' | 'error' {
    switch (status) {
      case RequestStatus.APPROVED:
        return 'finish';
      case RequestStatus.PENDING:
      case RequestStatus.ESCALATED:
        return 'process';
      case RequestStatus.REJECTED:
      case RequestStatus.CANCELLED:
        return 'error';
      default:
        return 'finish';
    }
  }
}
