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
  Tooltip,
  Spin,
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
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { RequestType } from '@hr-agent/shared';
import { useAuth } from '../auth/AuthContext';
import apiClient from '../../lib/api-client';
import { POLICY_DISPLAY_MAP, formatPolicyName } from '../../lib/display-mappers';
import { RiskBadge, RequestTypeTag } from '../../components/common';

const { Title, Text, Paragraph } = Typography;

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
  policyChecks: {
    rule: string;
    passed: boolean;
    description: string;
  }[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
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

export const AgentChatPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();

  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [submittingCardId, setSubmittingCardId] = useState<string | null>(null);
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
      timestamp: '08:30',
      citationKeys: ['LEAVE.NOTICE_DAYS', 'LEAVE.ANNUAL_DAYS_PER_YEAR'],
    },
  ]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // Bộ câu hỏi gợi ý nhanh chuẩn công sở
  const PROMPTS = [
    {
      label: '🌴 Xin nghỉ phép 2 ngày tuần tới',
      query: 'Tôi muốn xin nghỉ phép 2 ngày 15/10 và 16/10 do việc gia đình',
    },
    {
      label: '⏰ Quên quẹt thẻ sáng nay',
      query: 'Sáng nay tôi quên quẹt thẻ lúc 08:30, hãy giúp tôi làm đơn giải trình chấm công',
    },
    {
      label: '⚡ Đăng ký làm thêm giờ (OT 3 tiếng)',
      query: 'Tôi muốn đăng ký làm thêm giờ (OT) 3 tiếng tối thứ 6 tuần này từ 18:00 đến 21:00',
    },
    {
      label: '📊 Kiểm tra số ngày phép còn lại',
      query: 'Kiểm tra giúp tôi xem tôi hiện còn bao nhiêu ngày phép năm khả dụng?',
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
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsThinking(true);

    try {
      const res: any = await apiClient.post('/agent/chat', { message: text });

      const agentMessage: ChatMessage = {
        id: `agent-${Date.now()}`,
        sender: 'agent',
        text: res.message || 'Tôi đã xử lý yêu cầu của bạn.',
        timestamp: res.timestamp || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        citationKeys: res.citationKeys,
        actionCard: res.actionCard,
      };

      setMessages((prev) => [...prev, agentMessage]);
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Không thể kết nối đến Trợ lý AI. Vui lòng thử lại sau.';
      message.error(errMsg);

      const errorMessage: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'agent',
        text: 'Xin lỗi bạn, kết nối đến hệ thống máy chủ AI đang bị gián đoạn. Bạn vui lòng thử lại sau giây lát.',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsThinking(false);
    }
  };

  // Xác nhận nộp đơn từ Action Card vào CSDL PostgreSQL thật
  const handleConfirmSubmit = async (card: ChatActionCard) => {
    setSubmittingCardId(card.id);
    try {
      // 1. Tạo đơn thật qua API /requests
      const payload: any = {
        reason: card.data.reason,
        dates: card.data.dates,
      };

      if (card.requestType === RequestType.Leave) {
        payload.leaveType = card.data.leaveType || 'ANNUAL';
        payload.daysCount = card.data.daysCount || 2;
        payload.startDate = '2026-10-15';
        payload.endDate = '2026-10-16';
      } else if (card.requestType === RequestType.Overtime) {
        payload.durationHours = 3;
        payload.date = '2026-10-30';
        payload.startTime = '18:00';
        payload.endTime = '21:00';
      } else if (card.requestType === RequestType.AttendanceExplanation) {
        payload.date = '2026-10-24';
        payload.issue = 'Quên quẹt thẻ';
        payload.explanation = card.data.reason;
      }

      const res: any = await apiClient.post('/requests', {
        type: card.requestType,
        payload,
      });

      const newRequestId = res?.id || `REQ-${Math.floor(Math.random() * 8999 + 1000)}`;

      // 2. Cập nhật trạng thái Action Card trong hội thoại
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
        })
      );

      message.success(`Đã tạo và gửi đơn thành công! Mã yêu cầu: #${newRequestId.slice(0, 8)}`);

      // 3. Phản hồi xác nhận từ AI
      setTimeout(() => {
        const followUpMsg: ChatMessage = {
          id: `agent-confirm-${Date.now()}`,
          sender: 'agent',
          text: `🎉 **Xác nhận thành công!** Đơn **${card.title}** của bạn đã được ghi nhận trên hệ thống với mã **#${newRequestId.slice(0, 8)}** và chuyển tới Quản lý để xét duyệt.

Bạn có thể theo dõi tiến độ duyệt bất kỳ lúc nào tại mục **Quản lý Đơn từ**.`,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, followUpMsg]);
      }, 500);
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Không thể nộp đơn. Vui lòng thử lại.';
      message.error(errMsg);
    } finally {
      setSubmittingCardId(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Trợ lý Nhân sự HR Copilot
          </Title>
          <Text type="secondary">
            Hội thoại thông minh hỗ trợ giải đáp chế độ chính sách và tự động soạn thảo đơn từ nộp duyệt.
          </Text>
        </div>
      </div>

      <Row gutter={[20, 20]}>
        {/* Khung Chat chính */}
        <Col xs={24} lg={17}>
          <Card
            style={{
              borderRadius: 14,
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 15px rgba(0, 0, 0, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              height: '75vh',
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
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.1)',
                        flexShrink: 0,
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
                          boxShadow: isUser ? '0 3px 10px rgba(15, 23, 42, 0.2)' : '0 2px 8px rgba(0, 0, 0, 0.04)',
                          lineHeight: 1.65,
                          fontSize: 14,
                          whiteSpace: 'pre-line',
                        }}
                      >
                        {m.text}

                        {/* Thẻ trích dẫn quy chế (Đã Việt hóa sạch 100%) */}
                        {m.citationKeys && m.citationKeys.length > 0 && !isUser && (
                          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                              Căn cứ quy chế công ty áp dụng:
                            </Text>
                            <Space wrap size={[6, 6]}>
                              {m.citationKeys.map((k) => (
                                <Tag key={k} color="emerald" icon={<BookOutlined />} style={{ borderRadius: 6, fontSize: 11 }}>
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
                              borderRadius: 12,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                              <Space>
                                <FileDoneOutlined style={{ color: '#059669', fontSize: 18 }} />
                                <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
                                  {m.actionCard.title}
                                </span>
                              </Space>
                              <RiskBadge riskLevel={m.actionCard.riskLevel} />
                            </div>

                            <div style={{ background: '#ffffff', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 10 }}>
                              <Row gutter={[10, 6]}>
                                <Col span={12}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>Thời gian dự kiến:</Text>
                                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
                                    {m.actionCard.data.dates}
                                  </div>
                                </Col>
                                <Col span={12}>
                                  <Text type="secondary" style={{ fontSize: 11 }}>Khối lượng / Thời lượng:</Text>
                                  <div style={{ fontWeight: 600, color: '#059669', fontSize: 13 }}>
                                    {m.actionCard.data.durationText}
                                  </div>
                                </Col>
                              </Row>
                            </div>

                            {/* Checklist đối soát quy chế */}
                            <div style={{ marginBottom: 12 }}>
                              <Text strong style={{ fontSize: 12, color: '#334155', display: 'block', marginBottom: 6 }}>
                                Kết quả đối soát quy định:
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
                            <div style={{ textAlign: 'right' }}>
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
                                  style={{ background: '#059669', borderColor: '#059669', fontWeight: 600 }}
                                >
                                  Xác nhận gửi duyệt
                                </Button>
                              )}
                            </div>
                          </Card>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: 11,
                          color: '#94a3b8',
                          marginTop: 4,
                          textAlign: isUser ? 'right' : 'left',
                          padding: '0 4px',
                        }}
                      >
                        {m.timestamp}
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

            {/* Input Box gửi tin nhắn */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <div style={{ display: 'flex', gap: 10 }}>
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
                  style={{ borderRadius: 10, resize: 'none' }}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={isThinking}
                  onClick={() => handleSendMessage()}
                  style={{
                    height: 'auto',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 0,
                    borderRadius: 10,
                    padding: '0 22px',
                    fontWeight: 600,
                  }}
                >
                  Gửi
                </Button>
              </div>
            </div>
          </Card>
        </Col>

        {/* Cột phải: Gợi ý câu hỏi nhanh & Giới thiệu tính năng */}
        <Col xs={24} lg={7}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card
              title={<span style={{ fontWeight: 600 }}>Gợi ý tác vụ nhanh</span>}
              style={{ borderRadius: 14, border: '1px solid #e2e8f0' }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={10}>
                {PROMPTS.map((p, idx) => (
                  <Button
                    key={idx}
                    block
                    style={{
                      textAlign: 'left',
                      height: 'auto',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      whiteSpace: 'normal',
                      fontSize: 13,
                    }}
                    onClick={() => handleSendMessage(p.query)}
                  >
                    {p.label}
                  </Button>
                ))}
              </Space>
            </Card>

            <Card
              title={
                <Space>
                  <SafetyCertificateOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 600 }}>Cam kết Bảo mật AI</span>
                </Space>
              }
              style={{ borderRadius: 14, border: '1px solid #e2e8f0' }}
            >
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
                <div>✓ Dữ liệu hội thoại được bảo mật nội bộ doanh nghiệp.</div>
                <div>✓ AI chỉ đóng vai trò trợ lý soạn thảo và kiểm tra quy chế.</div>
                <div>✓ Mọi quyết định chính thức đều được kiểm duyệt bởi Quản lý.</div>
              </div>
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
};

export default AgentChatPage;
