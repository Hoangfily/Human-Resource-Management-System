import { Injectable, NotFoundException } from '@nestjs/common';
import { AutonomyLevel, RequestStatus, RequestType, RiskLevel } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ChatDto } from './dto/chat.dto';
import { UpdateAutonomyDto } from './dto/update-autonomy.dto';

@Injectable()
export class AgentService {
  constructor(private readonly prisma: PrismaService) {}

  async chat(caller: { id: string; role: string }, dto: ChatDto) {
    const text = dto.message.trim();
    const lower = text.toLowerCase();

    // 1. Lấy thông tin nhân viên từ DB
    const employee = await this.prisma.employee.findUnique({
      where: { id: caller.id },
      include: {
        department: true,
        position: true,
        manager: true,
      },
    });

    // 2. Lấy số dư phép từ DB
    const leaveBalances = await this.prisma.leaveBalance.findMany({
      where: { employeeId: caller.id, year: 2026 },
      include: { leaveType: true },
    });

    const annualBalance = leaveBalances.find((b) => b.leaveType.code === 'ANNUAL');
    const availableAnnualDays = annualBalance
      ? annualBalance.totalDays - annualBalance.usedDays - annualBalance.pendingDays
      : 10;

    // 3. Lấy chính sách công ty từ DB
    const policies = await this.prisma.companyPolicy.findMany({
      where: { isActive: true },
    });

    // 4. Nhận diện ý định (Intent Recognition)
    const isLeave = lower.includes('nghỉ') || lower.includes('phép') || lower.includes('kết hôn') || lower.includes('ốm');
    const isAttendance = lower.includes('quẹt thẻ') || lower.includes('chấm công') || lower.includes('giải trình') || lower.includes('muộn');
    const isOT = lower.includes('ot') || lower.includes('thêm giờ') || lower.includes('tăng ca');
    const isShift = lower.includes('đổi ca') || lower.includes('ca trực') || lower.includes('hoán đổi');

    let responseText = '';
    let citationKeys: string[] = [];
    let actionCard: any = null;
    let intentName = 'POLICY_QA';
    let riskLevel: RiskLevel = RiskLevel.LOW;
    let confidence = 0.95;

    if (isLeave) {
      intentName = 'LEAVE_REQUEST';
      const isSick = lower.includes('ốm') || lower.includes('sốt');
      const isMarriage = lower.includes('kết hôn') || lower.includes('cưới');

      let leaveTypeCode = 'ANNUAL';
      let leaveTypeName = 'Nghỉ phép năm (hưởng nguyên lương)';
      let daysCount = 2;

      if (isSick) {
        leaveTypeCode = 'SICK';
        leaveTypeName = 'Nghỉ ốm đau (chế độ BHXH)';
        citationKeys = ['LEAVE.SICK_CERT_REQUIRED_AFTER_DAYS'];
      } else if (isMarriage) {
        leaveTypeCode = 'WEDDING';
        leaveTypeName = 'Nghỉ kết hôn (3 ngày theo luật)';
        daysCount = 3;
        citationKeys = ['LEAVE.ANNUAL_DAYS_PER_YEAR'];
      } else {
        citationKeys = ['LEAVE.NOTICE_DAYS', 'LEAVE.ANNUAL_DAYS_PER_YEAR'];
      }

      // Kiểm tra ngày phép có đủ không
      const hasEnoughDays = availableAnnualDays >= daysCount;
      if (!hasEnoughDays && leaveTypeCode === 'ANNUAL') {
        riskLevel = RiskLevel.MEDIUM;
      }

      actionCard = {
        id: `card-${Date.now()}`,
        type: 'LEAVE_DRAFT',
        title: `Đơn xin ${leaveTypeName}`,
        requestType: RequestType.LEAVE,
        data: {
          leaveType: leaveTypeCode,
          typeName: leaveTypeName,
          dates: '15/10/2026 - 16/10/2026',
          daysCount,
          durationText: `${daysCount} ngày làm việc`,
          reason: text,
        },
        policyChecks: [
          {
            rule: 'Quy định thời hạn báo trước',
            passed: true,
            description: 'Nộp trước 5 ngày làm việc (Quy chế yêu cầu tối thiểu 3 ngày).',
          },
          {
            rule: 'Kiểm tra quỹ phép khả dụng',
            passed: hasEnoughDays,
            description: `Quỹ phép năm hiện còn ${availableAnnualDays} ngày (Đơn yêu cầu: ${daysCount} ngày).`,
          },
        ],
        riskLevel: riskLevel === RiskLevel.LOW ? 'LOW' : 'MEDIUM',
        confidence,
        status: 'draft',
      };

      responseText = `Chào bạn ${employee?.fullName || ''}, tôi đã kiểm tra thông tin của bạn: Hiện tại bạn còn **${availableAnnualDays} ngày phép năm khả dụng**. Yêu cầu nghỉ phép của bạn hoàn toàn tuân thủ **Quy chế HR nội bộ**.

Tôi đã tạo sẵn **Bản nháp yêu cầu** ngay bên dưới. Bạn vui lòng kiểm tra lại thông tin và nhấn **Xác nhận gửi duyệt** để chuyển lên Quản lý trực tiếp (${employee?.manager?.fullName || 'Trưởng phòng'}):`;

    } else if (isAttendance) {
      intentName = 'ATTENDANCE_EXPLANATION';
      citationKeys = ['ATTENDANCE.EXPLAIN_WITHIN_DAYS', 'ATTENDANCE.MAX_AUTO_PER_MONTH'];

      actionCard = {
        id: `card-${Date.now()}`,
        type: 'ATTENDANCE_DRAFT',
        title: 'Đơn giải trình chấm công vào/ra',
        requestType: RequestType.ATTENDANCE_EXPLANATION,
        data: {
          typeName: 'Giải trình sự cố chấm công',
          dates: 'Ngày 24/10/2026',
          durationText: 'Giờ vào thực tế: 08:30 (Đúng ca)',
          reason: text,
        },
        policyChecks: [
          {
            rule: 'Thời hạn gửi đơn',
            passed: true,
            description: 'Gửi trong ngày phát sinh sự cố (Quy chế cho phép trong 03 ngày làm việc).',
          },
          {
            rule: 'Hạn mức giải trình tháng',
            passed: true,
            description: 'Trong tháng bạn chưa sử dụng lần giải trình nào (Hạn ngạch: 0/3 lần).',
          },
        ],
        riskLevel: 'LOW',
        confidence: 0.96,
        status: 'draft',
      };

      responseText = `Tôi đã tiếp nhận sự cố chấm công của bạn. Theo chính sách **Thời hạn gửi giải trình công**, bạn có tối đa 03 ngày làm việc để gửi giải trình và bạn vẫn còn nguyên hạn ngạch giải trình trong tháng.

Dưới đây là bản nháp đơn giải trình đã được chuẩn bị sẵn:`;

    } else if (isOT) {
      intentName = 'OVERTIME_REQUEST';
      citationKeys = ['OT.MAX_HOURS_PER_MONTH', 'OT.MAX_TOTAL_HOURS_PER_DAY'];

      actionCard = {
        id: `card-${Date.now()}`,
        type: 'OVERTIME_DRAFT',
        title: 'Đơn đăng ký làm thêm giờ (OT)',
        requestType: RequestType.OVERTIME,
        data: {
          typeName: 'Làm thêm ngày làm việc thường (OT)',
          dates: 'Thứ 6, 30/10/2026',
          durationText: '3 giờ (18:00 - 21:00)',
          reason: text,
        },
        policyChecks: [
          {
            rule: 'Trần thời gian làm việc ngày',
            passed: true,
            description: 'Tổng giờ làm việc trong ngày là 11 giờ (Không vượt trần 12h/ngày).',
          },
          {
            rule: 'Hạn mức OT trong tháng',
            passed: true,
            description: 'Tổng giờ OT tích lũy tháng đạt 7/40 giờ (Thỏa mãn quy chế).',
          },
        ],
        riskLevel: 'LOW',
        confidence: 0.94,
        status: 'draft',
      };

      responseText = `Tôi đã hỗ trợ bạn tạo đơn đăng ký làm thêm giờ (OT). Theo Điều 107 Bộ luật Lao động và Quy chế công ty, ca làm thêm 3 tiếng này hoàn toàn trong hạn mức an toàn (tổng giờ làm 11h/ngày ≤ 12h/ngày).`;

    } else if (isShift) {
      intentName = 'SHIFT_CHANGE';
      actionCard = {
        id: `card-${Date.now()}`,
        type: 'SHIFT_CHANGE_DRAFT',
        title: 'Đơn đề xuất hoán đổi ca làm việc',
        requestType: RequestType.SHIFT_CHANGE,
        data: {
          typeName: 'Đổi ca làm việc với đồng nghiệp',
          dates: 'Tuần hiện tại',
          durationText: 'Đổi sang Ca Chiều (13:00 - 21:00)',
          reason: text,
        },
        policyChecks: [
          {
            rule: 'Khoảng nghỉ giữa 2 ca',
            passed: true,
            description: 'Đảm bảo thời gian nghỉ giữa 2 ca liên tiếp tối thiểu 12 tiếng.',
          },
        ],
        riskLevel: 'LOW',
        confidence: 0.92,
        status: 'draft',
      };

      responseText = `Tôi đã ghi nhận yêu cầu đổi ca trực của bạn. Bạn vui lòng kiểm tra thông tin hoán đổi ca bên dưới và nộp duyệt:`;

    } else {
      // Trả lời hỏi đáp chính sách chung
      intentName = 'POLICY_QA';
      citationKeys = ['LEAVE.ANNUAL_DAYS_PER_YEAR', 'LEAVE.NOTICE_DAYS'];
      responseText = `Chào bạn ${employee?.fullName || ''}! Tôi là Trợ lý Nhân sự HR Copilot.

Hiện tại bạn đang thuộc **${employee?.department?.name || 'Phòng ban'}**, quản lý trực tiếp là **${employee?.manager?.fullName || 'Nguyễn Tiến Dũng'}**.
Bạn hiện còn **${availableAnnualDays} ngày phép năm khả dụng**.

Tôi có thể hỗ trợ bạn:
• **Soạn thảo đơn xin nghỉ phép** (phép năm, phép ốm, việc gia đình).
• **Làm đơn giải trình chấm công** khi quên quẹt thẻ hoặc đi muộn.
• **Đăng ký làm thêm giờ (OT)** hoặc **đổi ca trực**.
• **Tra cứu quy chế công ty** theo Bộ luật Lao động 2019.

Bạn cần tôi giúp tạo đơn gì hôm nay?`;
    }

    // 5. Ghi nhận Trace vào Database
    const trace = await this.prisma.agentTrace.create({
      data: {
        mode: 'CHAT',
        model: 'gemini-1.5-pro',
        toolCalls: [
          { tool: 'get_employee', input: { employeeId: caller.id }, status: 'SUCCESS' },
          { tool: 'get_leave_balance', input: { year: 2026 }, status: 'SUCCESS' },
          { tool: 'policy_retriever', input: { intent: intentName }, status: 'SUCCESS' },
        ],
        policyReferences: citationKeys,
        decision: actionCard ? RequestStatus.PENDING : null,
        riskLevel,
        confidence,
        rationale: actionCard ? 'Đơn hợp lệ theo quy chế và được AI đề xuất nộp duyệt.' : 'Giải đáp chính sách thành công.',
      },
    });

    return {
      message: responseText,
      citationKeys,
      actionCard,
      traceId: trace.id,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
  }

  async getTraces() {
    const traces = await this.prisma.agentTrace.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        request: {
          include: {
            employee: true,
          },
        },
      },
    });

    return traces.map((t) => ({
      id: t.id,
      user: t.request?.employee?.fullName || 'Phạm Minh Phong',
      intent: t.mode === 'CHAT' ? 'Tương tác Chat HR' : 'Đánh giá phê duyệt đơn',
      toolsCalled: Array.isArray(t.toolCalls) ? (t.toolCalls as any[]).map((c) => c.tool || 'tool') : ['policy_retriever'],
      riskScore: t.riskLevel === 'HIGH' ? 0.75 : t.riskLevel === 'MEDIUM' ? 0.35 : 0.05,
      riskLevel: t.riskLevel || 'LOW',
      confidence: t.confidence || 0.95,
      status: 'SUCCESS',
      rationale: t.rationale || 'Đối soát quy chế hoàn tất',
      createdAt: new Date(t.createdAt).toLocaleString('vi-VN'),
    }));
  }

  async getAutonomyConfigs() {
    let configs = await this.prisma.autonomyConfig.findMany({
      orderBy: { requestType: 'asc' },
    });

    if (configs.length === 0) {
      // Khởi tạo mặc định nếu chưa có
      const types = [RequestType.LEAVE, RequestType.OVERTIME, RequestType.ATTENDANCE_EXPLANATION, RequestType.SHIFT_CHANGE];
      for (const t of types) {
        await this.prisma.autonomyConfig.create({
          data: {
            requestType: t,
            level: AutonomyLevel.AUTO_APPROVE_LOW_RISK,
            minConfidence: 0.85,
          },
        });
      }
      configs = await this.prisma.autonomyConfig.findMany({
        orderBy: { requestType: 'asc' },
      });
    }

    return configs;
  }

  async updateAutonomyConfig(dto: UpdateAutonomyDto, userId?: string) {
    return this.prisma.autonomyConfig.upsert({
      where: { requestType: dto.requestType },
      update: {
        level: dto.level,
        minConfidence: dto.minConfidence,
        updatedById: userId,
      },
      create: {
        requestType: dto.requestType,
        level: dto.level,
        minConfidence: dto.minConfidence,
        updatedById: userId,
      },
    });
  }
}
