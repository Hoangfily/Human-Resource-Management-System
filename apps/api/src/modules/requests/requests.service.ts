import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { addDays, currentYear, weekday } from '../../common/utils/company-date';
import { assertHardRules } from './request-rules';

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper: Trích xuất năm hợp lệ từ chuỗi ngày (YYYY-MM-DD), mặc định là năm hiện tại
   */
  private extractYear(dateStr?: string): number {
    // Đọc năm trực tiếp từ chuỗi "YYYY-MM-DD": new Date() đổi sang giờ server có thể lùi sang năm trước
    const match = dateStr ? /^(\d{4})-/.exec(dateStr) : null;
    return match ? Number(match[1]) : currentYear();
  }

  /**
   * Helper: Tính số ngày làm việc thực tế (Thứ Hai đến Thứ Sáu, trừ Thứ Bảy & Chủ Nhật theo Spec §3.3)
   */
  private countWorkingDays(startDateStr: string, endDateStr: string, halfDay?: string): number {
    if (startDateStr === endDateStr && (halfDay === 'AM' || halfDay === 'PM')) {
      return 0.5;
    }
    // Tính trên chuỗi "YYYY-MM-DD" (theo UTC) để thứ trong tuần không lệch theo múi giờ của server
    const start = startDateStr?.slice(0, 10);
    const end = endDateStr?.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(end ?? '') || end < start) {
      return 1;
    }

    let count = 0;
    for (let day = start; day <= end; day = addDays(day, 1)) {
      const dow = weekday(day);
      if (dow >= 1 && dow <= 5) {
        count++;
      }
    }
    return count;
  }

  /**
   * Helper: Kích hoạt ngầm AI Service thẩm định đơn PENDING (docs/06 item 3)
   */
  private triggerAiEvaluation(requestId: string, correlationId?: string): void {
    const aiBaseUrl = process.env.AI_API_BASE_URL || 'http://127.0.0.1:8000';
    const inboundToken = process.env.AI_INBOUND_TOKEN;
    setTimeout(async () => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (inboundToken) {
          headers['X-Service-Token'] = inboundToken;
        }
        if (correlationId) {
          headers['X-Correlation-Id'] = correlationId;
        }
        await fetch(`${aiBaseUrl}/evaluate`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ requestId }),
          signal: AbortSignal.timeout(60000),
        });
      } catch (err: any) {
        this.logger.warn(`Kích hoạt AI evaluate cho đơn #${requestId} không thành công: ${err?.message}`);
      }
    }, 0);
  }

  async create(caller: { id: string; role: string }, dto: CreateRequestDto, correlationId?: string) {
    if (caller.role === 'AI') {
      throw new ForbiddenException('AI không được phép trực tiếp tạo đơn mới');
    }

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
          agentTraces: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      if (existing) {
        return this.formatRequest(existing);
      }
    }

    // Xử lý payload và computed ngày làm việc (Spec §3.3)
    const payload = { ...dto.payload };
    let daysRequested = 1;

    if (dto.type === RequestType.LEAVE) {
      if (payload.startDate && payload.endDate) {
        daysRequested = this.countWorkingDays(payload.startDate, payload.endDate, payload.halfDay);
      } else if (payload.daysCount) {
        daysRequested = Number(payload.daysCount);
      }

      if (daysRequested === 0) {
        throw new BadRequestException('Khoảng thời gian nghỉ chỉ gồm các ngày nghỉ cuối tuần hoặc ngày lễ');
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
    const leaveYear = this.extractYear(payload.startDate);

    // Thực hiện transaction tạo đơn và các bản ghi liên quan
    const result = await this.prisma.$transaction(async (tx) => {
      // Luật cứng lớp Validation chỉ áp dụng khi gửi duyệt; bản nháp được phép chưa đầy đủ (Spec §2)
      if (status === RequestStatus.PENDING) {
        await assertHardRules(tx, dto.type, targetEmployeeId, payload);
      }

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

      // Phân công duyệt cho Quản lý trực tiếp nếu đơn gửi PENDING
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

      // Giữ chỗ ngày phép (pendingDays)
      if (status === RequestStatus.PENDING && dto.type === RequestType.LEAVE) {
        const leaveTypeId = payload.leaveTypeId;
        if (leaveTypeId) {
          await tx.leaveBalance.updateMany({
            where: {
              employeeId: targetEmployeeId,
              leaveTypeId,
              year: leaveYear,
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
          agentTraces: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
    });

    // Kích hoạt AI đánh giá nếu đơn ở trạng thái PENDING
    if (status === RequestStatus.PENDING && result) {
      this.triggerAiEvaluation(result.id, correlationId);
    }

    return this.formatRequest(result!);
  }

  async findAll(caller: { id: string; role: string }, query: QueryRequestsDto) {
    const where: Prisma.RequestWhereInput = {};

    // 1. Phân quyền xem đơn theo phạm vi tổ chức
    if (caller.role === 'EMPLOYEE') {
      where.employeeId = caller.id;
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
    } else if (['HR', 'ADMIN', 'AI'].includes(caller.role)) {
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
        agentTraces: { orderBy: { createdAt: 'desc' }, take: 1 },
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
        agentTraces: { orderBy: { createdAt: 'desc' }, take: 1 },
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

  async cancel(caller: { id: string; role: string }, id: string, reason?: string, correlationId?: string) {
    if (caller.role === 'AI') {
      throw new ForbiddenException('AI không có quyền hủy đơn');
    }

    const request = await this.prisma.request.findUnique({
      where: { id },
      include: { employee: true },
    });

    if (!request) {
      throw new NotFoundException(`Không tìm thấy yêu cầu có mã #${id}`);
    }

    if (caller.role === 'EMPLOYEE' && request.employeeId !== caller.id) {
      throw new ForbiddenException('Bạn chỉ có thể hủy đơn của chính mình');
    }

    if (
      request.status !== RequestStatus.DRAFT &&
      request.status !== RequestStatus.PENDING &&
      request.status !== RequestStatus.ESCALATED
    ) {
      throw new BadRequestException(
        `Không thể hủy đơn đang ở trạng thái ${request.status}`,
      );
    }

    const daysRequested = (request.computed as any)?.daysRequested || 1;
    const previousStatus = request.status;
    const leaveYear = this.extractYear((request.payload as any)?.startDate);

    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id },
        data: {
          status: RequestStatus.CANCELLED,
        },
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
              year: leaveYear,
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

  async submit(caller: { id: string; role: string }, id: string, correlationId?: string) {
    if (caller.role === 'AI') {
      throw new ForbiddenException('AI không có quyền gửi đơn');
    }

    const request = await this.prisma.request.findUnique({
      where: { id },
      include: { employee: true },
    });

    if (!request) {
      throw new NotFoundException(`Không tìm thấy yêu cầu có mã #${id}`);
    }

    // Chỉ chủ đơn hoặc quản lý trực tiếp của họ (hoặc HR/Admin) được gửi bản nháp đi duyệt
    if (caller.role === 'EMPLOYEE' && request.employeeId !== caller.id) {
      throw new ForbiddenException('Bạn chỉ có thể gửi đơn của chính mình');
    }
    if (caller.role === 'MANAGER' && request.employeeId !== caller.id && request.employee.managerId !== caller.id) {
      throw new ForbiddenException('Quản lý chỉ có thể gửi đơn của nhân viên thuộc quyền quản lý trực tiếp');
    }

    if (request.status !== RequestStatus.DRAFT) {
      throw new BadRequestException('Chỉ có thể gửi phê duyệt cho đơn ở trạng thái DRAFT');
    }

    const daysRequested = (request.computed as any)?.daysRequested || 1;
    const approverId = request.employee.managerId;
    const leaveYear = this.extractYear((request.payload as any)?.startDate);

    await this.prisma.$transaction(async (tx) => {
      await assertHardRules(tx, request.type, request.employeeId, request.payload as Record<string, any>, id);

      // Chỉ chuyển khi đơn vẫn là DRAFT: bấm gửi 2 lần cùng lúc thì lần sau không tạo thêm approval hay giữ chỗ phép
      const moved = await tx.request.updateMany({
        where: { id, status: RequestStatus.DRAFT },
        data: {
          status: RequestStatus.PENDING,
          submittedAt: new Date(),
        },
      });
      if (moved.count === 0) {
        throw new BadRequestException('Chỉ có thể gửi phê duyệt cho đơn ở trạng thái DRAFT');
      }

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
              year: leaveYear,
            },
            data: {
              pendingDays: { increment: daysRequested },
            },
          });
        }
      }
    });

    // Kích hoạt AI thẩm định ngầm
    this.triggerAiEvaluation(id, correlationId);

    return this.findOne(caller, id);
  }

  // Cổng AI Service gửi quyết định tự động thẩm định (docs/06 item 2)
  async aiDecision(
    caller: { id: string; role: string },
    id: string,
    dto: AiDecisionDto,
    correlationId?: string,
  ) {
    if (caller.role !== 'AI') {
      throw new ForbiddenException('Chỉ AI Service mới có quyền gọi API quyết định tự động');
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

    // 1. Idempotency: Nếu đơn đã có quyết định hoặc đã xử lý idempotencyKey
    if (request.status !== RequestStatus.PENDING) {
      if (
        dto.idempotencyKey &&
        (request.status === RequestStatus.APPROVED ||
          request.status === RequestStatus.REJECTED ||
          request.status === RequestStatus.ESCALATED)
      ) {
        return {
          id: request.id,
          status: request.status,
          applied: request.status === dto.decision,
          decidedBy: 'AI',
        };
      }
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: `Đơn đang ở trạng thái ${request.status}, không thể thẩm định`,
      });
    }

    // 2. Kiểm tra lại mức tự chủ AutonomyConfig (Không tin AI vô điều kiện theo Spec §7.3)
    const autonomyConfig = await this.prisma.autonomyConfig.findUnique({
      where: { requestType: request.type },
    });
    const level = autonomyConfig?.level ?? AutonomyLevel.SUGGEST_ONLY;
    const minConfidence = autonomyConfig?.minConfidence ?? 0.85;

    const allowedDecisions = {
      [AutonomyLevel.SUGGEST_ONLY]: new Set<RequestStatus>(),
      [AutonomyLevel.AUTO_APPROVE_LOW_RISK]: new Set<RequestStatus>([RequestStatus.APPROVED]),
      [AutonomyLevel.AUTO_DECIDE_LOW_RISK]: new Set<RequestStatus>([
        RequestStatus.APPROVED,
        RequestStatus.REJECTED,
      ]),
    }[level];

    const violations: string[] = [];
    if (!allowedDecisions || !allowedDecisions.has(dto.decision)) {
      violations.push(`Mức tự chủ ${level} không cho phép AI tự động đưa ra quyết định ${dto.decision}`);
    }
    if (dto.riskLevel !== RiskLevel.LOW) {
      violations.push(`Mức rủi ro ${dto.riskLevel} vượt ngưỡng an toàn (chỉ cho phép LOW)`);
    }
    if (dto.confidence < minConfidence) {
      violations.push(`Độ tin cậy ${dto.confidence} thấp hơn ngưỡng cấu hình tối thiểu ${minConfidence}`);
    }

    // Nếu không thỏa mãn điều kiện tự chủ: Tự động chuyển cấp ESCALATED
    if (violations.length > 0) {
      const escalationReason = violations.join('; ');
      return await this.prisma.$transaction(async (tx) => {
        let traceId: string | undefined;
        if (dto.trace) {
          const trace = await tx.agentTrace.create({
            data: {
              requestId: id,
              mode: dto.trace.mode || 'DECISION',
              model: dto.trace.model || 'unknown',
              toolCalls: dto.trace.toolCalls || [],
              policyReferences: dto.policyRefs || dto.trace.policyRefs || [],
              decision: RequestStatus.ESCALATED,
              riskLevel: dto.riskLevel,
              confidence: dto.confidence,
              rationale: dto.trace.rationale || dto.reason,
              correlationId,
            },
          });
          traceId = trace.id;
        }

        await tx.request.update({
          where: { id },
          data: {
            status: RequestStatus.ESCALATED,
            riskLevel: dto.riskLevel,
            escalationReason,
          },
        });

        await tx.requestStatusHistory.create({
          data: {
            requestId: id,
            fromStatus: RequestStatus.PENDING,
            toStatus: RequestStatus.ESCALATED,
            actorType: ActorType.AI,
            actorId: null,
            reason: escalationReason,
          },
        });

        await tx.auditLog.create({
          data: {
            actorType: ActorType.AI,
            actorId: null,
            action: 'AI_ESCALATED',
            entityType: 'Request',
            entityId: id,
            policyVersion: dto.trace?.policyVersion || '2026.10-draft',
            correlationId,
            payload: { violations, proposedDecision: dto.decision },
          },
        });

        return {
          id: request.id,
          status: RequestStatus.ESCALATED,
          applied: false,
          escalationReason,
        };
      });
    }

    // 3. Đạt điều kiện tự chủ: Áp dụng quyết định trong transaction
    const daysRequested = Number(
      (request.computed as any)?.daysRequested || (request.payload as any)?.daysCount || 1,
    );
    const leaveTypeId = (request.payload as any)?.leaveTypeId;
    const leaveYear = this.extractYear((request.payload as any)?.startDate);

    return await this.prisma.$transaction(async (tx) => {
      // Lưu vết AgentTrace
      const trace = await tx.agentTrace.create({
        data: {
          requestId: id,
          mode: dto.trace?.mode || 'DECISION',
          model: dto.trace?.model || 'unknown',
          toolCalls: dto.trace?.toolCalls || [],
          policyReferences: dto.policyRefs || dto.trace?.policyRefs || [],
          decision: dto.decision,
          riskLevel: dto.riskLevel,
          confidence: dto.confidence,
          rationale: dto.trace?.rationale || dto.reason,
          correlationId,
        },
      });

      // Cập nhật trạng thái Request
      await tx.request.update({
        where: { id },
        data: {
          status: dto.decision,
          riskLevel: dto.riskLevel,
        },
      });

      // Cập nhật hoặc tạo Approval của AI
      const pendingApproval = request.approvals.find(
        (a) => a.status === ApprovalStatus.PENDING,
      );
      if (pendingApproval) {
        await tx.approval.update({
          where: { id: pendingApproval.id },
          data: {
            deciderType: ActorType.AI,
            approverId: null,
            status:
              dto.decision === RequestStatus.APPROVED
                ? ApprovalStatus.APPROVED
                : ApprovalStatus.REJECTED,
            reason: dto.reason,
            riskLevel: dto.riskLevel,
            confidence: dto.confidence,
            policyVersion: dto.trace?.policyVersion || '2026.10-draft',
            agentTraceId: trace.id,
            decidedAt: new Date(),
          },
        });
      } else {
        await tx.approval.create({
          data: {
            requestId: id,
            deciderType: ActorType.AI,
            approverId: null,
            status:
              dto.decision === RequestStatus.APPROVED
                ? ApprovalStatus.APPROVED
                : ApprovalStatus.REJECTED,
            reason: dto.reason,
            riskLevel: dto.riskLevel,
            confidence: dto.confidence,
            policyVersion: dto.trace?.policyVersion || '2026.10-draft',
            agentTraceId: trace.id,
            decidedAt: new Date(),
          },
        });
      }

      // Ghi lịch sử trạng thái
      await tx.requestStatusHistory.create({
        data: {
          requestId: id,
          fromStatus: RequestStatus.PENDING,
          toStatus: dto.decision,
          actorType: ActorType.AI,
          actorId: null,
          reason: dto.reason,
        },
      });

      // Ghi AuditLog
      await tx.auditLog.create({
        data: {
          actorType: ActorType.AI,
          actorId: null,
          action: 'AI_DECISION',
          entityType: 'Request',
          entityId: id,
          policyVersion: dto.trace?.policyVersion || '2026.10-draft',
          correlationId,
          payload: { decision: dto.decision, riskLevel: dto.riskLevel, confidence: dto.confidence },
        },
      });

      // Cập nhật Quỹ phép
      if (request.type === RequestType.LEAVE && leaveTypeId) {
        if (dto.decision === RequestStatus.APPROVED) {
          await tx.leaveBalance.updateMany({
            where: {
              employeeId: request.employeeId,
              leaveTypeId,
              year: leaveYear,
            },
            data: {
              pendingDays: { decrement: daysRequested },
              usedDays: { increment: daysRequested },
            },
          });
        } else if (dto.decision === RequestStatus.REJECTED) {
          await tx.leaveBalance.updateMany({
            where: {
              employeeId: request.employeeId,
              leaveTypeId,
              year: leaveYear,
            },
            data: {
              pendingDays: { decrement: daysRequested },
            },
          });
        }
      }

      return {
        id: request.id,
        status: dto.decision,
        applied: true,
        decidedBy: 'AI',
      };
    });
  }

  // Ra quyết định phê duyệt hoặc từ chối bởi Con người (Manager / HR / Admin)
  async decision(
    caller: { id: string; role: string },
    id: string,
    dto: DecisionDto,
    correlationId?: string,
  ) {
    if (caller.role === 'EMPLOYEE' || caller.role === 'AI') {
      throw new ForbiddenException('Nhân viên hoặc AI không có quyền thực hiện duyệt thủ công của con người');
    }

    if (
      dto.status !== RequestStatus.APPROVED &&
      dto.status !== RequestStatus.REJECTED
    ) {
      throw new BadRequestException(
        'Quyết định phê duyệt chỉ có thể là APPROVED hoặc REJECTED',
      );
    }

    const effectiveReason = dto.reason?.trim() || dto.note?.trim();
    if (dto.status === RequestStatus.REJECTED && !effectiveReason) {
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
    const leaveYear = this.extractYear((request.payload as any)?.startDate);
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
        dto.note?.trim() ||
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
            reason: decisionReason,
            decidedAt: new Date(),
          },
        });
      } else {
        await tx.approval.create({
          data: {
            requestId: id,
            step: 1,
            approverId: caller.id,
            status:
              dto.status === RequestStatus.APPROVED
                ? ApprovalStatus.APPROVED
                : ApprovalStatus.REJECTED,
            reason: decisionReason,
            deciderType: ActorType.HUMAN,
            decidedAt: new Date(),
          },
        });
      }

      // 3. Ghi lịch sử trạng thái RequestStatusHistory
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
              year: leaveYear,
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
              year: leaveYear,
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
          correlationId,
          payload: { reason: decisionReason },
        },
      });
    });

    return this.findOne(caller, id);
  }

  // Chuyển cấp thẩm định lên HR (Manager / HR / Admin / AI, docs/06 item 4)
  async escalate(
    caller: { id: string; role: string },
    id: string,
    dto: EscalateDto,
    correlationId?: string,
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

    if (request.status !== RequestStatus.PENDING && request.status !== RequestStatus.DRAFT) {
      if (request.status === RequestStatus.ESCALATED) {
        return this.findOne(caller, id);
      }
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: `Chỉ có thể chuyển cấp thẩm định cho đơn ở trạng thái PENDING hoặc DRAFT (hiện tại: ${request.status})`,
      });
    }

    const isAi = caller.role === 'AI';
    const actorType = isAi ? ActorType.AI : ActorType.HUMAN;
    const actorId = isAi ? null : caller.id;

    await this.prisma.$transaction(async (tx) => {
      let traceId: string | undefined;
      if (isAi && dto.trace) {
        const trace = await tx.agentTrace.create({
          data: {
            requestId: id,
            mode: dto.trace.mode || 'DECISION',
            model: dto.trace.model || 'unknown',
            toolCalls: dto.trace.toolCalls || [],
            policyReferences: dto.trace.policyRefs || [],
            decision: RequestStatus.ESCALATED,
            riskLevel: dto.riskLevel || RiskLevel.HIGH,
            confidence: dto.trace.confidence || null,
            rationale: dto.trace.rationale || dto.reason,
            correlationId,
          },
        });
        traceId = trace.id;
      }

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
            agentTraceId: traceId,
          },
        });
      }

      await tx.requestStatusHistory.create({
        data: {
          requestId: id,
          fromStatus: request.status,
          toStatus: RequestStatus.ESCALATED,
          actorType,
          actorId,
          reason: dto.reason,
        },
      });

      await tx.auditLog.create({
        data: {
          actorType,
          actorId,
          action: 'REQUEST_ESCALATED',
          entityType: 'Request',
          entityId: id,
          policyVersion: dto.trace?.policyVersion || '2026.10-draft',
          correlationId,
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
    correlationId?: string,
  ) {
    if (caller.role === 'EMPLOYEE' || caller.role === 'AI') {
      throw new ForbiddenException('Nhân viên hoặc AI không có quyền trả lại đơn');
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
    const leaveYear = this.extractYear((request.payload as any)?.startDate);

    await this.prisma.$transaction(async (tx) => {
      await tx.request.update({
        where: { id },
        data: {
          status: RequestStatus.DRAFT,
          escalationReason: dto.reason,
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
            year: leaveYear,
          },
          data: {
            pendingDays: { decrement: daysRequested },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorType: ActorType.HUMAN,
          actorId: caller.id,
          action: 'REQUEST_RETURNED_TO_DRAFT',
          entityType: 'Request',
          entityId: id,
          correlationId,
          payload: { reason: dto.reason },
        },
      });
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
        agentTraces: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return requests.map((r) => this.formatRequest(r));
  }

  // Định dạng dữ liệu chuẩn hóa trả về cho Frontend (loại bỏ dữ liệu giả theo docs/06)
  private formatRequest(req: any) {
    const activeApproval = req.approvals?.[0];
    const aiApproval = (req.approvals || []).find((a: any) => a.deciderType === ActorType.AI);
    const aiTrace = (req.agentTraces || [])[0];

    const timeline = (req.statusHistory || []).map((h: any) => ({
      title: this.getTimelineTitle(h.toStatus),
      actor: h.actor?.fullName || (h.actorType === ActorType.AI ? 'Trợ lý AI' : 'Hệ thống'),
      actorType: h.actorType,
      timestamp: new Date(h.createdAt).toLocaleString('vi-VN'),
      description: h.reason || '',
      status: this.getTimelineStatus(h.toStatus),
    }));

    const aiConfidence = aiApproval?.confidence ?? aiTrace?.confidence ?? null;
    const aiRationale = aiApproval?.reason ?? aiTrace?.rationale ?? null;

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
      riskLevel: req.riskLevel ?? aiApproval?.riskLevel ?? null,
      aiRiskScore: (req.riskLevel || aiApproval?.riskLevel) ? ((req.riskLevel || aiApproval?.riskLevel) === RiskLevel.HIGH ? 0.8 : (req.riskLevel || aiApproval?.riskLevel) === RiskLevel.MEDIUM ? 0.4 : 0.05) : null,
      aiConfidence,
      aiRationale,
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
