import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Button,
  Typography,
  Space,
  Divider,
  Alert,
  App as AntdApp,
  Row,
  Col,
} from 'antd';
import {
  UserOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  RobotOutlined,
  TeamOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useAuth } from './AuthContext';
import { RoleTag } from '../../components/common';
import { UserRole } from '@hr-agent/shared';

const { Title, Text, Paragraph } = Typography;

export const LoginPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginAsDemoRole, isAuthenticated } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  // Đường dẫn chuyển hướng sau khi đăng nhập thành công
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  // Nếu đã đăng nhập, tự động chuyển về trang đích
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const onFinish = async (values: { email: string; password?: string }) => {
    setSubmitting(true);
    try {
      const success = await login({ email: values.email, password: values.password });
      if (success) {
        message.success('Đăng nhập thành công! Chào mừng trở lại.');
        navigate(from, { replace: true });
      } else {
        message.error('Đăng nhập thất bại. Vui lòng kiểm tra email hoặc mật khẩu.');
      }
    } catch {
      message.error('Đã xảy ra lỗi trong quá trình xác thực.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickDemo = (roleKey: 'employee' | 'manager' | 'hrAdmin') => {
    loginAsDemoRole(roleKey);
    message.success('Đăng nhập tài khoản demo thành công!');
    navigate(from, { replace: true });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 1000 }}>
        <Row
          gutter={[0, 0]}
          style={{
            background: '#ffffff',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Cột trái: Giới thiệu hệ thống HR Agent */}
          <Col
            xs={24}
            md={11}
            style={{
              background: 'linear-gradient(135deg, #064e3b 0%, #065f46 60%, #0f766e 100%)',
              padding: '48px 36px',
              color: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <Space align="center" style={{ marginBottom: 24 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                  }}
                >
                  <SafetyCertificateOutlined style={{ color: '#fff' }} />
                </div>
                <div>
                  <Title level={3} style={{ color: '#fff', margin: 0 }}>
                    HR Agent
                  </Title>
                  <Text style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: 13 }}>
                    Human-in-the-loop AI Assistant
                  </Text>
                </div>
              </Space>

              <Paragraph style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: 15, lineHeight: 1.7 }}>
                Hệ thống Quản lý Yêu cầu Nhân sự thế hệ mới. Tự động hóa thủ tục, giải thích chính sách và hỗ trợ phê duyệt thông minh với Trợ lý AI.
              </Paragraph>

              <div style={{ marginTop: 32 }}>
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Space align="start">
                    <CheckCircleOutlined style={{ color: '#b7eb8f', fontSize: 18, marginTop: 3 }} />
                    <Text style={{ color: '#fff' }}>Hỏi đáp & tra cứu chính sách HR tức thì với RAG</Text>
                  </Space>
                  <Space align="start">
                    <CheckCircleOutlined style={{ color: '#b7eb8f', fontSize: 18, marginTop: 3 }} />
                    <Text style={{ color: '#fff' }}>Tạo bản nháp đơn nghỉ phép & chấm công bằng hội thoại</Text>
                  </Space>
                  <Space align="start">
                    <CheckCircleOutlined style={{ color: '#b7eb8f', fontSize: 18, marginTop: 3 }} />
                    <Text style={{ color: '#fff' }}>Quy trình phê duyệt đa cấp & đánh giá rủi ro thông minh</Text>
                  </Space>
                </Space>
              </div>
            </div>

            <div style={{ marginTop: 36, paddingTop: 20, borderTop: '1px solid rgba(255, 255, 255, 0.2)' }}>
              <Text style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: 12 }}>
                Dự án Bài tập lớn Hệ thống Quản lý Nhân sự © 2026
              </Text>
            </div>
          </Col>

          {/* Cột phải: Form Đăng nhập & Quick Demo */}
          <Col xs={24} md={13} style={{ padding: '44px 36px', background: '#ffffff' }}>
            <div style={{ marginBottom: 28 }}>
              <Title level={3} style={{ margin: 0 }}>
                Đăng nhập hệ thống
              </Title>
              <Text type="secondary">Nhập email hoặc chọn nhanh tài khoản thử nghiệm bên dưới.</Text>
            </div>

            <Form
              name="login_form"
              layout="vertical"
              initialValues={{ email: 'an.nguyen@company.com' }}
              onFinish={onFinish}
              size="large"
            >
              <Form.Item
                name="email"
                label="Địa chỉ Email"
                rules={[
                  { required: true, message: 'Vui lòng nhập email!' },
                  { type: 'email', message: 'Email không đúng định dạng!' },
                ]}
              >
                <Input prefix={<UserOutlined style={{ color: '#8c8c8c' }} />} placeholder="name@company.com" />
              </Form.Item>

              <Form.Item
                name="password"
                label="Mật khẩu"
                rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}
                initialValue="password123"
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#8c8c8c' }} />}
                  placeholder="Nhập mật khẩu..."
                />
              </Form.Item>

              <Button type="primary" htmlType="submit" block loading={submitting} style={{ height: 42, marginTop: 8 }}>
                Đăng nhập
              </Button>
            </Form>

            <Divider plain style={{ margin: '24px 0 16px', fontSize: 13, color: '#8c8c8c' }}>
              <ThunderboltOutlined style={{ color: '#faad14' }} /> Hoặc đăng nhập nhanh kiểm thử (Demo)
            </Divider>

            {/* Quick Demo Buttons */}
            <Space direction="vertical" style={{ width: '100%' }} size={10}>
              <Button
                block
                onClick={() => handleQuickDemo('employee')}
                style={{ textAlign: 'left', height: 'auto', padding: '10px 14px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <UserOutlined style={{ color: '#1677ff' }} />
                    <div>
                      <div style={{ fontWeight: 500 }}>Nguyễn Văn An</div>
                      <div style={{ fontSize: 12, color: '#8c8c8c' }}>an.nguyen@company.com</div>
                    </div>
                  </Space>
                  <RoleTag role={UserRole.Employee} />
                </div>
              </Button>

              <Button
                block
                onClick={() => handleQuickDemo('manager')}
                style={{ textAlign: 'left', height: 'auto', padding: '10px 14px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <TeamOutlined style={{ color: '#722ed1' }} />
                    <div>
                      <div style={{ fontWeight: 500 }}>Trần Thị Bích (Trưởng nhóm)</div>
                      <div style={{ fontSize: 12, color: '#8c8c8c' }}>bich.tran@company.com</div>
                    </div>
                  </Space>
                  <RoleTag role={UserRole.Manager} />
                </div>
              </Button>

              <Button
                block
                onClick={() => handleQuickDemo('hrAdmin')}
                style={{ textAlign: 'left', height: 'auto', padding: '10px 14px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <RobotOutlined style={{ color: '#fa541c' }} />
                    <div>
                      <div style={{ fontWeight: 500 }}>Lê Hoàng Cường (Trưởng phòng HR)</div>
                      <div style={{ fontSize: 12, color: '#8c8c8c' }}>cuong.le@company.com</div>
                    </div>
                  </Space>
                  <RoleTag role={UserRole.HrAdmin} />
                </div>
              </Button>
            </Space>

            <Alert
              type="info"
              showIcon
              style={{ marginTop: 20 }}
              message="Chế độ Mock Data đang hoạt động"
              description="Bạn có thể bấm vào bất kỳ vai trò nào ở trên để trải nghiệm giao diện phân quyền tương ứng."
            />
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default LoginPage;
