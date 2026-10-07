import React, { useState, useEffect } from 'react';
import {
  Typography,
  Card,
  Space,
  Row,
  Col,
  Button,
  Switch,
  Table,
  Divider,
  Descriptions,
  App as AntdApp,
  Alert,
  Statistic,
} from 'antd';
import {
  CheckCircleOutlined,
  ApiOutlined,
  UserOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { RequestType } from '@hr-agent/shared';
import { StatusTag, RoleTag } from './components/common';
import {
  MOCK_USERS,
  MOCK_REQUESTS,
  isMockEnabled,
  setMockEnabled,
} from './lib/mock-data';
import { authStorage } from './lib/auth-storage';
import apiClient from './lib/api-client';
import { User, RequestItem } from './types';

const { Title, Text, Paragraph } = Typography;

export default function App() {
  const { message } = AntdApp.useApp();
  const [mockActive, setMockActive] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [apiStatus, setApiStatus] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');
  const [apiLatency, setApiLatency] = useState<number | null>(null);

  useEffect(() => {
    // Khởi tạo mock mode & user mặc định
    const enabled = isMockEnabled();
    setMockActive(enabled);

    const savedUser = authStorage.getUser();
    if (savedUser) {
      setCurrentUser(savedUser);
    } else {
      // Mặc định chọn Nhân viên demo
      const defaultUser = MOCK_USERS.employee;
      authStorage.setUser(defaultUser);
      authStorage.setAccessToken('mock_token_employee_001');
      setCurrentUser(defaultUser);
    }
  }, []);

  const handleToggleMock = (checked: boolean) => {
    setMockEnabled(checked);
    setMockActive(checked);
    message.success(
      checked
        ? 'Đã bật chế độ Mock Data. Bạn có thể test UI không cần Backend!'
        : 'Đã tắt Mock Data. Ứng dụng sẽ gọi API thực tế tới Backend.'
    );
  };

  const handleSelectUser = (key: 'employee' | 'manager' | 'hrAdmin') => {
    const selected = MOCK_USERS[key];
    authStorage.setUser(selected);
    authStorage.setAccessToken(`mock_token_${selected.id}`);
    setCurrentUser(selected);
    message.info(`Đã chuyển sang tài khoản: ${selected.fullName} (${selected.role})`);
  };

  const handleCheckApiHealth = async () => {
    setApiStatus('checking');
    const startTime = Date.now();
    try {
      // Gọi thử endpoint /health từ api-client
      await apiClient.get('/health');
      const latency = Date.now() - startTime;
      setApiLatency(latency);
      setApiStatus('online');
      message.success(`Kết nối Backend thành công! Độ trễ: ${latency}ms`);
    } catch {
      setApiStatus('offline');
      setApiLatency(null);
      message.warning('Backend chưa khởi động hoặc chưa sẵn sàng. Bạn vẫn có thể dùng Mock Data bình thường.');
    }
  };

  // Cấu hình bảng Request Demo
  const columns = [
    {
      title: 'Mã đơn',
      dataIndex: 'id',
      key: 'id',
      render: (text: string) => <Text code>{text}</Text>,
    },
    {
      title: 'Nhân viên',
      dataIndex: 'employeeName',
      key: 'employeeName',
      render: (name: string, record: RequestItem) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.departmentName}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Loại yêu cầu',
      dataIndex: 'type',
      key: 'type',
      render: (type: RequestType) => {
        const typeMap: Record<string, string> = {
          [RequestType.Leave]: 'Nghỉ phép',
          [RequestType.AttendanceExplanation]: 'Bổ sung chấm công',
          [RequestType.ShiftChange]: 'Đổi ca làm việc',
        };
        return <Text>{typeMap[type] || type}</Text>;
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
      render: (dateStr: string) => new Date(dateStr).toLocaleDateString('vi-VN'),
    },
    {
      title: 'Đánh giá AI',
      key: 'ai',
      render: (_: unknown, record: RequestItem) => {
        if (record.aiRiskScore !== undefined) {
          const isSafe = record.aiRiskScore < 0.3;
          return (
            <Text type={isSafe ? 'success' : 'warning'}>
              {isSafe ? '✓ Hợp lệ' : '⚠️ Cần lưu ý'} (Rủi ro: {Math.round(record.aiRiskScore * 100)}%)
            </Text>
          );
        }
        return <Text type="secondary">—</Text>;
      },
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f5f7fa', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header Hero Section */}
        <div style={{ marginBottom: 24 }}>
          <Space direction="horizontal" align="center" style={{ marginBottom: 8 }}>
            <SafetyCertificateOutlined style={{ fontSize: 32, color: '#1677ff' }} />
            <Title level={2} style={{ margin: 0 }}>
              HR Agent — Nền tảng Frontend
            </Title>
          </Space>
          <Paragraph type="secondary" style={{ fontSize: 15 }}>
            Khởi tạo thành công <strong>Bước 1: Hạ tầng Core</strong> (Axios HTTP Client, Ant Design Theme Tokens, React Query, Local Storage và Mock Data).
          </Paragraph>
        </div>

        {/* Trạng thái hệ thống */}
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} md={8}>
            <Card hoverable>
              <Statistic
                title="Chế độ Mock Data"
                value={mockActive ? 'Đang bật' : 'Đang tắt'}
                valueStyle={{ color: mockActive ? '#52c41a' : '#faad14' }}
                prefix={<ThunderboltOutlined />}
              />
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary" style={{ fontSize: 13 }}>Tự do test UI không cần BE</Text>
                <Switch checked={mockActive} onChange={handleToggleMock} />
              </div>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card hoverable>
              <Statistic
                title="Kết nối Backend API"
                value={
                  apiStatus === 'online'
                    ? `Trực tuyến (${apiLatency}ms)`
                    : apiStatus === 'checking'
                    ? 'Đang kiểm tra...'
                    : apiStatus === 'offline'
                    ? 'Ngoại tuyến'
                    : 'Chưa kiểm tra'
                }
                valueStyle={{
                  color:
                    apiStatus === 'online'
                      ? '#52c41a'
                      : apiStatus === 'offline'
                      ? '#ff4d4f'
                      : '#8c8c8c',
                }}
                prefix={<ApiOutlined />}
              />
              <div style={{ marginTop: 12 }}>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={apiStatus === 'checking'}
                  onClick={handleCheckApiHealth}
                >
                  Kiểm tra API (/health)
                </Button>
              </div>
            </Card>
          </Col>

          <Col xs={24} md={8}>
            <Card hoverable>
              <Statistic
                title="Tài khoản hiện tại"
                value={currentUser?.fullName || 'Chưa đăng nhập'}
                valueStyle={{ fontSize: 18 }}
                prefix={<UserOutlined />}
              />
              <div style={{ marginTop: 12 }}>
                {currentUser && <RoleTag role={currentUser.role} />}
              </div>
            </Card>
          </Col>
        </Row>

        {/* Chuyển đổi nhanh vai trò để test */}
        <Card
          title={
            <Space>
              <UserOutlined style={{ color: '#1677ff' }} />
              <span>Chuyển đổi vai trò kiểm thử (Role Switcher)</span>
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <Paragraph type="secondary">
            Chọn nhanh vai trò để mô phỏng phân quyền trong hệ thống trước khi tích hợp màn hình Đăng nhập (Auth):
          </Paragraph>
          <Space wrap>
            <Button
              type={currentUser?.role === 'EMPLOYEE' ? 'primary' : 'default'}
              onClick={() => handleSelectUser('employee')}
            >
              1. Nhân viên (An Nguyễn)
            </Button>
            <Button
              type={currentUser?.role === 'MANAGER' ? 'primary' : 'default'}
              onClick={() => handleSelectUser('manager')}
            >
              2. Trưởng nhóm Quản lý (Bích Trần)
            </Button>
            <Button
              type={currentUser?.role === 'HR_ADMIN' ? 'primary' : 'default'}
              onClick={() => handleSelectUser('hrAdmin')}
            >
              3. Quản trị HR (Cường Lê)
            </Button>
          </Space>

          {currentUser && (
            <div style={{ marginTop: 16, background: '#fafafa', padding: 16, borderRadius: 8 }}>
              <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
                <Descriptions.Item label="Họ tên">{currentUser.fullName}</Descriptions.Item>
                <Descriptions.Item label="Email">{currentUser.email}</Descriptions.Item>
                <Descriptions.Item label="Vai trò">
                  <RoleTag role={currentUser.role} />
                </Descriptions.Item>
                <Descriptions.Item label="Phòng ban">{currentUser.departmentName}</Descriptions.Item>
                <Descriptions.Item label="Chức vụ">{currentUser.positionName}</Descriptions.Item>
                <Descriptions.Item label="Mã User">{currentUser.id}</Descriptions.Item>
              </Descriptions>
            </div>
          )}
        </Card>

        {/* Bảng dữ liệu mẫu kiểm thử Ant Design Component */}
        <Card
          title={
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <span>Dữ liệu đơn mẫu kiểm thử (Sample HR Requests)</span>
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <Table
            dataSource={MOCK_REQUESTS}
            columns={columns}
            rowKey="id"
            pagination={false}
            size="middle"
          />
        </Card>

        {/* Hướng dẫn tiếp tục sang Bước 2 */}
        <Alert
          type="success"
          showIcon
          message="Bước 1 đã hoàn tất thành công!"
          description={
            <div>
              <p style={{ margin: '8px 0 4px' }}>
                Hạ tầng Core đã được thiết lập đầy đủ:
              </p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li><code>src/lib/api-client.ts</code>: Axios Client kèm Bearer Token interceptor.</li>
                <li><code>src/lib/auth-storage.ts</code>: Quản lý token và user state trong localStorage.</li>
                <li><code>src/lib/mock-data.ts</code>: Dữ liệu mẫu hoàn chỉnh để bạn code giao diện ngay.</li>
                <li><code>src/theme/theme-config.ts</code>: Theme Design System chuẩn Ant Design 5.</li>
                <li><code>src/components/common/</code>: Các component tái sử dụng <code>StatusTag</code>, <code>RoleTag</code>.</li>
              </ul>
              <Divider style={{ margin: '12px 0' }} />
              <Text strong>
                Sẵn sàng chuyển sang <strong>Bước 2: Xây dựng Layout (Sidebar/Header)</strong> và <strong>Màn hình Đăng nhập (LoginPage)</strong>.
              </Text>
            </div>
          }
        />
      </div>
    </div>
  );
}