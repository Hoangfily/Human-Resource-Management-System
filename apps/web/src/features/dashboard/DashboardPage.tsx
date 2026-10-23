import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Typography, Button, Space, Table, Alert, Progress, Tag } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  RobotOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  ThunderboltOutlined,
  ArrowRightOutlined,
  FileDoneOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { MOCK_LEAVE_BALANCE, MOCK_REQUESTS } from '../../lib/mock-data';
import { StatusTag, RequestTypeTag, RiskBadge, EmptyState } from '../../components/common';
import { RequestType } from '@hr-agent/shared';
import apiClient from '../../lib/api-client';
import { LeaveBalanceResponse, RequestItem } from '../../types';

const { Title, Text, Paragraph } = Typography;

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceResponse>(MOCK_LEAVE_BALANCE);
  const [profile, setProfile] = useState<any>(null);
  const [requests, setRequests] = useState<RequestItem[]>(MOCK_REQUESTS);
  const [attendance, setAttendance] = useState<any>(null);

  useEffect(() => {
    // Tải số dư quỹ phép thực tế từ PostgreSQL
    apiClient
      .get<LeaveBalanceResponse>('/leave/balance')
      .then((res) => {
        const data = res as unknown as LeaveBalanceResponse;
        if (data && data.balances && data.balances.length > 0) {
          setLeaveBalance(data);
        }
      })
      .catch(() => {});

    // Tải danh sách đơn thực tế từ Backend
    apiClient
      .get<RequestItem[]>('/requests')
      .then((res) => {
        const data = res as unknown as RequestItem[];
        if (Array.isArray(data)) {
          setRequests(data);
        }
      })
      .catch(() => {});

    // Tải hồ sơ nhân viên chi tiết từ Backend
    apiClient
      .get<any>('/employees/me')
      .then((res) => {
        const data = res as unknown as any;
        if (data) {
          setProfile(data);
        }
      })
      .catch(() => {});

    // Tải trạng thái chấm công hôm nay
    apiClient
      .get<any>('/attendance/status')
      .then((res) => {
        const data = res as unknown as any;
        if (data) {
          setAttendance(data);
        }
      })
      .catch(() => {});
  }, [user?.id]);

  const annualLeave = leaveBalance.balances.find(
    (b: any) => b.leaveType === 'ANNUAL' || b.leaveTypeCode === 'ANNUAL',
  );
  const sickLeave = leaveBalance.balances.find(
    (b: any) => b.leaveType === 'SICK' || b.leaveTypeCode === 'SICK',
  );
  const pendingRequests = requests.filter((r) => r.status === 'PENDING');
  const approvedRequests = requests.filter((r) => r.status === 'APPROVED');
  const approvalRate =
    requests.length > 0 ? Math.round((approvedRequests.length / requests.length) * 100) : 100;

  const columns = [
    {
      title: 'Mã đơn',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <Text code style={{ color: '#0f766e', fontWeight: 600 }}>
          {id.length > 10 ? `${id.slice(0, 8)}...` : id}
        </Text>
      ),
    },
    {
      title: 'Loại yêu cầu',
      dataIndex: 'type',
      key: 'type',
      render: (type: RequestType) => <RequestTypeTag type={type} />,
    },
    {
      title: 'Đánh giá AI',
      key: 'aiRisk',
      render: (_: unknown, record: RequestItem) => (
        <RiskBadge
          riskLevel={record.riskLevel}
          confidence={record.aiConfidence}
          showScore={false}
        />
      ),
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
              {profile?.departmentName || user?.departmentName || 'Phòng Kỹ thuật'} • {profile?.positionName || user?.positionName || 'Chuyên viên'}
              {profile?.managerName ? ` • Quản lý trực tiếp: ${profile.managerName}` : ''}
              {profile?.shiftTime ? ` • Ca: ${profile.shiftTime}` : ' • Ca: 08:30 - 17:30'}
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
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>Quỹ phép năm còn lại</Text>
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
              Đã sử dụng: {annualLeave?.usedDays ?? 2} ngày
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card hoverable style={{ border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>Tỉ lệ phê duyệt thành công</Text>
              <CheckCircleOutlined style={{ color: '#10b981', fontSize: 18 }} />
            </div>
            <div style={{ margin: '10px 0 6px' }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: '#10b981' }}>
                {approvalRate}%
              </span>
              <span style={{ fontSize: 13, color: '#64748b', marginLeft: 6 }}>
                ({approvedRequests.length}/{requests.length} đơn)
              </span>
            </div>
            <Progress percent={approvalRate} strokeColor="#10b981" showInfo={false} size="small" />
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              {pendingRequests.length} đơn đang đợi Quản lý xét duyệt
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
            <Progress
              percent={requests.length > 0 ? Math.round((pendingRequests.length / requests.length) * 100) : 0}
              strokeColor="#f59e0b"
              showInfo={false}
              size="small"
            />
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              Được AI tự động đối soát điều kiện
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card hoverable style={{ border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>Chấm công hôm nay</Text>
              <ClockCircleOutlined style={{ color: '#0d9488', fontSize: 18 }} />
            </div>
            <div style={{ margin: '10px 0 6px' }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#0f766e' }}>
                {attendance?.status === 'CHECKED_IN'
                  ? 'Đã vào ca'
                  : attendance?.status === 'CHECKED_OUT'
                  ? 'Đã hoàn thành ca'
                  : 'Chưa điểm danh'}
              </span>
            </div>
            <Tag
              color={attendance?.status === 'CHECKED_IN' ? 'success' : attendance?.status === 'CHECKED_OUT' ? 'default' : 'warning'}
              style={{ margin: '4px 0 0', borderRadius: 4 }}
            >
              {attendance?.checkInTime
                ? `Vào lúc: ${attendance.checkInTime}`
                : 'Ca Sáng: 08:30 - 17:30'}
            </Tag>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              {profile?.defaultShiftName || 'Văn phòng chính (Tầng 4)'}
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
                <FileDoneOutlined style={{ color: '#059669' }} />
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
            {requests.length === 0 ? (
              <EmptyState
                title="Chưa có yêu cầu nào gần đây"
                description="Khởi tạo đơn xin nghỉ phép hoặc đề xuất thay đổi ca làm việc của bạn."
                actionText="Tạo đơn ngay"
                onAction={() => navigate('/requests')}
              />
            ) : (
              <Table
                dataSource={requests.slice(0, 5)}
                columns={columns}
                rowKey="id"
                pagination={false}
                size="middle"
                onRow={() => ({
                  onClick: () => navigate('/requests'),
                  style: { cursor: 'pointer' },
                })}
              />
            )}
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
              description="Hệ thống ghi nhận trạng thái chấm công đúng giờ của bạn theo quy chuẩn doanh nghiệp."
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
              message="Chính sách nghỉ phép & Thời hạn báo trước"
              description="Quy chế công ty: Đơn xin nghỉ phép từ 3 ngày làm việc trở lên cần nộp trước tối thiểu 5 ngày làm việc."
              style={{
                marginBottom: 20,
                background: '#f0fdfa',
                border: '1px solid #99f6e4',
                borderRadius: 8,
              }}
            />

            <div
              style={{
                background: 'linear-gradient(135deg, #f8fafc 0%, #f0fdf4 100%)',
                padding: '20px 16px',
                borderRadius: 10,
                border: '1px dashed #a7f3d0',
                textAlign: 'center',
              }}
            >
              <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                Cần hỗ trợ tạo đơn hoặc tra cứu chính sách?
              </div>
              <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 14 }}>
                Trợ lý AI sẵn sàng trả lời quy định công ty và hỗ trợ lập đơn nháp tự động.
              </Text>
              <Button
                type="primary"
                icon={<RobotOutlined />}
                onClick={() => navigate('/agent-chat')}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 0,
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                  borderRadius: 8,
                  fontWeight: 500,
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
