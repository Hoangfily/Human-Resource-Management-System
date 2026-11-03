import React, { useState, useRef, useEffect } from 'react';
import {
  Card,
  Input,
  Button,
  Space,
  Typography,
  Avatar,
  Tag,
  Row,
  Col,
  Tooltip,
  Spin,
  App as AntdApp,
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
  CalendarOutlined,
  SafetyCertificateOutlined,
  ExclamationCircleOutlined,
  CheckOutlined,
  ReloadOutlined,
  CopyOutlined,
  SwapOutlined,
  FileTextOutlined,
  LockOutlined,
  AuditOutlined,
} from '@ant-design/icons';
import { RequestType } from '@hr-agent/shared';
import { useAuth } from '../auth/AuthContext';
import apiClient from '../../lib/api-client';
import { formatPolicyName } from '../../lib/display-mappers';
import { RiskBadge } from '../../components/common';

const { Title, Text } = Typography;

export interface ChatActionCard {
  id: string;
  type: string;
  title: string;
  requestType: RequestType;
  data: {
    leaveType?: string;
    typeName: string;
    dates: string;
    durationText: string;
    daysCount?: number;
    reason: string;
  };
  // Body `payload` của POST /requests do AI soạn sẵn đúng định dạng API: gửi nguyên văn khi xác nhận
  payload?: Record<string, unknown>;
  policyChecks: {
    rule: string;
    passed: boolean;
    description: string;
  }[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence?: number;
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
  fallback?: boolean; // API trả lời dự phòng vì AI không phản hồi
}

const timeLabel = (iso?: string) =>
  (iso ? new Date(iso) : new Date()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

// Lỗi validation của API có thể là chuỗi hoặc mảng chuỗi
const apiErrorText = (err: any, fallback: string) => {
  const msg = err?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg || fallback;
};

// Helper phân giải văn bản Markdown đơn giản (in đậm, in nghiêng, danh sách gạch đầu dòng)
const parseItalic = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  const regex = /(\*|_)(.*?)\1/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(
      <em key={key++} style={{ fontStyle: 'italic', color: '#334155' }}>
        {match[2]}
      </em>,
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
};

const renderFormattedText = (text: string) => {
  if (!text) return null;

  const lines = text.split('\n');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={lineIdx} style={{ height: 6 }} />;
        }

        // Kiểm tra dòng có phải là bullet list hay không
        const isBullet = trimmed.startsWith('•') || trimmed.startsWith('- ') || trimmed.startsWith('* ');
        const cleanLine = isBullet ? trimmed.replace(/^[•\-\*]\s*/, '') : trimmed;

        // Phân tích bold **text**
        const parts: React.ReactNode[] = [];
        let remaining = cleanLine;
        let partKey = 0;

        while (remaining.length > 0) {
          const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)$/);
          if (boldMatch) {
            const [, before, boldText, after] = boldMatch;
            if (before) {
              parts.push(<span key={partKey++}>{parseItalic(before)}</span>);
            }
            parts.push(
              <strong key={partKey++} style={{ fontWeight: 700, color: '#064e3b' }}>
                {boldText}
              </strong>,
            );
            remaining = after;
            continue;
          }

          parts.push(<span key={partKey++}>{parseItalic(remaining)}</span>);
          break;
        }

        if (isBullet) {
          return (
            <div
              key={lineIdx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                paddingLeft: 4,
                lineHeight: 1.6,
              }}
            >
              <span
                style={{
                  color: '#059669',
                  fontSize: 14,
                  lineHeight: '22px',
                  userSelect: 'none',
                }}
              >
                ●
              </span>
              <div style={{ flex: 1 }}>{parts}</div>
            </div>
          );
        }

        return (
          <div key={lineIdx} style={{ lineHeight: 1.65 }}>
            {parts}
          </div>
        );
      })}
    </div>
  );
};

export const AgentChatPage: React.FC = () => {
  const { user } = useAuth();
  const { message } = AntdApp.useApp();

  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [submittingCardId, setSubmittingCardId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Danh sách tin nhắn khởi tạo
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-msg',
      sender: 'agent',
      text: `Xin chào **${user?.fullName || 'bạn'}**! 👋 Tôi là **Trợ lý HR Copilot**, sẵn sàng hỗ trợ bạn tra cứu quy chế công ty và tự động lập các loại đơn từ nhân sự.

Bạn có thể yêu cầu tôi bằng ngôn từ tự nhiên, ví dụ:
• *"Tôi muốn xin nghỉ phép 2 ngày tuần tới do việc gia đình"*
• *"Sáng nay tôi quên quẹt thẻ cửa trước, hãy làm đơn giải trình giúp tôi"*
• *"Tôi muốn đăng ký làm thêm giờ (OT) tối thứ 6 tuần này"*`,
      timestamp: timeLabel(),
      citationKeys: ['LEAVE.NOTICE_DAYS', 'LEAVE.ANNUAL_DAYS_PER_YEAR'],
    },
  ]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Bộ câu hỏi gợi ý nhanh chuẩn công sở
  const PROMPTS = [
    {
      icon: <CalendarOutlined style={{ color: '#059669', fontSize: 16 }} />,
      bg: '#ecfdf5',
      border: '#a7f3d0',
      tag: 'Nghỉ phép',
      label: 'Xin nghỉ phép 2 ngày tuần tới',
      desc: 'Nộp đơn nghỉ phép năm do việc gia đình',
      query: 'Tôi muốn xin nghỉ phép 2 ngày vào thứ 5 và thứ 6 tuần tới do có việc gia đình.',
    },
    {
      icon: <ClockCircleOutlined style={{ color: '#7c3aed', fontSize: 16 }} />,
      bg: '#f5f3ff',
      border: '#ddd6fe',
      tag: 'Chấm công',
      label: 'Giải trình quên quẹt thẻ sáng nay',
      desc: 'Tạo đơn giải trình quẹt thẻ vào lúc 08:30',
      query: 'Sáng nay tôi quên quẹt thẻ lúc 08:30 do cửa đông người, hãy giúp tôi làm đơn giải trình chấm công.',
    },
    {
      icon: <ThunderboltOutlined style={{ color: '#d97706', fontSize: 16 }} />,
      bg: '#fffbeb',
      border: '#fde68a',
      tag: 'Làm thêm giờ',
      label: 'Đăng ký OT tối Thứ Sáu',
      desc: 'Đăng ký làm thêm 3 tiếng (18:00 - 21:00)',
      query: 'Tôi muốn đăng ký làm thêm giờ (OT) tối thứ 6 tuần này từ 18:00 đến 21:00 để hoàn thiện dự án.',
    },
    {
      icon: <SwapOutlined style={{ color: '#2563eb', fontSize: 16 }} />,
      bg: '#eff6ff',
      border: '#bfdbfe',
      tag: 'Đổi ca',
      label: 'Đề xuất đổi ca làm việc',
      desc: 'Xin chuyển từ Ca Sáng sang Ca Chiều',
      query: 'Tôi có lịch khám sức khỏe buổi sáng, hãy giúp tôi tạo đề xuất đổi ca sang Ca Chiều vào ngày mai.',
    },
    {
      icon: <FileTextOutlined style={{ color: '#0284c7', fontSize: 16 }} />,
      bg: '#f0f9ff',
      border: '#bae6fd',
      tag: 'Tra cứu',
      label: 'Kiểm tra quỹ ngày phép còn lại',
      desc: 'Hỏi số ngày phép năm khả dụng trong năm 2026',
      query: 'Kiểm tra giúp tôi xem tôi hiện còn bao nhiêu ngày phép năm khả dụng trong năm 2026?',
    },
  ];

  // Gửi tin nhắn và gọi Backend AI API thật
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isThinking) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: timeLabel(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsThinking(true);

    try {
      const res: any = await apiClient.post('/agent/chat', { message: text, conversationId }, { timeout: 50000 });
      if (res.conversationId && !res.fallback) {
        setConversationId(res.conversationId);
      }

      const agentMessage: ChatMessage = {
        id: `agent-${Date.now()}`,
        sender: 'agent',
        text: res.reply || res.message || 'Tôi đã xử lý yêu cầu của bạn.',
        timestamp: timeLabel(res.timestamp),
        citationKeys: res.citationKeys,
        actionCard: res.actionCard ? { ...res.actionCard, status: 'draft' } : undefined,
        fallback: res.fallback === true,
      };

      setMessages((prev) => [...prev, agentMessage]);
    } catch (err: any) {
      message.error(apiErrorText(err, 'Không thể kết nối đến Trợ lý AI. Vui lòng thử lại sau.'));

      const errorMessage: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'agent',
        text: 'Xin lỗi bạn, kết nối đến hệ thống máy chủ AI đang bị gián đoạn. Bạn vui lòng thử lại sau giây lát.',
        timestamp: timeLabel(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsThinking(false);
    }
  };

  // Xác nhận nộp đơn từ Action Card vào CSDL PostgreSQL thật
  const handleConfirmSubmit = async (card: ChatActionCard) => {
    if (!card.payload) {
      message.error('Thẻ này chưa có đủ thông tin đơn, bạn vui lòng tạo đơn ở trang Đơn từ.');
      return;
    }
    setSubmittingCardId(card.id);
    try {
      const res: any = await apiClient.post('/requests', {
        type: card.requestType,
        payload: card.payload,
        idempotencyKey: `chat-card:${card.id}`,
      });

      const newRequestId: string = res.id;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.actionCard && m.actionCard.id === card.id) {
            return {
              ...m,
              actionCard: {
                ...m.actionCard,
                status: 'submitted',
                submittedRequestId: newRequestId,
              },
            };
          }
          return m;
        }),
      );

      message.success(`Đã tạo và gửi đơn thành công! Mã yêu cầu: #${newRequestId.slice(0, 8)}`);

      setTimeout(() => {
        const followUpMsg: ChatMessage = {
          id: `agent-confirm-${Date.now()}`,
          sender: 'agent',
          text: `🎉 **Đã gửi duyệt thành công!** Đơn **${card.title}** của bạn đã được ghi nhận với mã **#${newRequestId.slice(0, 8)}**.\n\nHệ thống sẽ tự động xét duyệt theo quy chế hoặc chuyển tiếp tới Quản lý trực tiếp xem xét. Bạn có thể theo dõi tiến độ bất kỳ lúc nào tại mục **Quản lý Đơn từ**.`,
          timestamp: timeLabel(),
        };
        setMessages((prev) => [...prev, followUpMsg]);
      }, 500);
    } catch (err: any) {
      message.error(apiErrorText(err, 'Không thể nộp đơn. Vui lòng thử lại.'));
    } finally {
      setSubmittingCardId(null);
    }
  };

  // Sao chép nội dung tin nhắn
  const handleCopyText = (content: string) => {
    navigator.clipboard.writeText(content);
    message.success('Đã sao chép nội dung vào khay nhớ tạm!');
  };

  return (
    <div>
      {/* Top Header thanh thoát & chuẩn thương hiệu */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 18,
          background: '#ffffff',
          padding: '16px 20px',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <Space align="center" size={14}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: 22,
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
            }}
          >
            <RobotOutlined />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Title level={4} style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>
                Trợ lý Nhân sự HR Copilot
              </Title>
              <Tag
                style={{
                  borderRadius: 20,
                  padding: '2px 10px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: '1px solid #a7f3d0',
                  background: '#ecfdf5',
                  color: '#065f46',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    display: 'inline-block',
                    boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.2)',
                  }}
                />
                Đang trực tuyến (OpenAI GPT-5.6)
              </Tag>
            </div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Hội thoại thông minh hỗ trợ giải đáp chế độ chính sách và tự động soạn thảo đơn từ nộp duyệt.
            </Text>
          </div>
        </Space>

        <Space>
          <Tooltip title="Xóa lịch sử hội thoại và bắt đầu phiên mới">
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setMessages([
                  {
                    id: 'welcome-msg',
                    sender: 'agent',
                    text: `Xin chào **${user?.fullName || 'bạn'}**! 👋 Tôi là **Trợ lý HR Copilot**, sẵn sàng hỗ trợ bạn tra cứu quy chế công ty và tự động lập các loại đơn từ nhân sự.

Bạn có thể yêu cầu tôi bằng ngôn từ tự nhiên, ví dụ:
• *"Tôi muốn xin nghỉ phép 2 ngày tuần tới do việc gia đình"*
• *"Sáng nay tôi quên quẹt thẻ cửa trước, hãy làm đơn giải trình giúp tôi"*
• *"Tôi muốn đăng ký làm thêm giờ (OT) tối thứ 6 tuần này"*`,
                    timestamp: timeLabel(),
                    citationKeys: ['LEAVE.NOTICE_DAYS', 'LEAVE.ANNUAL_DAYS_PER_YEAR'],
                  },
                ]);
                setConversationId(undefined);
                message.info('Đã làm mới phiên hội thoại với Trợ lý HR.');
              }}
              style={{ borderRadius: 8, fontWeight: 500 }}
            >
              Làm mới hội thoại
            </Button>
          </Tooltip>
        </Space>
      </div>

      <Row gutter={[20, 20]}>
        {/* Khung Chat chính */}
        <Col xs={24} lg={16}>
          <Card
            style={{
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              height: 'calc(100vh - 215px)',
              minHeight: 580,
            }}
            styles={{
              body: {
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
              },
            }}
          >
            {/* Vùng hiển thị tin nhắn cuộn */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8, marginBottom: 16 }}>
              {messages.map((m) => {
                const isUser = m.sender === 'user';
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      flexDirection: isUser ? 'row-reverse' : 'row',
                      gap: 12,
                      marginBottom: 20,
                    }}
                  >
                    <Avatar
                      style={{
                        backgroundColor: isUser ? '#0f172a' : '#059669',
                        boxShadow: isUser ? '0 2px 6px rgba(15, 23, 42, 0.25)' : '0 2px 8px rgba(5, 150, 105, 0.3)',
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                      icon={isUser ? <UserOutlined /> : <RobotOutlined />}
                    />

                    <div style={{ maxWidth: '82%' }}>
                      <div
                        style={{
                          background: isUser ? '#0f172a' : '#ffffff',
                          color: isUser ? '#ffffff' : '#0f172a',
                          padding: '14px 18px',
                          borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                          border: isUser ? 'none' : '1px solid #e2e8f0',
                          boxShadow: isUser
                            ? '0 3px 12px rgba(15, 23, 42, 0.15)'
                            : '0 2px 8px rgba(0, 0, 0, 0.04)',
                          lineHeight: 1.65,
                          fontSize: 14,
                        }}
                      >
                        {/* Văn bản tin nhắn hiển thị chuẩn Markdown */}
                        {isUser ? m.text : renderFormattedText(m.text)}

                        {m.fallback && (
                          <div style={{ marginTop: 8 }}>
                            <Tag color="warning" icon={<ExclamationCircleOutlined />} style={{ borderRadius: 6, fontSize: 11 }}>
                              Phản hồi dự phòng: Trợ lý AI tạm thời không trả lời
                            </Tag>
                          </div>
                        )}

                        {/* Thẻ trích dẫn quy chế công ty áp dụng */}
                        {m.citationKeys && m.citationKeys.length > 0 && !isUser && (
                          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                            <Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginBottom: 6, fontWeight: 600 }}>
                              Căn cứ quy chế công ty áp dụng:
                            </Text>
                            <Space wrap size={[6, 6]}>
                              {m.citationKeys.map((k) => (
                                <Tag
                                  key={k}
                                  icon={<BookOutlined style={{ color: '#059669' }} />}
                                  style={{
                                    borderRadius: 6,
                                    fontSize: 11.5,
                                    backgroundColor: '#f0fdf4',
                                    borderColor: '#bbf7d0',
                                    color: '#065f46',
                                    padding: '2px 8px',
                                  }}
                                >
                                  {formatPolicyName(k)}
                                </Tag>
                              ))}
                            </Space>
                          </div>
                        )}

                        {/* Thẻ hành động (Action Card dự thảo đơn từ) */}
                        {m.actionCard && (
                          <Card
                            size="small"
                            style={{
                              marginTop: 14,
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              borderTop: '3px solid #059669',
                              borderRadius: 12,
                              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <Space>
                                <FileDoneOutlined style={{ color: '#059669', fontSize: 18 }} />
                                <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
                                  {m.actionCard.title}
                                </span>
                              </Space>
                              <RiskBadge riskLevel={m.actionCard.riskLevel} />
                            </div>

                            <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 12 }}>
                              <Row gutter={[12, 8]}>
                                <Col span={12}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>Thời gian áp dụng:</Text>
                                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
                                    {m.actionCard.data.dates}
                                  </div>
                                </Col>
                                <Col span={12}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>Thời lượng / Khối lượng:</Text>
                                  <div style={{ fontWeight: 600, color: '#059669', fontSize: 13 }}>
                                    {m.actionCard.data.durationText}
                                  </div>
                                </Col>
                                <Col span={24}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>Lý do đề xuất:</Text>
                                  <div style={{ fontSize: 12.5, color: '#334155' }}>
                                    {m.actionCard.data.reason || '—'}
                                  </div>
                                </Col>
                              </Row>
                            </div>

                            {/* Checklist đối soát quy chế */}
                            <div style={{ marginBottom: 14 }}>
                              <Text strong style={{ fontSize: 12, color: '#334155', display: 'block', marginBottom: 6 }}>
                                Kết quả đối soát quy chế doanh nghiệp:
                              </Text>
                              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                                {m.actionCard.policyChecks.map((check, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      fontSize: 12,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      color: check.passed ? '#166534' : '#991b1b',
                                    }}
                                  >
                                    {check.passed ? (
                                      <CheckCircleOutlined style={{ color: '#10b981' }} />
                                    ) : (
                                      <ExclamationCircleOutlined style={{ color: '#ef4444' }} />
                                    )}
                                    <span>{check.description}</span>
                                  </div>
                                ))}
                              </Space>
                            </div>

                            {/* Nút nộp đơn */}
                            <div style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                              {m.actionCard.status === 'submitted' ? (
                                <Tag color="success" style={{ padding: '4px 12px', fontSize: 12, borderRadius: 6 }}>
                                  ✓ Đã nộp thành công (#{m.actionCard.submittedRequestId?.slice(0, 8)})
                                </Tag>
                              ) : (
                                <Button
                                  type="primary"
                                  icon={<CheckOutlined />}
                                  loading={submittingCardId === m.actionCard.id}
                                  onClick={() => handleConfirmSubmit(m.actionCard!)}
                                  style={{ background: '#059669', borderColor: '#059669', fontWeight: 600, borderRadius: 6 }}
                                >
                                  Xác nhận nộp đơn này ngay
                                </Button>
                              )}
                            </div>
                          </Card>
                        )}
                      </div>

                      {/* Footer tin nhắn: thời gian & nút sao chép */}
                      <div
                        style={{
                          fontSize: 11,
                          color: '#94a3b8',
                          marginTop: 4,
                          display: 'flex',
                          justifyContent: isUser ? 'flex-end' : 'space-between',
                          alignItems: 'center',
                          padding: '0 4px',
                        }}
                      >
                        {!isUser && (
                          <Tooltip title="Sao chép nội dung câu trả lời">
                            <Button
                              type="text"
                              size="small"
                              icon={<CopyOutlined />}
                              onClick={() => handleCopyText(m.text)}
                              style={{ fontSize: 11, color: '#94a3b8', padding: '0 4px', height: 20 }}
                            >
                              Sao chép
                            </Button>
                          </Tooltip>
                        )}
                        <span>{m.timestamp}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Chỉ báo AI đang suy nghĩ mượt mà */}
              {isThinking && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                  <Avatar style={{ backgroundColor: '#059669' }} icon={<RobotOutlined />} />
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      padding: '10px 16px',
                      borderRadius: '4px 16px 16px 16px',
                      fontSize: 13,
                      color: '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Spin size="small" />
                    <span>Trợ lý AI đang đối soát chính sách và chuẩn bị phản hồi...</span>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input Box gửi tin nhắn hiện đại */}
            <div
              style={{
                borderTop: '1px solid #f1f5f9',
                paddingTop: 12,
                background: '#ffffff',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-end',
                  background: '#f8fafc',
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
                }}
              >
                <Input.TextArea
                  rows={2}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Nhập yêu cầu xin nghỉ phép, giải trình công hoặc hỏi quy chế công ty (Nhấn Enter để gửi)..."
                  style={{
                    border: 'none',
                    background: 'transparent',
                    boxShadow: 'none',
                    resize: 'none',
                    padding: 0,
                    fontSize: 13.5,
                  }}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={isThinking}
                  onClick={() => handleSendMessage()}
                  style={{
                    height: 38,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 0,
                    borderRadius: 8,
                    padding: '0 18px',
                    fontWeight: 600,
                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                    flexShrink: 0,
                  }}
                >
                  Gửi
                </Button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: '0 4px' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  💡 Mẹo: Nhấn <strong>Enter</strong> để gửi nhanh, <strong>Shift + Enter</strong> để xuống dòng.
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Powered by OpenAI GPT-5.6 Multi-Agent Engine
                </Text>
              </div>
            </div>
          </Card>
        </Col>

        {/* Cột phải: Gợi ý câu hỏi nhanh & Giới thiệu tính năng */}
        <Col xs={24} lg={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Thẻ Gợi ý tác vụ nhanh */}
            <Card
              title={
                <Space>
                  <ThunderboltOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 700 }}>Gợi ý tác vụ nhanh</span>
                </Space>
              }
              style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)' }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={10}>
                {PROMPTS.map((p, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSendMessage(p.query)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#059669';
                      e.currentTarget.style.backgroundColor = '#f0fdf4';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.backgroundColor = '#ffffff';
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: p.bg,
                        border: `1px solid ${p.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {p.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{p.label}</span>
                        <Tag style={{ fontSize: 10, margin: 0, padding: '0 6px', borderRadius: 4 }}>{p.tag}</Tag>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </Space>
            </Card>

            {/* Thẻ Cam kết Bảo mật & Tuân thủ AI */}
            <Card
              title={
                <Space>
                  <SafetyCertificateOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 700 }}>Cam kết Bảo mật AI</span>
                </Space>
              }
              style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)' }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: '#ecfdf5',
                      color: '#059669',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <LockOutlined style={{ fontSize: 14 }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12.5, color: '#0f172a' }}>Bảo mật dữ liệu nội bộ</div>
                    <div style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
                      Dữ liệu hội thoại được mã hóa và bảo vệ khép kín trong mạng doanh nghiệp.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: '#eff6ff',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <AuditOutlined style={{ fontSize: 14 }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12.5, color: '#0f172a' }}>Đối soát quy chế tự động</div>
                    <div style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
                      AI đối soát theo thời gian thực với Bộ quy chuẩn chính sách công ty 2026.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: '#fef3c7',
                      color: '#d97706',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    <CheckCircleOutlined style={{ fontSize: 14 }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12.5, color: '#0f172a' }}>Kiểm soát 2 lớp (Human-in-the-loop)</div>
                    <div style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }}>
                      AI hỗ trợ lập dự thảo đơn, mọi quyết định phê duyệt đều do Quản lý phê chuẩn.
                    </div>
                  </div>
                </div>
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
};

export default AgentChatPage;
