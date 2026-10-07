import React, { useState, useRef, useEffect } from 'react';
import {
  Card,
  Input,
  Button,
  Space,
  Typography,
  Avatar,
  Tag,
  Alert,
  Divider,
  App as AntdApp,
  Row,
  Col,
  Progress,
  Badge,
  Drawer,
  Modal,
  Form,
  DatePicker,
  Tooltip,
} from 'antd';
import {
  RobotOutlined,
  UserOutlined,
  SendOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  FileDoneOutlined,
  BookOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  EditOutlined,
  InfoCircleOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  CalendarOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { RequestStatus, RequestType } from '@hr-agent/shared';
import { useAuth } from '../auth/AuthContext';
import { MOCK_LEAVE_BALANCE, addMockRequest } from '../../lib/mock-data';
import { RequestItem } from '../../types';

const { Title, Text, Paragraph } = Typography;

// Định nghĩa cấu trúc Action Card nhúng trong tin nhắn của AI
export interface ChatActionCard {
  id: string;
  type: 'LEAVE_DRAFT' | 'ATTENDANCE_DRAFT' | 'OVERTIME_DRAFT';
  title: string;
  requestType: RequestType;
  data: {
    typeName: string;
    dates: string;
    durationText: string;
    reason: string;
    extraNote?: string;
  };
  policyChecks: {
    rule: string;
    passed: boolean;
    description: string;
  }[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  autonomyLevelMatch: string;
  status: 'draft' | 'submitted';
  submittedRequestId?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  citationKeys?: string[];
  actionCard?: ChatActionCard;
}

// Bảng dữ liệu quy chế nội bộ theo chuẩn docs/03-policy.md
const POLICY_LIBRARY: Record<
  string,
  { title: string; excerpt: string; baseLaw: string; autonomyRule: string }
> = {
  'LEAVE.NOTICE_DAYS': {
    title: 'Thời hạn báo trước khi nghỉ phép (LEAVE.NOTICE_DAYS)',
    excerpt:
      'Nghỉ phép từ 01 đến 02 ngày: Phải nộp đơn trước ít nhất 03 ngày làm việc. Nghỉ phép trên 02 ngày liên tiếp: Phải nộp đơn trước ít nhất 07 ngày làm việc.',
    baseLaw: 'Quy chế HR nội bộ & Điều 113 Bộ luật Lao động 2019',
    autonomyRule: 'AI được phép AUTO_APPROVE nếu thỏa mãn thời hạn báo trước và số dư phép đủ.',
  },
  'LEAVE.ANNUAL_DAYS_PER_YEAR': {
    title: 'Tiêu chuẩn ngày phép năm (LEAVE.ANNUAL_DAYS_PER_YEAR)',
    excerpt:
      'Mỗi nhân viên chính thức có tiêu chuẩn 12 ngày phép hưởng nguyên lương mỗi năm. Cứ mỗi 05 năm làm việc tại công ty được cộng thêm 01 ngày phép.',
    baseLaw: 'Điều 113 & 114 Bộ luật Lao động 2019',
    autonomyRule: 'Hệ thống tự động kiểm tra số dư từ bảng LeaveBalance.',
  },
  'LEAVE.PERSONAL_DAYS': {
    title: 'Chế độ nghỉ việc riêng có lương (LEAVE.PERSONAL_DAYS)',
    excerpt:
      'Bản thân kết hôn: 03 ngày. Con đẻ/con nuôi kết hôn: 01 ngày. Bố đẻ, mẹ đẻ, bố chồng, mẹ chồng (hoặc vợ), vợ/chồng, con mất: 03 ngày.',
    baseLaw: 'Điều 115 Bộ luật Lao động 2019',
    autonomyRule: 'Hưởng nguyên lương, cần đính kèm ảnh giấy chứng nhận hoặc thông báo hợp lệ.',
  },
  'ATTENDANCE.EXPLAIN_WITHIN_DAYS': {
    title: 'Thời hạn giải trình chấm công (ATTENDANCE.EXPLAIN_WITHIN_DAYS)',
    excerpt:
      'Nhân viên quên quẹt thẻ, quẹt muộn do lỗi hệ thống hoặc công tác đột xuất phải gửi đơn giải trình trong vòng 03 ngày làm việc.',
    baseLaw: 'Quy chế chấm công điện tử HRMS 2026',
    autonomyRule: 'Tối đa 03 lần giải trình tự động/tháng (ATTENDANCE.MAX_AUTO_PER_MONTH).',
  },
  'OT.MAX_HOURS_PER_MONTH': {
    title: 'Quy định làm thêm giờ (OT.MAX_HOURS_PER_MONTH)',
    excerpt:
      'Tổng số giờ làm thêm tối đa không quá 40 giờ trong một tháng và không quá 200 giờ trong một năm. Tổng giờ làm việc bình thường + OT không quá 12 giờ/ngày.',
    baseLaw: 'Điều 107 Bộ luật Lao động 2019',
    autonomyRule: 'AI kiểm tra hạn ngạch OT lũy kế trong tháng trước khi đề xuất phê duyệt.',
  },
};

export const AgentChatPage: React.FC = () => {
  const { user } = useAuth();
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<string>('');
  const [activePromptCategory, setActivePromptCategory] = useState<'leave' | 'attendance' | 'policy'>('leave');

  // Drawer xem chi tiết quy chế
  const [selectedPolicyKey, setSelectedPolicyKey] = useState<string | null>(null);

  // Modal chỉnh sửa bản nháp
  const [editingCard, setEditingCard] = useState<ChatActionCard | null>(null);
  const [editReason, setEditReason] = useState('');

  // Danh sách hội thoại
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'agent',
      text: `Xin chào **${user?.fullName || 'bạn'}**! Tôi là **Trợ lý HR AI**. 
Tôi có thể hỗ trợ bạn tra cứu quy chế nội bộ công ty (phép năm, chấm công, chế độ làm thêm) và **tự động tạo bản nháp đơn từ** qua đối thoại. 
Bạn cần hỗ trợ công việc gì hôm nay?`,
      timestamp: '08:30',
      citationKeys: ['LEAVE.ANNUAL_DAYS_PER_YEAR', 'LEAVE.NOTICE_DAYS'],
    },
  ]);

  // Cuộn mượt xuống đáy khung chat khi có tin nhắn mới
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Bộ gợi ý câu hỏi nhanh theo danh mục
  const PROMPTS = {
    leave: [
      {
        label: '🌴 Xin nghỉ phép 2 ngày tuần tới',
        query: 'Tôi muốn xin nghỉ phép 2 ngày 15/10 và 16/10 do việc gia đình',
      },
      {
        label: '🤒 Xin nghỉ ốm 2 ngày',
        query: 'Tôi bị cảm sốt cần xin nghỉ ốm hôm nay và ngày mai (2 ngày)',
      },
      {
        label: '💍 Xin nghỉ kết hôn 3 ngày',
        query: 'Tôi chuẩn bị kết hôn vào tuần sau, tôi muốn xin nghỉ 3 ngày theo chế độ',
      },
    ],
    attendance: [
      {
        label: '⏰ Quên quẹt thẻ sáng nay',
        query: 'Sáng nay 07/10 tôi quên quẹt thẻ cửa trước lúc 8:30, hãy giúp tôi làm đơn giải trình',
      },
      {
        label: '⚡ Đăng ký làm thêm giờ (OT 3 tiếng)',
        query: 'Tôi muốn đăng ký làm thêm giờ (OT) 3 tiếng tối thứ 6 tuần này từ 18:00 đến 21:00',
      },
      {
        label: '🚗 Đi muộn do kẹt xe',
        query: 'Hôm nay tôi đến văn phòng muộn 20 phút do tắc đường, xin hướng dẫn giải trình',
      },
    ],
    policy: [
      {
        label: '📊 Kiểm tra số ngày phép còn lại',
        query: 'Kiểm tra giúp tôi xem tôi còn bao nhiêu ngày phép năm khả dụng?',
      },
      {
        label: '📜 Quy định thời hạn nộp đơn nghỉ phép',
        query: 'Quy định công ty yêu cầu phải nộp đơn xin nghỉ phép trước bao nhiêu ngày?',
      },
      {
        label: '💼 Quy định số giờ OT tối đa trong tháng',
        query: 'Theo luật và quy chế công ty, một tháng nhân viên được làm thêm tối đa bao nhiêu giờ OT?',
      },
    ],
  };

  // Xử lý gửi tin nhắn & sinh phản hồi thông minh của AI
  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isThinking) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsThinking(true);

    // Kịch bản suy luận mô phỏng Agentic Tool Calling & RAG
    const lower = text.toLowerCase();
    const isLeave = lower.includes('nghỉ') || lower.includes('phép') || lower.includes('kết hôn') || lower.includes('ốm');
    const isAttendance = lower.includes('quẹt thẻ') || lower.includes('chấm công') || lower.includes('giải trình') || lower.includes('muộn');
    const isOT = lower.includes('ot') || lower.includes('thêm giờ');

    setThinkingStep('🔍 [Intent] Đang phân tích ý định người dùng...');

    setTimeout(() => {
      setThinkingStep('⚡ [Tools] Gọi Tool get_employee_context() & get_leave_balance()...');
    }, 400);

    setTimeout(() => {
      setThinkingStep('📜 [RAG] Đối soát quy chế công ty (docs/03-policy.md)...');
    }, 800);

    setTimeout(() => {
      setIsThinking(false);
      setThinkingStep('');

      if (isLeave) {
        // Sinh đơn nghỉ phép
        const isSick = lower.includes('ốm') || lower.includes('sốt');
        const isMarriage = lower.includes('kết hôn') || lower.includes('cưới');

        let leaveTypeName = 'Nghỉ phép năm (ANNUAL)';
        let daysCount = 2;
        let dates = '15/10/2026 - 16/10/2026';
        let reason = text;
        const citations = ['LEAVE.NOTICE_DAYS', 'LEAVE.ANNUAL_DAYS_PER_YEAR'];

        if (isSick) {
          leaveTypeName = 'Nghỉ ốm đau (SICK)';
          daysCount = 2;
          dates = 'Hôm nay & Ngày mai';
          citations.push('LEAVE.PERSONAL_DAYS');
        } else if (isMarriage) {
          leaveTypeName = 'Nghỉ việc riêng có lương (PERSONAL - Kết hôn)';
          daysCount = 3;
          dates = '20/10/2026 - 22/10/2026';
          citations.push('LEAVE.PERSONAL_DAYS');
        }

        const draftCard: ChatActionCard = {
          id: `card-${Date.now()}`,
          type: 'LEAVE_DRAFT',
          title: `Đơn xin ${leaveTypeName}`,
          requestType: RequestType.Leave,
          data: {
            typeName: leaveTypeName,
            dates,
            durationText: `${daysCount} ngày làm việc`,
            reason,
            extraNote: isSick ? 'Nghỉ ốm ≤ 02 ngày, không bắt buộc đính kèm giấy viện ngay.' : 'Đã đối soát lịch làm việc.',
          },
          policyChecks: [
            {
              rule: 'LEAVE.NOTICE_DAYS',
              passed: true,
              description: 'Thời hạn gửi đơn hợp lệ theo quy chế (báo trước đủ 3 ngày làm việc).',
            },
            {
              rule: 'LEAVE.BALANCE_CHECK',
              passed: true,
              description: 'Số dư quỹ phép còn đủ (Hiện còn 10/12 ngày phép năm khả dụng).',
            },
            {
              rule: 'AUTONOMY_LEVEL',
              passed: true,
              description: 'Mức rủi ro THẤP (LOW RISK). Thuộc diện đủ điều kiện AUTO_APPROVE_LOW_RISK.',
            },
          ],
          riskLevel: 'LOW',
          confidence: 0.96,
          autonomyLevelMatch: 'AUTO_APPROVE_LOW_RISK',
          status: 'draft',
        };

        const agentMsg: ChatMessage = {
          id: `agent-${Date.now()}`,
          sender: 'agent',
          text: `Dựa trên yêu cầu của bạn, tôi đã kiểm tra: Bạn hiện còn **10 ngày phép năm** và lịch làm việc không bị trùng lặp. Yêu cầu của bạn hoàn toàn tuân thủ **Quy chế HR (§4.2)**. 

Tôi đã tạo sẵn **Bản nháp yêu cầu** ngay bên dưới. Bạn vui lòng kiểm tra thông tin và nhấn **Xác nhận gửi duyệt** để chuyển tiếp lên hệ thống:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          citationKeys: citations,
          actionCard: draftCard,
        };

        setMessages((prev) => [...prev, agentMsg]);
      } else if (isAttendance) {
        // Sinh đơn giải trình chấm công
        const draftCard: ChatActionCard = {
          id: `card-${Date.now()}`,
          type: 'ATTENDANCE_DRAFT',
          title: 'Đơn giải trình chấm công vào/ra',
          requestType: RequestType.AttendanceExplanation,
          data: {
            typeName: 'Giải trình quên Check-in (Quên quẹt thẻ)',
            dates: 'Ngày 07/10/2026',
            durationText: 'Giờ vào thực tế: 08:30 (Đúng ca)',
            reason: text,
            extraNote: 'Vân tay cửa trước Tầng 4 bị lỗi nhận diện.',
          },
          policyChecks: [
            {
              rule: 'ATTENDANCE.EXPLAIN_WITHIN_DAYS',
              passed: true,
              description: 'Nộp trong ngày phát sinh (Quy định cho phép trong vòng 03 ngày).',
            },
            {
              rule: 'ATTENDANCE.MONTHLY_QUOTA',
              passed: true,
              description: 'Trong tháng 10 bạn chưa sử dụng lần giải trình nào (Hạn ngạch: 0/3 lần).',
            },
          ],
          riskLevel: 'LOW',
          confidence: 0.94,
          autonomyLevelMatch: 'AUTO_APPROVE_LOW_RISK',
          status: 'draft',
        };

        const agentMsg: ChatMessage = {
          id: `agent-${Date.now()}`,
          sender: 'agent',
          text: `Tôi đã ghi nhận sự cố chấm công của bạn. Theo chính sách **ATTENDANCE.EXPLAIN_WITHIN_DAYS**, bạn có 03 ngày làm việc để gửi giải trình và trong tháng này bạn vẫn còn đủ hạn mức giải trình (0/3 lần). 

Dưới đây là bản nháp đơn giải trình đã được điền thông tin tự động:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          citationKeys: ['ATTENDANCE.EXPLAIN_WITHIN_DAYS'],
          actionCard: draftCard,
        };

        setMessages((prev) => [...prev, agentMsg]);
      } else if (isOT) {
        // Sinh đơn đăng ký OT
        const draftCard: ChatActionCard = {
          id: `card-${Date.now()}`,
          type: 'OVERTIME_DRAFT',
          title: 'Đơn đăng ký làm thêm giờ (Overtime)',
          requestType: RequestType.Overtime,
          data: {
            typeName: 'Làm thêm ngày làm việc thường (OT)',
            dates: 'Thứ 6, 10/10/2026',
            durationText: '3 giờ (18:00 - 21:00)',
            reason: text,
            extraNote: 'Công việc: Hỗ trợ triển khai bàn giao phiên bản sprint.',
          },
          policyChecks: [
            {
              rule: 'OT.MAX_HOURS_PER_MONTH',
              passed: true,
              description: 'Lũy kế giờ OT tháng này: 12/40 giờ (Không vượt trần 40h/tháng).',
            },
            {
              rule: 'OT.DAILY_LIMIT',
              passed: true,
              description: 'Tổng giờ làm việc trong ngày: 8h chính thức + 3h OT = 11h ≤ 12h/ngày.',
            },
          ],
          riskLevel: 'LOW',
          confidence: 0.92,
          autonomyLevelMatch: 'AUTO_APPROVE_LOW_RISK',
          status: 'draft',
        };

        const agentMsg: ChatMessage = {
          id: `agent-${Date.now()}`,
          sender: 'agent',
          text: `Yêu cầu làm thêm giờ của bạn đã được đối soát với quy chuẩn **Điều 107 Bộ luật Lao động** và quy chế OT nội bộ. Bạn còn dư 28 giờ OT trong tháng. 

Tôi đã soạn sẵn đơn đăng ký làm thêm giờ để gửi Quản lý phê duyệt:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          citationKeys: ['OT.MAX_HOURS_PER_MONTH'],
          actionCard: draftCard,
        };

        setMessages((prev) => [...prev, agentMsg]);
      } else {
        // Câu trả lời tra cứu thông tin chung
        const agentMsg: ChatMessage = {
          id: `agent-${Date.now()}`,
          sender: 'agent',
          text: `Dưới đây là thông tin tra cứu từ **Cơ sở tri thức Quy chế Nhân sự (Policy RAG)**:

- **Số ngày phép năm tiêu chuẩn:** Mỗi nhân sự chính thức có **12 ngày/năm** (Điều 113 BLLĐ).
- **Thời hạn báo trước:** Nghỉ 1–2 ngày cần báo trước ít nhất **03 ngày làm việc**; nghỉ > 2 ngày cần báo trước **07 ngày làm việc**.
- **Chấm công & Đi muộn:** Có 15 phút ân hạn mỗi ca làm việc. Quên chấm công được nộp giải trình tối đa 03 lần/tháng.
- **Làm thêm giờ (OT):** Tối đa 40 giờ/tháng và được tính hệ số lương làm thêm giờ theo quy định.

Bạn có muốn tôi soạn thảo đơn nghỉ phép hoặc giải trình chấm công nào ngay bây giờ không?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          citationKeys: ['LEAVE.ANNUAL_DAYS_PER_YEAR', 'LEAVE.NOTICE_DAYS', 'OT.MAX_HOURS_PER_MONTH'],
        };

        setMessages((prev) => [...prev, agentMsg]);
      }
    }, 1300);
  };

  // Xác nhận nộp đơn từ Action Card
  const handleConfirmSubmit = (cardId: string) => {
    let submittedTitle = '';
    const newReqId = `REQ-00${Math.floor(Math.random() * 900) + 100}`;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.actionCard && m.actionCard.id === cardId) {
          submittedTitle = m.actionCard.title;
          const updatedCard: ChatActionCard = {
            ...m.actionCard,
            status: 'submitted',
            submittedRequestId: newReqId,
          };

          // Tự động đẩy đơn mới vào Mock Store để hiển thị đồng bộ ở trang Requests
          const newRequestItem: RequestItem = {
            id: newReqId,
            employeeId: 'emp-001',
            employeeName: user?.fullName || 'Nguyễn Văn An',
            employeeCode: 'EMP001',
            departmentName: 'Phòng Công nghệ Thông tin',
            type: updatedCard.requestType,
            status: RequestStatus.Pending,
            payload: {
              reason: updatedCard.data.reason,
              daysCount: updatedCard.data.durationText.includes('ngày') ? 2 : 1,
              dates: updatedCard.data.dates,
            },
            aiRiskScore: updatedCard.riskLevel === 'LOW' ? 0.05 : 0.4,
            aiPolicyFindings: updatedCard.policyChecks.map((c) => c.description),
            approverId: 'mgr-001',
            approverName: 'Trần Thị Bích',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          addMockRequest(newRequestItem);

          return { ...m, actionCard: updatedCard };
        }
        return m;
      })
    );

    message.success(`Đã nộp thành công ${submittedTitle}! Mã yêu cầu: #${newReqId}`);

    // AI phản hồi thêm lời nhắn xác nhận
    setTimeout(() => {
      const followUpMsg: ChatMessage = {
        id: `agent-confirm-${Date.now()}`,
        sender: 'agent',
        text: `🎉 **Xác nhận thành công!** Đơn của bạn đã được ghi nhận với mã **#${newReqId}** và tự động chuyển đến Trưởng nhóm (**Trần Thị Bích**) xem xét. 

Do mức rủi ro được AI đánh giá là **LOW RISK**, nếu cài đặt của công ty ở mức *Auto Approve Low Risk*, đơn có thể được tự động duyệt nhanh chóng!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, followUpMsg]);
    }, 600);
  };

  // Mở modal sửa bản nháp
  const handleOpenEditModal = (card: ChatActionCard) => {
    setEditingCard(card);
    setEditReason(card.data.reason);
  };

  // Lưu sửa đổi bản nháp
  const handleSaveEdit = () => {
    if (!editingCard) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.actionCard && m.actionCard.id === editingCard.id) {
          return {
            ...m,
            actionCard: {
              ...m.actionCard,
              data: {
                ...m.actionCard.data,
                reason: editReason,
              },
            },
          };
        }
        return m;
      })
    );
    message.success('Đã cập nhật nội dung bản nháp!');
    setEditingCard(null);
  };

  // Làm mới phiên chat
  const handleResetChat = () => {
    setMessages([
      {
        id: 'welcome-new',
        sender: 'agent',
        text: `Đã bắt đầu phiên làm việc mới. Tôi là **Trợ lý HR AI**. Hãy cho tôi biết nhu cầu nghỉ phép, chấm công hoặc thắc mắc quy chế của bạn nhé!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        citationKeys: ['LEAVE.NOTICE_DAYS'],
      },
    ]);
    message.info('Đã làm mới cuộc hội thoại.');
  };

  const annualLeave = MOCK_LEAVE_BALANCE.balances.find((b) => b.leaveType === 'ANNUAL') || {
    totalDays: 12,
    availableDays: 10,
    usedDays: 2,
  };

  return (
    <div>
      {/* Tiêu đề & Giới thiệu */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Trợ lý Nhân sự AI (AI Copilot Chat)
          </Title>
          <Text type="secondary">
            Đối thoại thông minh, tra cứu quy chế RAG chính xác và tự động soạn thảo đơn xin nghỉ phép, chấm công.
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleResetChat}>
            Làm mới hội thoại
          </Button>
          <Button
            type="primary"
            icon={<FileDoneOutlined />}
            onClick={() => navigate('/requests')}
            style={{ background: '#059669', borderColor: '#059669' }}
          >
            Xem danh sách yêu cầu
          </Button>
        </Space>
      </div>

      <Row gutter={[20, 20]}>
        {/* ======================================================== */}
        {/* CỘT TRÁI: KHUNG TRÒ CHUYỆN TƯƠNG TÁC (CHÍNH)            */}
        {/* ======================================================== */}
        <Col xs={24} lg={16}>
          <Card
            style={{
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 640,
            }}
            bodyStyle={{
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              flex: 1,
            }}
          >
            {/* Thanh trạng thái Agent trên đỉnh hộp chat */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: 12,
                borderBottom: '1px solid #f1f5f9',
                marginBottom: 16,
              }}
            >
              <Space size={10}>
                <Badge status="processing" color="#10b981" />
                <Avatar
                  style={{ backgroundColor: '#059669' }}
                  icon={<RobotOutlined />}
                />
                <div>
                  <Text strong style={{ fontSize: 14, display: 'block' }}>
                    HR Copilot Agent
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Mô hình RAG tích hợp quy chế công ty 2026.10-draft
                  </Text>
                </div>
              </Space>
              <Tag color="green" icon={<SafetyCertificateOutlined />}>
                Autonomy: Suggest & Auto-Draft
              </Tag>
            </div>

            {/* VÙNG DANH SÁCH TIN NHẮN (Cuộn) */}
            <div
              style={{
                flex: 1,
                maxHeight: 460,
                overflowY: 'auto',
                paddingRight: 8,
              }}
            >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      maxWidth: msg.actionCard ? '92%' : '84%',
                      display: 'flex',
                      gap: 12,
                      flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row',
                    }}
                  >
                    <Avatar
                      style={{
                        backgroundColor: msg.sender === 'user' ? '#0f172a' : '#059669',
                        flexShrink: 0,
                      }}
                      icon={msg.sender === 'user' ? <UserOutlined /> : <RobotOutlined />}
                    />
                    <div style={{ flex: 1 }}>
                      {/* Bong bóng tin nhắn */}
                      <div
                        style={{
                          background: msg.sender === 'user' ? '#0f172a' : '#f8fafc',
                          color: msg.sender === 'user' ? '#ffffff' : '#1e293b',
                          border: msg.sender === 'user' ? 'none' : '1px solid #e2e8f0',
                          padding: '12px 16px',
                          borderRadius: 14,
                          fontSize: 14,
                          lineHeight: 1.65,
                          whiteSpace: 'pre-line',
                        }}
                      >
                        {msg.text}

                        {/* Thẻ trích dẫn quy chế RAG (Citations) */}
                        {msg.citationKeys && msg.citationKeys.length > 0 && (
                          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #cbd5e1' }}>
                            <Text style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
                              Căn cứ quy chế trích dẫn:
                            </Text>
                            <Space wrap size={4}>
                              {msg.citationKeys.map((key) => (
                                <Tag
                                  key={key}
                                  color="cyan"
                                  style={{ cursor: 'pointer', fontSize: 11, borderRadius: 4 }}
                                  onClick={() => setSelectedPolicyKey(key)}
                                >
                                  <BookOutlined style={{ marginRight: 3 }} /> {key}
                                </Tag>
                              ))}
                            </Space>
                          </div>
                        )}
                      </div>

                      {/* ======================================================== */}
                      {/* ACTION CARD TƯƠNG TÁC: BẢN NHÁP ĐƠN TRONG TIN NHẮN     */}
                      {/* ======================================================== */}
                      {msg.actionCard && (
                        <Card
                          style={{
                            marginTop: 12,
                            borderRadius: 12,
                            border:
                              msg.actionCard.status === 'submitted'
                                ? '1px solid #10b981'
                                : '1.5px solid #059669',
                            background:
                              msg.actionCard.status === 'submitted'
                                ? '#f0fdf4'
                                : '#ffffff',
                            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.08)',
                          }}
                          bodyStyle={{ padding: 16 }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 10,
                            }}
                          >
                            <Space>
                              <FileDoneOutlined style={{ color: '#059669', fontSize: 18 }} />
                              <Text strong style={{ fontSize: 15, color: '#064e3b' }}>
                                {msg.actionCard.title}
                              </Text>
                            </Space>
                            {msg.actionCard.status === 'draft' ? (
                              <Tag color="orange" style={{ fontWeight: 600 }}>
                                Bản nháp (Draft)
                              </Tag>
                            ) : (
                              <Tag color="success" icon={<CheckCircleOutlined />}>
                                Đã gửi duyệt (Submitted)
                              </Tag>
                            )}
                          </div>

                          {/* Chi tiết nội dung bản nháp */}
                          <div
                            style={{
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRadius: 8,
                              padding: '10px 14px',
                              marginBottom: 12,
                              fontSize: 13,
                            }}
                          >
                            <Row gutter={[12, 8]}>
                              <Col span={12}>
                                <Text type="secondary">Loại yêu cầu:</Text>
                                <div>
                                  <Tag color="blue">{msg.actionCard.data.typeName}</Tag>
                                </div>
                              </Col>
                              <Col span={12}>
                                <Text type="secondary">Thời gian:</Text>
                                <div>
                                  <strong>{msg.actionCard.data.dates}</strong> ({msg.actionCard.data.durationText})
                                </div>
                              </Col>
                              <Col span={24}>
                                <Text type="secondary">Lý do:</Text>
                                <div style={{ color: '#1e293b', fontStyle: 'italic', marginTop: 2 }}>
                                  "{msg.actionCard.data.reason}"
                                </div>
                              </Col>
                            </Row>
                          </div>

                          {/* Danh sách kết quả đối soát quy chế */}
                          <div style={{ marginBottom: 14 }}>
                            <Text strong style={{ fontSize: 12, color: '#334155' }}>
                              Kết quả đối soát tự động của AI:
                            </Text>
                            <div style={{ marginTop: 6 }}>
                              {msg.actionCard.policyChecks.map((check, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 6,
                                    fontSize: 12,
                                    color: check.passed ? '#059669' : '#dc2626',
                                    marginBottom: 4,
                                  }}
                                >
                                  <CheckOutlined style={{ marginTop: 2 }} />
                                  <span>{check.description}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Nút hành động */}
                          {msg.actionCard.status === 'draft' ? (
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                borderTop: '1px solid #f1f5f9',
                                paddingTop: 10,
                              }}
                            >
                              <Space>
                                <Button
                                  size="small"
                                  icon={<EditOutlined />}
                                  onClick={() => handleOpenEditModal(msg.actionCard!)}
                                >
                                  Sửa lý do
                                </Button>
                              </Space>
                              <Button
                                type="primary"
                                icon={<CheckCircleOutlined />}
                                onClick={() => handleConfirmSubmit(msg.actionCard!.id)}
                                style={{
                                  background: '#059669',
                                  borderColor: '#059669',
                                  fontWeight: 600,
                                }}
                              >
                                Xác nhận gửi duyệt ngay
                              </Button>
                            </div>
                          ) : (
                            <Alert
                              type="success"
                              showIcon
                              message={`Đã gửi phê duyệt - Mã đơn: #${msg.actionCard.submittedRequestId}`}
                              description="Yêu cầu đã được lưu vào hệ thống và gửi thông báo tới Trưởng nhóm."
                              action={
                                <Button
                                  size="small"
                                  type="link"
                                  onClick={() => navigate('/requests')}
                                  style={{ padding: 0 }}
                                >
                                  Xem danh sách yêu cầu →
                                </Button>
                              }
                            />
                          )}
                        </Card>
                      )}

                      {/* Thời gian gửi tin nhắn */}
                      <div
                        style={{
                          fontSize: 11,
                          color: '#94a3b8',
                          marginTop: 4,
                          textAlign: msg.sender === 'user' ? 'right' : 'left',
                        }}
                      >
                        {msg.timestamp}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* TRẠNG THÁI AI ĐANG SUY NGHĨ (Thinking Indicator) */}
              {isThinking && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                  <Avatar style={{ backgroundColor: '#059669' }} icon={<RobotOutlined />} />
                  <div
                    style={{
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      padding: '12px 16px',
                      borderRadius: 14,
                      minWidth: 260,
                    }}
                  >
                    <Space size={8}>
                      <LoadingOutlined style={{ color: '#059669', fontSize: 16 }} />
                      <Text strong style={{ color: '#064e3b', fontSize: 13 }}>
                        {thinkingStep || 'AI Copilot đang phân tích yêu cầu...'}
                      </Text>
                    </Space>
                    <div style={{ marginTop: 6, fontSize: 11, color: '#047857' }}>
                      Đang kết nối RAG & đối soát quy chế công ty...
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* ======================================================== */}
            {/* GỢI Ý CÂU HỎI NHANH (PROMPT SUGGESTIONS)                  */}
            {/* ======================================================== */}
            <div
              style={{
                paddingTop: 10,
                borderTop: '1px solid #f1f5f9',
                marginTop: 'auto',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Space size={4}>
                  <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
                    💡 Gợi ý nhanh:
                  </Text>
                  <Button
                    size="small"
                    type={activePromptCategory === 'leave' ? 'primary' : 'text'}
                    onClick={() => setActivePromptCategory('leave')}
                    style={{
                      fontSize: 11,
                      height: 22,
                      padding: '0 8px',
                      background: activePromptCategory === 'leave' ? '#059669' : undefined,
                    }}
                  >
                    🌴 Nghỉ phép
                  </Button>
                  <Button
                    size="small"
                    type={activePromptCategory === 'attendance' ? 'primary' : 'text'}
                    onClick={() => setActivePromptCategory('attendance')}
                    style={{
                      fontSize: 11,
                      height: 22,
                      padding: '0 8px',
                      background: activePromptCategory === 'attendance' ? '#059669' : undefined,
                    }}
                  >
                    ⏰ Chấm công & OT
                  </Button>
                  <Button
                    size="small"
                    type={activePromptCategory === 'policy' ? 'primary' : 'text'}
                    onClick={() => setActivePromptCategory('policy')}
                    style={{
                      fontSize: 11,
                      height: 22,
                      padding: '0 8px',
                      background: activePromptCategory === 'policy' ? '#059669' : undefined,
                    }}
                  >
                    📖 Quy chế
                  </Button>
                </Space>
              </div>

              {/* Các pill gợi ý bấm gửi ngay */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {PROMPTS[activePromptCategory].map((p, idx) => (
                  <Tag
                    key={idx}
                    color="default"
                    style={{
                      cursor: 'pointer',
                      borderRadius: 8,
                      padding: '4px 10px',
                      fontSize: 12,
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      transition: 'all 0.2s',
                    }}
                    onClick={() => handleSendMessage(p.query)}
                  >
                    <ThunderboltOutlined style={{ color: '#059669', marginRight: 4 }} />
                    {p.label}
                  </Tag>
                ))}
              </div>

              {/* Ô NHẬP LIỆU CHÍNH */}
              <div style={{ display: 'flex', gap: 8 }}>
                <Input.TextArea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Nhập yêu cầu xin nghỉ, giải trình chấm công hoặc câu hỏi quy chế... (Enter để gửi)"
                  autoSize={{ minRows: 1, maxRows: 3 }}
                  style={{
                    borderRadius: 8,
                    fontSize: 14,
                    padding: '8px 12px',
                  }}
                  disabled={isThinking}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={() => handleSendMessage()}
                  loading={isThinking}
                  style={{
                    height: 40,
                    width: 48,
                    background: '#059669',
                    borderColor: '#059669',
                    borderRadius: 8,
                  }}
                />
              </div>
            </div>
          </Card>
        </Col>

        {/* ======================================================== */}
        {/* CỘT PHẢI: BẢNG NGỮ CẢNH NHÂN SỰ & THƯ VIỆN QUY CHẾ      */}
        {/* ======================================================== */}
        <Col xs={24} lg={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* THẺ 1: HỒ SƠ & QUỸ PHÉP NHÂN VIÊN */}
            <Card
              title={
                <Space>
                  <CalendarOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 600 }}>Quỹ ngày phép của bạn</span>
                </Space>
              }
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text strong>Phép năm (Annual Leave)</Text>
                  <Text strong style={{ color: '#059669' }}>
                    {annualLeave.availableDays} / {annualLeave.totalDays} ngày
                  </Text>
                </div>
                <Progress
                  percent={Math.round((annualLeave.availableDays / annualLeave.totalDays) * 100)}
                  strokeColor="#059669"
                  showInfo={false}
                />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Đã sử dụng {annualLeave.usedDays} ngày • Còn lại {annualLeave.availableDays} ngày khả dụng
                </Text>
              </div>

              <Divider style={{ margin: '10px 0' }} />

              <Row gutter={[12, 10]} style={{ fontSize: 12 }}>
                <Col span={12}>
                  <Text type="secondary">Phép ốm đau:</Text>
                  <div><strong>5 / 5 ngày</strong></div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Giải trình tháng 10:</Text>
                  <div><Tag color="cyan">0 / 3 lần</Tag></div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Hạn ngạch OT tháng:</Text>
                  <div><strong>12 / 40 giờ</strong></div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Cấp quản lý duyệt:</Text>
                  <div><strong>Trần Thị Bích</strong></div>
                </Col>
              </Row>
            </Card>

            {/* THẺ 2: CÁC ĐIỀU KHOẢN QUY CHẾ ĐÃ DẪN NGUỒN */}
            <Card
              title={
                <Space>
                  <BookOutlined style={{ color: '#0d9488' }} />
                  <span style={{ fontWeight: 600 }}>Cơ sở tri thức (Policy RAG)</span>
                </Space>
              }
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              <div style={{ fontSize: 13, color: '#334155' }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  Bấm vào từng điều khoản để đọc toàn văn quy chế:
                </Text>
                {Object.entries(POLICY_LIBRARY).map(([key, item]) => (
                  <div
                    key={key}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: '8px 12px',
                      marginBottom: 8,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onClick={() => setSelectedPolicyKey(key)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong style={{ fontSize: 12, color: '#0f172a' }}>
                        {item.title}
                      </Text>
                      <ArrowRightOutlined style={{ fontSize: 11, color: '#94a3b8' }} />
                    </div>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                      {item.excerpt.slice(0, 75)}...
                    </Text>
                  </div>
                ))}
              </div>
            </Card>

            {/* THẺ 3: CAM KẾT AN TOÀN & TRÁCH NHIỆM AI */}
            <Card
              style={{
                borderRadius: 12,
                background: '#f8fafc',
                border: '1px dashed #cbd5e1',
              }}
              bodyStyle={{ padding: 14 }}
            >
              <Space align="start">
                <SafetyCertificateOutlined style={{ color: '#059669', fontSize: 18, marginTop: 2 }} />
                <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                  <Text strong style={{ display: 'block', color: '#0f172a' }}>
                    Cơ chế Human-in-the-loop:
                  </Text>
                  Mọi bản nháp AI tạo ra đều cần con người xác nhận trước khi gửi. Các yêu cầu rủi ro trung bình và cao đều được chuyển Quản lý duyệt.
                </div>
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>

      {/* ======================================================== */}
      {/* DRAWER XEM TOÀN VĂN QUY CHẾ NỘI BỘ (RAG INSPECTOR)      */}
      {/* ======================================================== */}
      <Drawer
        title={
          <Space>
            <BookOutlined style={{ color: '#059669' }} />
            <span>Chi tiết Quy chế Công ty</span>
          </Space>
        }
        placement="right"
        width={420}
        open={Boolean(selectedPolicyKey)}
        onClose={() => setSelectedPolicyKey(null)}
      >
        {selectedPolicyKey && POLICY_LIBRARY[selectedPolicyKey] && (
          <div>
            <Tag color="cyan" style={{ marginBottom: 12 }}>
              {selectedPolicyKey}
            </Tag>
            <Title level={4} style={{ marginTop: 0, color: '#0f172a' }}>
              {POLICY_LIBRARY[selectedPolicyKey].title}
            </Title>

            <Divider style={{ margin: '12px 0' }} />

            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', color: '#475569', marginBottom: 4 }}>
                Căn cứ pháp lý:
              </Text>
              <Tag color="blue">{POLICY_LIBRARY[selectedPolicyKey].baseLaw}</Tag>
            </div>

            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', color: '#475569', marginBottom: 6 }}>
                Nội dung quy định:
              </Text>
              <div
                style={{
                  background: '#f8fafc',
                  padding: 14,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: '#1e293b',
                }}
              >
                {POLICY_LIBRARY[selectedPolicyKey].excerpt}
              </div>
            </div>

            <div>
              <Text strong style={{ display: 'block', color: '#475569', marginBottom: 6 }}>
                Cơ chế tự chủ của AI Agent:
              </Text>
              <Alert
                type="info"
                showIcon
                message={POLICY_LIBRARY[selectedPolicyKey].autonomyRule}
                style={{ fontSize: 12 }}
              />
            </div>
          </div>
        )}
      </Drawer>

      {/* ======================================================== */}
      {/* MODAL SỬA LÝ DO BẢN NHÁP                                */}
      {/* ======================================================== */}
      <Modal
        title="Chỉnh sửa lý do yêu cầu"
        open={Boolean(editingCard)}
        onOk={handleSaveEdit}
        onCancel={() => setEditingCard(null)}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#059669', borderColor: '#059669' } }}
      >
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
            Nhập lý do chi tiết để Quản lý nắm thông tin rõ ràng:
          </Text>
          <Input.TextArea
            rows={4}
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            placeholder="Ví dụ: Giải quyết việc cá nhân gia đình tại quê nhà..."
          />
        </div>
      </Modal>
    </div>
  );
};

export default AgentChatPage;
