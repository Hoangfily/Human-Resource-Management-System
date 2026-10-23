import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorType,
  ApprovalStatus,
  AutonomyLevel,
  Prisma,
  RequestStatus,
  RequestType,
  RiskLevel,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { QueryRequestsDto } from './dto/query-requests.dto';
import { DecisionDto, EscalateDto, ReturnDto } from './dto/decision.dto';
import { AiDecisionDto } from './dto/ai-decision.dto';

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

  // Phê duyệt hoặc từ chối yêu cầu (Manager / HR / Admin)
  async decision(
    caller: { id: string; role: string },
    id: string,
    dto: DecisionDto,
  ) {
    if (caller.role === 'EMPLOYEE') {
      throw new ForbiddenException('Nhân viên không có quyền phê duyệt đơn');
    }

    if (
      dto.status !== RequestStatus.APPROVED &&
      dto.status !== RequestStatus.REJECTED
    ) {
      throw new BadRequestException(
        'Quyết định phê duyệt chỉ có thể là APPROVED hoặc REJECTED',
      );
    }

    if (dto.status === RequestStatus.REJECTED && !dto.reason?.trim()) {
      throw new BadRequestException('Vui lòng nhập lý do từ chối yêu cầu');
    }

    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        employee: { include: { department: true, position: true } },
        approvals: true,
      },
    });

    if (!request) {
      throw new NotFoundException(`Không tìm thấy yêu cầu có mã #${id}`);
    }

    // Quy tắc cấm tự phê duyệt theo Điều 8 Business Spec
    if (request.employeeId === caller.id || request.createdById === caller.id) {
      throw new ForbiddenException(
        'Không được phép tự phê duyệt đơn của chính mình',
      );
    }

    // Kiểm tra phạm vi phân quyền của Manager
    if (caller.role === 'MANAGER') {
      const isSubordinate =
        request.employee.managerId === caller.id ||
        request.approvals.some((a) => a.approverId === caller.id);

      if (!isSubordinate) {
        throw new ForbiddenException(
          'Quản lý chỉ có quyền phê duyệt đơn của nhân viên trực thuộc hoặc đơn được phân công',
        );
      }
    }

    // Chỉ có thể duyệt đơn ở PENDING hoặc ESCALATED
    if (
      request.status !== RequestStatus.PENDING &&
      request.status !== RequestStatus.ESCALATED
    ) {
      throw new BadRequestException(
        `Không thể phê duyệt đơn đang ở trạng thái ${request.status}`,
      );
    }

    const daysRequested = (request.computed as any)?.daysRequested || 1;
    const leaveTypeId = (request.payload as any)?.leaveTypeId;
    const previousStatus = request.status;

    await this.prisma.$transaction(async (tx) => {
      // 1. Cập nhật Request status
      await tx.request.update({
        where: { id },
        data: {
          status: dto.status,
        },
      });

      // 2. Cập nhật hoặc tạo bản ghi Approval
      const pendingApproval = request.approvals.find(
        (a) => a.status === ApprovalStatus.PENDING,
      );

      const decisionReason =
        dto.reason?.trim() ||
        (dto.status === RequestStatus.APPROVED
          ? 'Phê duyệt chấp thuận yêu cầu'
          : 'Từ chối yêu cầu');

      if (pendingApproval) {
        await tx.approval.update({
          where: { id: pendingApproval.id },
          data: {
            status:
              dto.status === RequestStatus.APPROVED
                ? ApprovalStatus.APPROVED
                : ApprovalStatus.REJECTED,
            approverId: caller.id,
            deciderType: ActorType.HUMAN,
            decidedAt: new Date(),
            reason: decisionReason,
          },
        });
      } else {
        await tx.approval.create({
          data: {
            requestId: id,
            step: 1,
            approverId: caller.id,
            deciderType: ActorType.HUMAN,
            status:
              dto.status === RequestStatus.APPROVED
                ? ApprovalStatus.APPROVED
                : ApprovalStatus.REJECTED,
            decidedAt: new Date(),
            reason: decisionReason,
          },
        });
      }

      // 3. Ghi lịch sử thay đổi trạng thái
      await tx.requestStatusHistory.create({
        data: {
          requestId: id,
          fromStatus: previousStatus,
          toStatus: dto.status,
          actorType: ActorType.HUMAN,
          actorId: caller.id,
          reason: decisionReason,
        },
      });

      // 4. Cập nhật LeaveBalance đối với đơn nghỉ phép
      if (request.type === RequestType.LEAVE && leaveTypeId) {
        if (dto.status === RequestStatus.APPROVED) {
          // Trừ pendingDays, tăng usedDays
          await tx.leaveBalance.updateMany({
            where: {
              employeeId: request.employeeId,
              leaveTypeId,
              year: 2026,
            },
            data: {
              pendingDays: { decrement: daysRequested },
              usedDays: { increment: daysRequested },
            },
          });
        } else if (dto.status === RequestStatus.REJECTED) {
          // Hoàn lại pendingDays
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

      // 5. Ghi nhật ký kiểm toán AuditLog
      await tx.auditLog.create({
        data: {
          actorType: ActorType.HUMAN,
          actorId: caller.id,
          action:
            dto.status === RequestStatus.APPROVED
              ? 'REQUEST_APPROVED'
              : 'REQUEST_REJECTED',
          entityType: 'Request',
          entityId: id,
          payload: {
            before: { status: previousStatus },
            after: { status: dto.status, reason: decisionReason },
          },
        },
      });
    });

    return this.findOne(caller, id);
  }

  // Chuyển cấp thẩm định lên HR (Manager / HR / Admin)
  async escalate(
    caller: { id: string; role: string },
    id: string,
    dto: EscalateDto,
  ) {
    if (caller.role === 'EMPLOYEE') {
      throw new ForbiddenException('Nhân viên không có quyền chuyển cấp thẩm định');
    }

    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        employee: true,
        approvals: true,
      },
    });

    if (!request) {
      throw new NotFoundException(`Không tìm thấy yêu cầu có mã #${id}`);
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể chuyển cấp thẩm định cho đơn ở trạng thái PENDING');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id },
        data: {
          status: RequestStatus.ESCALATED,
          riskLevel: dto.riskLevel || RiskLevel.HIGH,
          escalationReason: dto.reason,
        },
      });

      const pendingApproval = request.approvals.find(
        (a) => a.status === ApprovalStatus.PENDING,
      );
      if (pendingApproval) {
        await tx.approval.update({
          where: { id: pendingApproval.id },
          data: {
            reason: `Chuyển cấp: ${dto.reason}`,
          },
        });
      }

      await tx.requestStatusHistory.create({
        data: {
          requestId: id,
          fromStatus: RequestStatus.PENDING,
          toStatus: RequestStatus.ESCALATED,
          actorType: ActorType.HUMAN,
          actorId: caller.id,
          reason: dto.reason,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: ActorType.HUMAN,
          actorId: caller.id,
          action: 'REQUEST_ESCALATED',
          entityType: 'Request',
          entityId: id,
          payload: { reason: dto.reason, riskLevel: dto.riskLevel },
        },
      });
    });

    return this.findOne(caller, id);
  }

  // Trả lại đơn về DRAFT để nhân viên sửa đổi / bổ sung thông tin
  async returnToDraft(
    caller: { id: string; role: string },
    id: string,
    dto: ReturnDto,
  ) {
    if (caller.role === 'EMPLOYEE') {
      throw new ForbiddenException('Nhân viên không có quyền trả lại đơn');
    }

    const request = await this.prisma.request.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException(`Không tìm thấy yêu cầu có mã #${id}`);
    }

    if (request.status !== RequestStatus.ESCALATED) {
      throw new BadRequestException('Chỉ có thể trả lại đơn đang ở trạng thái ESCALATED');
    }

    const daysRequested = (request.computed as any)?.daysRequested || 1;
    const leaveTypeId = (request.payload as any)?.leaveTypeId;

    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id },
        data: {
          status: RequestStatus.DRAFT,
        },
      });

      await tx.requestStatusHistory.create({
        data: {
          requestId: id,
          fromStatus: RequestStatus.ESCALATED,
          toStatus: RequestStatus.DRAFT,
          actorType: ActorType.HUMAN,
          actorId: caller.id,
          reason: dto.reason,
        },
      });

      // Hoàn lại pendingDays
      if (request.type === RequestType.LEAVE && leaveTypeId) {
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
    });

    return this.findOne(caller, id);
  }

  // Hàng đợi phê duyệt dành cho Quản lý & HR
  async getApprovalsQueue(
    caller: { id: string; role: string },
    tab?: 'pending' | 'history',
  ) {
    if (caller.role === 'EMPLOYEE') {
      throw new ForbiddenException('Nhân viên không có quyền truy cập hàng đợi phê duyệt');
    }

    const where: Prisma.RequestWhereInput = {
      // Cấm hiển thị đơn do chính mình tạo trong hàng đợi duyệt (cấm tự duyệt)
      employeeId: { not: caller.id },
      createdById: { not: caller.id },
    };

    if (caller.role === 'MANAGER') {
      const subordinates = await this.prisma.employee.findMany({
        where: { managerId: caller.id },
        select: { id: true },
      });
      const subordinateIds = subordinates.map((s) => s.id);

      where.OR = [
        { employeeId: { in: subordinateIds } },
        { approvals: { some: { approverId: caller.id } } },
      ];
    }

    if (tab === 'history') {
      where.status = {
        in: [RequestStatus.APPROVED, RequestStatus.REJECTED],
      };
    } else {
      where.status = {
        in: [RequestStatus.PENDING, RequestStatus.ESCALATED],
      };
    }

    const requests = await this.prisma.request.findMany({
      where,
      include: {
        employee: { include: { department: true, position: true } },
        approvals: { include: { approver: true } },
        statusHistory: { include: { actor: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return requests.map((r) => this.formatRequest(r));
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

  async checkRequest(id: string, caller: { id: string; role: string }) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        employee: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Không tìm thấy yêu cầu');
    }

    if (caller.role === 'EMPLOYEE' && request.employeeId !== caller.id && request.createdById !== caller.id) {
      throw new ForbiddenException('Bạn không có quyền kiểm tra đơn này');
    }

    const payload = (request.payload as Record<string, any>) || {};
    const missingFields: string[] = [];
    const violations: Array<{ rule: string; outcome: 'INVALID' | 'REJECT' | 'ESCALATE'; message: string }> = [];

    if (request.type === RequestType.LEAVE) {
      if (!payload.leaveTypeId && !payload.leaveType) missingFields.push('leaveTypeId');
      if (!payload.startDate) missingFields.push('startDate');
      if (!payload.endDate) missingFields.push('endDate');
      if (!payload.reason) missingFields.push('reason');
    } else if (request.type === RequestType.OVERTIME) {
      if (!payload.date) missingFields.push('date');
      if (!payload.startTime) missingFields.push('startTime');
      if (!payload.endTime) missingFields.push('endTime');
      if (!payload.reason) missingFields.push('reason');
    } else if (request.type === RequestType.ATTENDANCE_EXPLANATION) {
      if (!payload.date) missingFields.push('date');
      if (!payload.issue) missingFields.push('issue');
      if (!payload.explanation && !payload.reason) missingFields.push('explanation');
    } else if (request.type === RequestType.SHIFT_CHANGE) {
      if (!payload.scheduleId) missingFields.push('scheduleId');
      if (!payload.newDate) missingFields.push('newDate');
      if (!payload.newShiftTemplateId) missingFields.push('newShiftTemplateId');
      if (!payload.reason) missingFields.push('reason');
    }

    if (request.type === RequestType.LEAVE) {
      const daysRequested = Number(payload.daysCount || (request.computed as any)?.daysRequested || 1);

      if (payload.startDate) {
        const start = new Date(payload.startDate);
        const now = new Date();
        const diffMs = start.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 3600 * 24));

        if (daysRequested <= 2 && diffDays < 3) {
          violations.push({
            rule: 'LEAVE.NOTICE_DAYS',
            outcome: 'ESCALATE',
            message: `Báo trước ${diffDays} ngày, quy chế yêu cầu tối thiểu 3 ngày làm việc đối với đơn nghỉ 1-2 ngày.`,
          });
        } else if (daysRequested > 2 && diffDays < 7) {
          violations.push({
            rule: 'LEAVE.NOTICE_DAYS',
            outcome: 'ESCALATE',
            message: `Báo trước ${diffDays} ngày, quy chế yêu cầu tối thiểu 7 ngày làm việc đối với đơn nghỉ trên 2 ngày.`,
          });
        }
      }

      const leaveTypeCode = payload.leaveType || 'ANNUAL';
      const balance = await this.prisma.leaveBalance.findFirst({
        where: {
          employeeId: request.employeeId,
          leaveType: { code: leaveTypeCode },
          year: 2026,
        },
      });

      if (balance) {
        const available = balance.totalDays - balance.usedDays - balance.pendingDays;
        if (available < 0) {
          violations.push({
            rule: 'LEAVE.BALANCE_CHECK',
            outcome: 'REJECT',
            message: `Số ngày phép khả dụng (${available}) không đủ để đáp ứng yêu cầu (${daysRequested} ngày).`,
          });
        }
      }

      if (leaveTypeCode === 'SICK' && daysRequested > 2 && (!request.attachments || request.attachments.length === 0)) {
        violations.push({
          rule: 'LEAVE.SICK_CERT_REQUIRED_AFTER_DAYS',
          outcome: 'ESCALATE',
          message: 'Nghỉ ốm trên 2 ngày làm việc bắt buộc đính kèm giấy chứng nhận khám bệnh của cơ sở y tế.',
        });
      }
    } else if (request.type === RequestType.OVERTIME) {
      const durationHours = Number(payload.durationHours || 3);
      if (durationHours > 4) {
        violations.push({
          rule: 'OT.DAILY_LIMIT',
          outcome: 'REJECT',
          message: 'Số giờ làm thêm trong ngày vượt quá trần 4 giờ (tổng giờ làm việc > 12h/ngày).',
        });
      }
    }

    let status = request.status;
    if (violations.some((v) => v.outcome === 'REJECT')) {
      status = RequestStatus.REJECTED;
    } else if (violations.some((v) => v.outcome === 'ESCALATE')) {
      status = RequestStatus.ESCALATED;
    }

    return {
      valid: missingFields.length === 0 && !violations.some((v) => v.outcome === 'REJECT'),
      missingFields,
      violations,
      status,
      policyVersion: '2026.10-draft',
    };
  }

  async aiDecision(id: string, dto: AiDecisionDto, caller: { id: string; role: string }) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        employee: true,
        createdBy: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Không tìm thấy yêu cầu');
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException(
        `AI chỉ có thể đánh giá đơn ở trạng thái Chờ duyệt (PENDING), trạng thái hiện tại là ${request.status}`,
      );
    }

    const autonomyConfig = await this.prisma.autonomyConfig.findUnique({
      where: { requestType: request.type },
    });

    const level = autonomyConfig?.level ?? AutonomyLevel.AUTO_APPROVE_LOW_RISK;
    const minConfidence = autonomyConfig?.minConfidence ?? 0.85;

    let mustEscalate = false;
    let escalationReason = '';

    if (
      request.employee?.role === 'HR' ||
      request.employee?.role === 'ADMIN' ||
      request.createdBy?.role === 'HR' ||
      request.createdBy?.role === 'ADMIN'
    ) {
      mustEscalate = true;
      escalationReason = 'Đơn của nhân sự giữ vai trò HR/ADMIN bắt buộc chuyển cấp quản lý/con người thẩm định.';
    }

    if (dto.riskLevel !== RiskLevel.LOW) {
      mustEscalate = true;
      escalationReason = `Mức rủi ro ${dto.riskLevel} vượt ngưỡng xử lý tự động của AI, chuyển con người thẩm định.`;
    }

    if (dto.confidence < minConfidence) {
      mustEscalate = true;
      escalationReason = `Độ tin cậy của AI (${(dto.confidence * 100).toFixed(0)}%) chưa đạt ngưỡng tối thiểu (${(minConfidence * 100).toFixed(0)}%).`;
    }

    const daysRequested = Number(
      (request.computed as any)?.daysRequested || (request.payload as any)?.daysCount || 1,
    );
    if (request.type === RequestType.LEAVE && daysRequested > 3) {
      mustEscalate = true;
      escalationReason = `Đơn xin nghỉ ${daysRequested} ngày vượt trần xử lý tự động của AI (tối đa 3 ngày).`;
    }

    if (request.type === RequestType.OVERTIME) {
      const otHours = Number((request.payload as any)?.durationHours || 2);
      if (otHours > 4) {
        mustEscalate = true;
        escalationReason = `Giờ làm thêm (${otHours}h) vượt quá trần tự động 4 giờ, ảnh hưởng bảng lương cần nhân sự duyệt.`;
      }
    }

    if (level === AutonomyLevel.SUGGEST_ONLY) {
      mustEscalate = true;
      escalationReason = 'Hệ thống đang cấu hình cấp độ SUGGEST_ONLY (Chỉ đề xuất), mọi quyết định đều cần người duyệt.';
    } else if (level === AutonomyLevel.AUTO_APPROVE_LOW_RISK && dto.decision === RequestStatus.REJECTED) {
      mustEscalate = true;
      escalationReason = 'Cấp độ AUTO_APPROVE_LOW_RISK không cho phép AI tự động từ chối đơn, đã chuyển cấp quản lý.';
    }

    if (mustEscalate) {
      await this.prisma.$transaction(async (tx) => {
        await tx.request.update({
          where: { id: request.id },
          data: {
            status: RequestStatus.ESCALATED,
            riskLevel: dto.riskLevel,
            escalationReason,
          },
        });

        await tx.requestStatusHistory.create({
          data: {
            requestId: request.id,
            fromStatus: request.status,
            toStatus: RequestStatus.ESCALATED,
            actorType: ActorType.AI,
            actorId: null,
            reason: escalationReason,
          },
        });

        await tx.approval.create({
          data: {
            requestId: request.id,
            deciderType: ActorType.AI,
            approverId: null,
            step: 1,
            status: ApprovalStatus.PENDING,
            reason: `AI đề xuất: ${dto.decision}. Lý do chuyển thẩm định: ${escalationReason}`,
            riskLevel: dto.riskLevel,
            confidence: dto.confidence,
            policyVersion: '2026.10-draft',
            agentTraceId: dto.traceId,
          },
        });

        await tx.auditLog.create({
          data: {
            actorType: ActorType.AI,
            actorId: null,
            action: 'ESCALATE_REQUEST',
            entityType: 'Request',
            entityId: request.id,
            payload: {
              before: { status: request.status },
              after: { status: RequestStatus.ESCALATED, reason: escalationReason },
              proposedDecision: dto.decision,
            },
            policyVersion: '2026.10-draft',
          },
        });
      });

      return {
        id: request.id,
        status: RequestStatus.ESCALATED,
        applied: false,
        escalationReason,
      };
    }

    const finalStatus = dto.decision;
    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id: request.id },
        data: {
          status: finalStatus,
          riskLevel: dto.riskLevel,
        },
      });

      if (request.type === RequestType.LEAVE) {
        const leaveTypeId = (request.payload as any)?.leaveTypeId;
        if (leaveTypeId) {
          if (finalStatus === RequestStatus.APPROVED) {
            await tx.leaveBalance.updateMany({
              where: {
                employeeId: request.employeeId,
                leaveTypeId,
                year: 2026,
              },
              data: {
                pendingDays: { decrement: daysRequested },
                usedDays: { increment: daysRequested },
              },
            });
          } else {
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
      }

      await tx.approval.create({
        data: {
          requestId: request.id,
          deciderType: ActorType.AI,
          approverId: null,
          step: 1,
          status: finalStatus === RequestStatus.APPROVED ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
          reason: dto.reason,
          riskLevel: dto.riskLevel,
          confidence: dto.confidence,
          policyVersion: '2026.10-draft',
          agentTraceId: dto.traceId,
          decidedAt: new Date(),
        },
      });

      await tx.requestStatusHistory.create({
        data: {
          requestId: request.id,
          fromStatus: request.status,
          toStatus: finalStatus,
          actorType: ActorType.AI,
          actorId: null,
          reason: dto.reason,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: ActorType.AI,
          actorId: null,
          action: finalStatus === RequestStatus.APPROVED ? 'AI_APPROVE_REQUEST' : 'AI_REJECT_REQUEST',
          entityType: 'Request',
          entityId: request.id,
          payload: {
            before: { status: request.status },
            after: { status: finalStatus, reason: dto.reason },
            confidence: dto.confidence,
            policyRefs: dto.policyRefs,
          },
          policyVersion: '2026.10-draft',
        },
      });
    });

    return {
      id: request.id,
      status: finalStatus,
      applied: true,
      decidedBy: 'AI',
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
