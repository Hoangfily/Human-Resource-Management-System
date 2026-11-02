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
  async getTraces(limit = 50) {
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
      // Gọi sang FastAPI AI Service nếu đang chạy (kèm X-Service-Token theo docs/06 item 7)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (process.env.AI_INBOUND_TOKEN) {
        headers['X-Service-Token'] = process.env.AI_INBOUND_TOKEN;
      }
      const response = await fetch(`${aiBaseUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          employeeId: caller.id,
          message: dto.message,
          conversationId: dto.conversationId,
        }),
        // AI treo thì Web không bị chờ mãi: quá thời gian sẽ chuyển sang phản hồi dự phòng
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          ...data,
          reply: data.reply || data.message,
          message: data.message || data.reply,
          sources: data.sources || data.citationKeys || [],
          citationKeys: data.citationKeys || data.sources || [],
          fallback: false,
        };
      }
      this.logger.warn(`AI Service trả về HTTP ${response.status} cho /api/chat. Kích hoạt phản hồi dự phòng.`);
    } catch (err: any) {
      this.logger.warn(`AI Service tại ${aiBaseUrl} chưa khả dụng (${err?.message}). Kích hoạt phản hồi dự phòng.`);
    }

    // --- PHẢN HỒI DỰ PHÒNG KHI AI SERVICE KHÔNG TRẢ LỜI ---
    // Chỉ tra cứu dữ liệu thật trong DB, không tự suy đoán; luôn báo rõ đây không phải câu trả lời của AI.
    const currentYear = Number(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(new Date()),
    );
    const employee = await this.prisma.employee.findUnique({
      where: { id: caller.id },
      include: { leaveBalances: { where: { year: currentYear }, include: { leaveType: true } } },
    });

    const userMsg = dto.message.toLowerCase();
    let reply = `Trợ lý AI tạm thời không khả dụng, dưới đây là thông tin tra cứu tự động. `;
    let policyReferences: string[] = [];

    // Kiểm tra câu hỏi về số dư phép
    if (userMsg.includes('phép') && (userMsg.includes('còn') || userMsg.includes('bao nhiêu') || userMsg.includes('số dư'))) {
      const annualBalance = employee?.leaveBalances.find((b) => b.leaveType.code === 'ANNUAL');
      if (annualBalance) {
        const available = annualBalance.totalDays - annualBalance.usedDays - annualBalance.pendingDays;
        reply += `Năm ${currentYear} bạn còn ${available} ngày phép năm có thể sử dụng (Đã dùng: ${annualBalance.usedDays} ngày, Đang chờ duyệt: ${annualBalance.pendingDays} ngày).`;
      } else {
        reply += `Chưa tìm thấy quỹ phép năm ${currentYear} của bạn, vui lòng liên hệ phòng Nhân sự.`;
      }
    }
    // Kiểm tra câu hỏi về quy chế / chính sách công ty
    else {
      const policies = await this.prisma.companyPolicy.findMany({ where: { isActive: true } });
      // So khớp theo cụm 2 từ liền nhau ("làm thêm", "nghỉ ốm", "đi muộn"): từ đơn như "làm", "giờ" có trong gần như mọi quy chế
      const phrases = this.wordPairs(userMsg);
      const matched = policies
        .map((p) => {
          const text = ` ${this.normalizeWords(`${p.title} ${p.content}`).join(' ')} `;
          return { policy: p, score: phrases.filter((phrase) => text.includes(` ${phrase} `)).length };
        })
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((m) => m.policy);

      if (matched.length > 0) {
        reply += `Dựa theo nội quy công ty:\n- ${matched.map((m) => `${m.title}: ${m.content}`).join('\n- ')}`;
        policyReferences = matched.map((m) => m.key);
      } else {
        reply += `Trong lúc này bạn có thể hỏi về số dư ngày phép hoặc tra cứu quy chế theo cụm từ, ví dụ "làm thêm giờ", "nghỉ ốm", "đi muộn".`;
      }
    }

    // Lưu lại trace vào cơ sở dữ liệu
    const trace = await this.prisma.agentTrace.create({
      data: {
        mode: 'CHAT',
        toolCalls: [],
        policyReferences: policyReferences.length > 0 ? policyReferences : undefined,
        model: 'fallback',
        rationale: 'Phản hồi dự phòng (AI Service không trả lời), tra cứu trực tiếp từ DB',
      },
    });

    return {
      conversationId: dto.conversationId || 'conv-default',
      reply,
      message: reply,
      sources: policyReferences,
      citationKeys: policyReferences,
      traceId: trace.id,
      timestamp: new Date().toISOString(),
      fallback: true,
    };
  }

  /** Chữ thường, chuẩn hóa Unicode (NFC) và tách theo mọi ký tự không phải chữ/số. */
  private normalizeWords(text: string): string[] {
    return text
      .normalize('NFC')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
  }

  /** Các cụm 2 từ liền nhau trong câu, không trùng lặp. */
  private wordPairs(text: string): string[] {
    const words = this.normalizeWords(text);
    return [...new Set(words.slice(1).map((word, i) => `${words[i]} ${word}`))];
  }
}
