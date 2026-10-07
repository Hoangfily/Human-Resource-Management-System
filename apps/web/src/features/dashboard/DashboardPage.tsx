import React from 'react';
import { Card, Row, Col, Statistic, Typography, Button, Space, Table, Alert, Progress, Tag } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  RobotOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  ThunderboltOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { MOCK_LEAVE_BALANCE, MOCK_REQUESTS } from '../../lib/mock-data';
import { StatusTag } from '../../components/common';
import { RequestType } from '@hr-agent/shared';

const { Title, Text, Paragraph } = Typography;

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const annualLeave = MOCK_LEAVE_BALANCE.balances.find((b) => b.leaveType === 'ANNUAL');
  const sickLeave = MOCK_LEAVE_BALANCE.balances.find((b) => b.leaveType === 'SICK');
  const pendingRequests = MOCK_REQUESTS.filter((r) => r.status === 'PENDING');

  const columns = [
    {
      title: 'Mã đơn',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => <Text code style={{ color: '#0f766e', fontWeight: 600 }}>{id}</Text>,
    },
    {
      title: 'Loại yêu cầu',
      dataIndex: 'type',
      key: 'type',
      render: (type: RequestType) => {
        const labels: Record<string, string> = {
          [RequestType.Leave]: 'Nghỉ phép',
          [RequestType.AttendanceExplanation]: 'Bổ sung chấm công',
          [RequestType.ShiftChange]: 'Đổi ca làm việc',
        };
        return <Tag color="cyan" style={{ borderRadius: 6 }}>{labels[type] || type}</Tag>;
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <StatusTag status={status} />,
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (d: string) => new Date(d).toLocaleDateString('vi-VN'),
    },
  ];

  return (
    <div>
      {/* Top Emerald Banner từ bản thiết kế */}
      <Card
        style={{
          marginBottom: 24,
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 60%, #0f766e 100%)',
          borderRadius: 14,
          border: 0,
          boxShadow: '0 4px 15px rgba(6, 78, 59, 0.25)',
        }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={16}>
            <Title level={3} style={{ color: '#ffffff', margin: 0, letterSpacing: '0.3px' }}>
              Chào buổi sáng, {user?.fullName}! 👋
            </Title>
            <Paragraph style={{ color: 'rgba(255, 255, 255, 0.88)', margin: '6px 0 0', fontSize: 14 }}>
              Hôm nay là Thứ Tư, 07/10/2026 • {user?.departmentName} ({user?.positionName})
            </Paragraph>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: 'right' }}>
            <Space wrap>
              <Button
                type="default"
                icon={<ClockCircleOutlined />}
                onClick={() => navigate('/attendance')}
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  color: '#ffffff',
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                  fontWeight: 500,
                  backdropFilter: 'blur(4px)',
                }}
              >
                Chấm công ngay
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/requests')}
                style={{
                  background: '#ffffff',
                  color: '#065f46',
                  borderColor: '#ffffff',
                  fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                }}
              >
                Tạo yêu cầu mới
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 4 Thẻ KPI thống kê */}
      <Row gutter={[18, 18]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable style={{ border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>Phép năm còn lại</Text>
              <CalendarOutlined style={{ color: '#059669', fontSize: 18 }} />
            </div>
            <div style={{ margin: '10px 0 6px' }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: '#065f46' }}>
                {annualLeave?.availableDays ?? 10}
              </span>
              <span style={{ fontSize: 14, color: '#64748b', marginLeft: 4 }}>
                / {annualLeave?.totalDays ?? 12} ngày
              </span>
            </div>
            <Progress
              percent={Math.round(((annualLeave?.availableDays ?? 10) / (annualLeave?.totalDays ?? 12)) * 100)}
              strokeColor="#059669"
              showInfo={false}
              size="small"
            />
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              Đã dùng: {annualLeave?.usedDays ?? 2} ngày
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card hoverable style={{ border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>Phép ốm (Hưởng BHXH)</Text>
              <CheckCircleOutlined style={{ color: '#10b981', fontSize: 18 }} />
            </div>
            <div style={{ margin: '10px 0 6px' }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: '#10b981' }}>
                {sickLeave?.availableDays ?? 5}
              </span>
              <span style={{ fontSize: 14, color: '#64748b', marginLeft: 4 }}>
                / {sickLeave?.totalDays ?? 5} ngày
              </span>
            </div>
            <Progress percent={100} strokeColor="#10b981" showInfo={false} size="small" />
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              Chưa sử dụng ngày nào
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card hoverable style={{ border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>Đơn đang chờ duyệt</Text>
              <CheckSquareOutlined style={{ color: '#f59e0b', fontSize: 18 }} />
            </div>
            <div style={{ margin: '10px 0 6px' }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: '#f59e0b' }}>
                {pendingRequests.length}
              </span>
              <span style={{ fontSize: 14, color: '#64748b', marginLeft: 4 }}>yêu cầu</span>
            </div>
            <Progress percent={50} strokeColor="#f59e0b" showInfo={false} size="small" />
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              Đang đợi Trưởng nhóm xét duyệt
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card hoverable style={{ border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>Ca làm việc hôm nay</Text>
              <ClockCircleOutlined style={{ color: '#0d9488', fontSize: 18 }} />
            </div>
            <div style={{ margin: '10px 0 6px' }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#0f766e' }}>
                Ca Sáng
              </span>
            </div>
            <Tag color="success" style={{ margin: '4px 0 0' }}>08:30 - 17:30 (Đúng giờ)</Tag>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              Văn phòng chính (Tầng 4)
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Nội dung chính: Bảng yêu cầu bên trái & Thẻ trợ lý bên phải */}
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={15}>
          <Card
            title={
              <Space>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>Yêu cầu & Đơn từ gần đây</span>
              </Space>
            }
            extra={
              <Button type="link" onClick={() => navigate('/requests')} style={{ color: '#059669', padding: 0 }}>
                Xem tất cả <ArrowRightOutlined />
              </Button>
            }
            style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
          >
            <Table
              dataSource={MOCK_REQUESTS.slice(0, 4)}
              columns={columns}
              rowKey="id"
              pagination={false}
              size="middle"
            />
          </Card>
        </Col>

        <Col xs={24} lg={9}>
          <Card
            title={
              <Space>
                <RobotOutlined style={{ color: '#059669' }} />
                <span style={{ fontWeight: 600, color: '#0f172a' }}>Trợ lý HR AI & Lời nhắc</span>
              </Space>
            }
            style={{ borderRadius: 12, border: '1px solid #e2e8f0', height: '100%' }}
          >
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined style={{ color: '#059669' }} />}
              message="Chấm công hôm nay hợp lệ"
              description="Bạn đã ghi nhận lượt quẹt thẻ lúc 08:24 sáng nay (sớm 6 phút trước giờ quy chuẩn)."
              style={{
                marginBottom: 16,
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 8,
              }}
            />

            <Alert
              type="info"
              showIcon
              icon={<ThunderboltOutlined style={{ color: '#0d9488' }} />}
              message="Chính sách nghỉ lễ & Chuyển phép"
              description="Quy chế công ty: Đơn xin nghỉ từ 3 ngày trở lên cần nộp trước tối thiểu 5 ngày làm việc."
              style={{
                marginBottom: 20,
                background: '#f0fdfa',
                border: '1px solid #99f6e4',
                borderRadius: 8,
              }}
            />

            <div
              style={{
                background: '#f8fafc',
                padding: '16px',
                borderRadius: 10,
                border: '1px dashed #cbd5e1',
                textAlign: 'center',
              }}
            >
              <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                Cần hỗ trợ tạo đơn hoặc tra cứu chính sách?
              </div>
              <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
                Trợ lý AI có thể tự động điền đơn nháp và kiểm tra số dư phép cho bạn.
              </Text>
              <Button
                type="primary"
                icon={<RobotOutlined />}
                onClick={() => navigate('/agent-chat')}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 0,
                  boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                }}
              >
                Mở cuộc hội thoại với AI
              </Button>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
