import React, { useState, useEffect } from 'react';
import { Card, Typography, Calendar, Tag, Space, Button, Row, Col, Badge, Table, Modal, Form, Input, DatePicker, TimePicker, App as AntdApp } from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  AlertOutlined,
  HistoryOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';

const { Title, Text, Paragraph } = Typography;

export const AttendancePage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [checkedIn, setCheckedIn] = useState<boolean>(true);
  const [isExplainModalOpen, setIsExplainModalOpen] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleCheckInOut = () => {
    if (!checkedIn) {
      setCheckedIn(true);
      message.success(`Check-in thành công lúc ${currentTime}! Chúc bạn một ngày làm việc hiệu quả.`);
    } else {
      setCheckedIn(false);
      message.info(`Check-out thành công lúc ${currentTime}! Tạm biệt và hẹn gặp lại.`);
    }
  };

  const recentLogs = [
    { key: '1', date: '07/10/2026', in: '08:24', out: '—', status: 'IN_PROGRESS', location: 'Cửa chính Tầng 4' },
    { key: '2', date: '06/10/2026', in: '08:28', out: '17:35', status: 'ON_TIME', location: 'Cửa chính Tầng 4' },
    { key: '3', date: '05/10/2026', in: '08:20', out: '17:40', status: 'ON_TIME', location: 'Cửa chính Tầng 4' },
    { key: '4', date: '02/10/2026', in: '08:45', out: '17:30', status: 'LATE_EXPLAINED', location: 'Vân tay cửa trước' },
  ];

  const logColumns = [
    { title: 'Ngày', dataIndex: 'date', key: 'date', render: (t: string) => <Text strong>{t}</Text> },
    { title: 'Giờ vào', dataIndex: 'in', key: 'in', render: (t: string) => <Tag color="green">{t}</Tag> },
    { title: 'Giờ ra', dataIndex: 'out', key: 'out', render: (t: string) => (t !== '—' ? <Tag color="blue">{t}</Tag> : <Text type="secondary">—</Text>) },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => {
        if (s === 'IN_PROGRESS') return <Tag color="processing">Đang làm việc</Tag>;
        if (s === 'ON_TIME') return <Tag color="success">Đúng giờ</Tag>;
        return <Tag color="warning">Đã giải trình</Tag>;
      },
    },
  ];

  const dateCellRender = (value: Dayjs) => {
    const day = value.date();
    if (day === 2) {
      return <Badge status="warning" text="Quên quẹt thẻ (Đã duyệt)" />;
    }
    if (day === 15 || day === 16) {
      return <Badge status="processing" text="Dự kiến nghỉ phép" />;
    }
    if (value.day() !== 0 && value.day() !== 6 && day <= 7) {
      return <Badge status="success" text="08:24 - 17:35" />;
    }
    return null;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Quản lý Chấm công
          </Title>
          <Text type="secondary">Ghi nhận lượt ra vào thực tế, giờ công chuẩn và lịch sử giải trình công.</Text>
        </div>
        <Button icon={<PlusOutlined />} onClick={() => setIsExplainModalOpen(true)}>
          Giải trình công
        </Button>
      </div>

      {/* Top Banner Chấm công trực tiếp (Screen 4 trong thiết kế) */}
      <Card
        style={{
          marginBottom: 24,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: 14,
          border: 0,
          color: '#ffffff',
        }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={10}>
            <Text style={{ color: '#94a3b8', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Thời gian chấm công thực tế
            </Text>
            <div style={{ fontSize: 38, fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace', margin: '4px 0' }}>
              {currentTime || '08:34:12'}
            </div>
            <div style={{ color: '#cbd5e1', fontSize: 13 }}>
              Hôm nay: Thứ Tư, 07/10/2026 • Ca Sáng (08:30 - 17:30)
            </div>
          </Col>

          <Col xs={24} md={6} style={{ textAlign: 'center' }}>
            <Button
              type="primary"
              size="large"
              icon={checkedIn ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
              onClick={handleCheckInOut}
              style={{
                height: 52,
                padding: '0 32px',
                fontSize: 16,
                fontWeight: 600,
                borderRadius: 10,
                background: checkedIn ? '#ef4444' : '#10b981',
                borderColor: checkedIn ? '#ef4444' : '#10b981',
                boxShadow: checkedIn ? '0 4px 14px rgba(239, 68, 68, 0.4)' : '0 4px 14px rgba(16, 185, 129, 0.4)',
              }}
            >
              {checkedIn ? 'Check-out Giờ về' : 'Check-in Bắt đầu làm'}
            </Button>
            <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 8 }}>
              {checkedIn ? '● Đã check-in lúc 08:24 sáng' : 'Chưa ghi nhận lượt vào'}
            </div>
          </Col>

          <Col xs={24} md={8}>
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <div style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '10px 14px', borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>Công chuẩn tháng</div>
                  <div style={{ color: '#f8fafc', fontSize: 18, fontWeight: 600 }}>22 / 22 ngày</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '10px 14px', borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>Tăng ca (OT)</div>
                  <div style={{ color: '#34d399', fontSize: 18, fontWeight: 600 }}>+4.5 giờ</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '10px 14px', borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>Đi muộn / Về sớm</div>
                  <div style={{ color: '#f8fafc', fontSize: 18, fontWeight: 600 }}>0 lần</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '10px 14px', borderRadius: 8 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>Giải trình đã duyệt</div>
                  <div style={{ color: '#f8fafc', fontSize: 18, fontWeight: 600 }}>1 đơn</div>
                </div>
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      {/* Lưới Lịch Chấm công và Bảng nhật ký */}
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={16}>
          <Card
            title="Lịch chấm công chi tiết trong tháng"
            style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
          >
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <Tag color="success">● Đúng giờ (08:24 - 17:35)</Tag>
              <Tag color="warning">● Đi muộn / Quên quẹt thẻ</Tag>
              <Tag color="processing">● Nghỉ phép năm</Tag>
              <Tag color="default">● Cuối tuần / Lễ</Tag>
            </div>
            <Calendar cellRender={dateCellRender} />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <HistoryOutlined style={{ color: '#059669' }} />
                <span>Nhật ký quẹt thẻ gần nhất</span>
              </Space>
            }
            style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
          >
            <Table
              dataSource={recentLogs}
              columns={logColumns}
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>

      {/* Modal Giải trình công */}
      <Modal
        title="Đơn giải trình chấm công"
        open={isExplainModalOpen}
        onCancel={() => setIsExplainModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsExplainModalOpen(false)}>Hủy</Button>,
          <Button key="ok" type="primary" onClick={() => {
            message.success('Đã gửi đơn giải trình công lên Trưởng nhóm!');
            setIsExplainModalOpen(false);
          }}>
            Gửi giải trình
          </Button>
        ]}
      >
        <Form layout="vertical">
          <Form.Item label="Ngày cần giải trình" required>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Thời gian thực tế" required>
            <TimePicker.RangePicker style={{ width: '100%' }} format="HH:mm" />
          </Form.Item>
          <Form.Item label="Lý do chi tiết" required>
            <Input.TextArea rows={3} placeholder="Ví dụ: Máy chấm công không nhận diện khuôn mặt, đi công tác ngoài văn phòng..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AttendancePage;
