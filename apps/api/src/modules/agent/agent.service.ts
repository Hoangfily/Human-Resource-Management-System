import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AutonomyLevel, RequestType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UpdateAutonomyDto } from './dto/update-autonomy.dto';
import { ChatMessageDto } from './dto/chat-message.dto';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 1. Lấy danh sách Cấu hình mức độ tự chủ của AI (AutonomyConfig) cho từng loại đơn
   */
  async getAutonomyConfigs() {
    const configs = await this.prisma.autonomyConfig.findMany();
    const allTypes: RequestType[] = [
      RequestType.LEAVE,
      RequestType.OVERTIME,
      RequestType.ATTENDANCE_EXPLANATION,
      RequestType.SHIFT_CHANGE,
    ];

    // Đảm bảo trả về đủ 4 loại đơn (nếu loại nào chưa có trong DB thì lấy giá trị mặc định)
    return allTypes.map((type) => {
      const found = configs.find((c) => c.requestType === type);
      return (
        found || {
          requestType: type,
          level: AutonomyLevel.SUGGEST_ONLY,
          minConfidence: 0.85,
          updatedAt: new Date(),
        }
      );
    });
  }

  /**
   * 2. Cập nhật mức độ tự chủ cho một loại đơn (Dành riêng cho HR / Admin)
   */
  async updateAutonomyConfig(
    caller: { id: string; role: string },
    requestType: RequestType,
    dto: UpdateAutonomyDto,
  ) {
    if (caller.role !== 'HR' && caller.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Chỉ có bộ phận HR hoặc Quản trị viên mới có quyền thay đổi mức độ tự chủ của AI.',
      );
    }

    return this.prisma.autonomyConfig.upsert({
      where: { requestType },
      update: {
        level: dto.level,
        minConfidence: dto.minConfidence ?? 0.85,
        updatedById: caller.id,
        updatedAt: new Date(),
      },
      create: {
        requestType,
        level: dto.level,
        minConfidence: dto.minConfidence ?? 0.85,
        updatedById: caller.id,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * 3. Lấy danh sách nhật ký suy luận & gọi tool của AI (AgentTrace)
   */
  async getTraces(limit = 20) {
    return this.prisma.agentTrace.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        request: {
          select: {
            id: true,
            type: true,
            status: true,
            employee: { select: { fullName: true, email: true } },
          },
        },
      },
    });
  }

  /**
   * 4. Cổng tiếp nhận & chuyển tiếp hội thoại (Chat Turn) giữa Web và Trợ lý AI
   */
  async chatWithAgent(caller: { id: string; role: string }, dto: ChatMessageDto) {
    const aiBaseUrl = process.env.AI_API_BASE_URL || 'http://127.0.0.1:8000';

    try {
      // Gọi sang FastAPI AI Service nếu đang chạy
      const response = await fetch(`${aiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: caller.id,
          message: dto.message,
          conversationId: dto.conversationId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data;
      }
    } catch {
      this.logger.warn(`AI Service tại ${aiBaseUrl} chưa khả dụng. Kích hoạt bộ trợ lý phản hồi dự phòng.`);
    }

    // --- FALLBACK THÔNG MINH KHI AI SERVICE CHƯA CHẠY ---
    const employee = await this.prisma.employee.findUnique({
      where: { id: caller.id },
      include: { leaveBalances: { include: { leaveType: true } } },
    });

    const userMsg = dto.message.toLowerCase();
    let reply = `Chào bạn ${employee?.fullName || ''}! Tôi là Trợ lý Nhân sự HR Agent. `;
    let policyReferences: string[] = [];

    // Kiểm tra câu hỏi về số dư phép
    if (userMsg.includes('phép') && (userMsg.includes('còn') || userMsg.includes('bao nhiêu') || userMsg.includes('số dư'))) {
      const annualBalance = employee?.leaveBalances.find((b) => b.leaveType.code === 'ANNUAL');
      const available = annualBalance
        ? annualBalance.totalDays - annualBalance.usedDays - annualBalance.pendingDays
        : 12;
      reply += `Hiện tại bạn còn ${available} ngày phép năm có thể sử dụng (Đã dùng: ${annualBalance?.usedDays || 0} ngày, Đang chờ duyệt: ${annualBalance?.pendingDays || 0} ngày). Bạn có muốn tôi hỗ trợ tạo đơn xin nghỉ phép không?`;
    } 
    // Kiểm tra câu hỏi về quy chế / chính sách công ty
    else {
      const policies = await this.prisma.companyPolicy.findMany({ where: { isActive: true } });
      const matched = policies.filter((p) =>
        userMsg.split(' ').some((word) => word.length > 2 && (p.title.toLowerCase().includes(word) || p.content.toLowerCase().includes(word))),
      );

      if (matched.length > 0) {
        reply += `Dựa theo nội quy công ty:\n- ${matched.map((m) => `${m.title}: ${m.content}`).join('\n- ')}`;
        policyReferences = matched.map((m) => m.key);
      } else {
        reply += `Tôi có thể hỗ trợ bạn tra cứu quy định nghỉ phép, kiểm tra số dư ngày phép, hướng dẫn tạo đơn hoặc giải trình chấm công. Bạn cần tôi giúp gì nào?`;
      }
    }

    // Lưu lại trace vào cơ sở dữ liệu
    const trace = await this.prisma.agentTrace.create({
      data: {
        mode: 'CHAT',
        toolCalls: [],
        policyReferences: policyReferences.length > 0 ? policyReferences : undefined,
        confidence: 0.95,
        rationale: 'Phản hồi từ cơ sở tri thức chính sách nội bộ',
      },
    });

    return {
      conversationId: dto.conversationId || 'conv-default',
      reply,
      sources: policyReferences,
      traceId: trace.id,
      timestamp: new Date().toISOString(),
    };
  }
}
