import React, { useState } from 'react';
import { Card, Input, Button, Space, Typography, Avatar, Tag, Alert, Divider, App as AntdApp, Row, Col } from 'antd';
import {
  RobotOutlined,
  UserOutlined,
  SendOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  FileDoneOutlined,
  BookOutlined,
} from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';

const { Title, Text, Paragraph } = Typography;

interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
  draftAction?: {
    type: string;
    dates: string;
    daysCount: number;
    reason: string;
    policyNote: string;
  };
}

export const AgentChatPage: React.FC = () => {
  const { user } = useAuth();
  const { message } = AntdApp.useApp();
  const [inputText, setInputText] = useState('');
  const [latestDraft, setLatestDraft] = useState<{
    type: string;
    dates: string;
    daysCount: number;
    reason: string;
    policyNote: string;
  } | null>({
    type: 'Nghỉ phép năm (ANNUAL)',
    dates: '15/10/2026 - 16/10/2026',
    daysCount: 2,
    reason: 'Giải quyết việc gia đình',
    policyNote: 'Hợp lệ theo quy định thông báo trước ít nhất 3 ngày làm việc (Điều 4.2).',
  });

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      sender: 'agent',
      text: `Xin chào ${user?.fullName || 'bạn'}! Tôi là Trợ lý HR AI. Tôi có thể hỗ trợ bạn tra cứu chính sách công ty (phép năm, chế độ làm việc) hoặc tự động soạn thảo đơn xin nghỉ phép, giải trình chấm công. Bạn cần hỗ trợ gì hôm nay?`,
      timestamp: '10:00',
    },
  ]);

  const handleSend = () => {
    if (!inputText.trim()) return;

    const userMsg: ChatMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: inputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');

    setTimeout(() => {
      const isLeaveIntent = userMsg.text.toLowerCase().includes('nghỉ') || userMsg.text.toLowerCase().includes('phép');

      if (isLeaveIntent) {
        const draft = {
          type: 'Nghỉ phép năm (ANNUAL)',
          dates: '15/10/2026 - 16/10/2026',
          daysCount: 2,
          reason: userMsg.text,
          policyNote: 'Hợp lệ theo quy định thông báo trước ít nhất 3 ngày làm việc (Điều 4.2).',
        };
        setLatestDraft(draft);

        const agentReply: ChatMessage = {
          id: String(Date.now() + 1),
          sender: 'agent',
          text: `Dựa trên yêu cầu của bạn, tôi đã kiểm tra: Bạn hiện còn 10 ngày phép năm và đơn này gửi trước 5 ngày, hoàn toàn phù hợp với Quy chế HR (Điều 4.2). Tôi đã tạo sẵn bản nháp đơn nghỉ phép ở bảng bên phải để bạn duyệt:`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          draftAction: draft,
        };
        setMessages((prev) => [...prev, agentReply]);
      } else {
        const agentReply: ChatMessage = {
          id: String(Date.now() + 1),
          sender: 'agent',
          text: `Theo chính sách nhân sự công ty: Giờ làm việc tiêu chuẩn là 08:30 - 17:30 (Thứ 2 - Thứ 6). Mỗi nhân viên chính thức có 12 ngày phép năm và được chuyển tối đa 5 ngày sang năm tiếp theo.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, agentReply]);
      }
    }, 600);
  };

  const handleConfirmDraft = () => {
    message.success('Đã gửi bản nháp đơn lên Trưởng nhóm phê duyệt thành công!');
    setLatestDraft(null);
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Trợ lý Nhân sự AI (HR Assistant)
        </Title>
        <Text type="secondary">
          Tra cứu quy chế công ty với RAG & tạo bản nháp đơn từ tự động qua hội thoại thông minh.
        </Text>
      </div>

      {/* 2-Column Chat Layout (Screen 2 trong thiết kế) */}
      <Row gutter={[20, 20]}>
        {/* Cột trái: Khung hội thoại */}
        <Col xs={24} lg={15}>
          <Card
            style={{
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              minHeight: 560,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Danh sách tin nhắn */}
            <div style={{ flex: 1, maxHeight: 420, overflowY: 'auto', paddingRight: 8 }}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      maxWidth: '82%',
                      display: 'flex',
                      gap: 10,
                      flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row',
                    }}
                  >
                    <Avatar
                      style={{ backgroundColor: msg.sender === 'user' ? '#0f172a' : '#059669' }}
                      icon={msg.sender === 'user' ? <UserOutlined /> : <RobotOutlined />}
                    />
                    <div>
                      <div
                        style={{
                          background: msg.sender === 'user' ? '#0f172a' : '#f1f5f9',
                          color: msg.sender === 'user' ? '#ffffff' : '#0f172a',
                          padding: '12px 16px',
                          borderRadius: 12,
                          fontSize: 14,
                          lineHeight: 1.6,
                        }}
                      >
                        {msg.text}
                      </div>
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
            </div>

            {/* Gợi ý câu hỏi nhanh */}
            <div style={{ marginTop: 12, marginBottom: 12 }}>
              <Space wrap size={6}>
                <Text type="secondary" style={{ fontSize: 12 }}>Gợi ý:</Text>
                <Tag
                  style={{ cursor: 'pointer', borderRadius: 6 }}
                  color="emerald"
                  onClick={() => setInputText('Tôi muốn xin nghỉ phép ngày 15/10 và 16/10 do việc gia đình')}
                >
                  <ThunderboltOutlined /> Xin nghỉ phép 2 ngày
                </Tag>
                <Tag
                  style={{ cursor: 'pointer', borderRadius: 6 }}
                  onClick={() => setInputText('Quy chế chuyển ngày phép sang năm sau được bao nhiêu ngày?')}
                >
                  Hỏi chuyển phép
                </Tag>
                <Tag
                  style={{ cursor: 'pointer', borderRadius: 6 }}
                  onClick={() => setInputText('Sáng nay tôi quên quẹt thẻ cửa trước, hướng dẫn tôi làm đơn')}
                >
                  Giải trình quên chấm công
                </Tag>
              </Space>
            </div>

            {/* Ô nhập tin nhắn */}
            <div style={{ display: 'flex', gap: 10 }}>
              <Input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onPressEnter={handleSend}
                placeholder="Nhập yêu cầu hoặc câu hỏi về quy định nhân sự..."
                size="large"
                style={{ borderRadius: 8 }}
              />
              <Button
                type="primary"
                size="large"
                icon={<SendOutlined />}
                onClick={handleSend}
                style={{ background: '#059669', borderColor: '#059669', borderRadius: 8 }}
              >
                Gửi
              </Button>
            </div>
          </Card>
        </Col>

        {/* Cột phải: Ngữ cảnh đơn & Trích dẫn chính sách (Screen 2 Right Panel) */}
        <Col xs={24} lg={9}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Bản nháp đơn tự động tạo */}
            <Card
              title={
                <Space>
                  <FileDoneOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 600 }}>Bản nháp yêu cầu (Draft)</span>
                </Space>
              }
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              {latestDraft ? (
                <div>
                  <Alert
                    type="success"
                    showIcon
                    message="AI đã tạo bản nháp hợp lệ"
                    description="Các trường thông tin đã được tự động điền dựa trên đoạn hội thoại của bạn."
                    style={{ marginBottom: 14 }}
                  />
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 14 }}>
                    <div style={{ marginBottom: 6 }}>
                      <Text type="secondary">Loại yêu cầu:</Text> <Tag color="cyan">{latestDraft.type}</Tag>
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <Text type="secondary">Thời gian:</Text> <strong>{latestDraft.dates}</strong> ({latestDraft.daysCount} ngày)
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <Text type="secondary">Lý do:</Text> <span>{latestDraft.reason}</span>
                    </div>
                    <div style={{ color: '#059669', fontSize: 12 }}>
                      ✓ {latestDraft.policyNote}
                    </div>
                  </div>
                  <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                    <Button size="small" onClick={() => setLatestDraft(null)}>Hủy bỏ</Button>
                    <Button
                      type="primary"
                      size="small"
                      icon={<CheckCircleOutlined />}
                      onClick={handleConfirmDraft}
                      style={{ background: '#059669', borderColor: '#059669' }}
                    >
                      Gửi duyệt ngay
                    </Button>
                  </Space>
                </div>
              ) : (
                <Text type="secondary" style={{ display: 'block', textAlign: 'center', padding: '24px 0' }}>
                  Chưa có bản nháp nào được tạo. Hãy chat yêu cầu của bạn ở khung bên trái.
                </Text>
              )}
            </Card>

            {/* Trích dẫn điều khoản chính sách RAG */}
            <Card
              title={
                <Space>
                  <BookOutlined style={{ color: '#0d9488' }} />
                  <span style={{ fontWeight: 600 }}>Cơ sở tri thức (Policy RAG)</span>
                </Space>
              }
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                <p style={{ margin: '0 0 8px' }}>
                  <strong>Quy chế HR - Điều 4.2:</strong> Thời gian nộp đơn nghỉ phép năm phải trước ít nhất 03 ngày làm việc đối với kỳ nghỉ từ 01 - 03 ngày.
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Quy chế HR - Điều 7.1:</strong> Quên chấm công vào/ra được giải trình tối đa 02 lần/tháng kèm xác nhận của Quản lý trực tiếp.
                </p>
              </div>
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
};

export default AgentChatPage;
