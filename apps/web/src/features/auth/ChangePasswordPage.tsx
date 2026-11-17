import React, { useState } from 'react';
import { Alert, App as AntdApp, Button, Card, Form, Input, Space, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const { Title, Text } = Typography;

// Cùng quy tắc với API (apps/api/src/modules/auth/password.util.ts)
const PASSWORD_RULE = 'Mật khẩu dài 10–72 ký tự, gồm cả chữ và số';

/**
 * Đổi mật khẩu. Khi tài khoản đang dùng mật khẩu do HR/Admin cấp (mustChangePassword) đây là trang
 * duy nhất dùng được cho tới khi đổi xong; trường hợp còn lại là đổi mật khẩu tự nguyện từ menu.
 */
export const ChangePasswordPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, changePassword, logout } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return null;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;

  const forced = !!user.mustChangePassword;

  const onFinish = async (values: { currentPassword: string; newPassword: string }) => {
    setSubmitting(true);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      message.success('Đã đổi mật khẩu. Các thiết bị khác sẽ phải đăng nhập lại.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      message.error((err as { message?: string })?.message || 'Không thể đổi mật khẩu. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: 16 }}>
      <Card style={{ width: 440, maxWidth: '100%' }}>
        <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 20 }}>
          <Title level={3} style={{ margin: 0 }}>
            Đổi mật khẩu
          </Title>
          <Text type="secondary">{user.fullName} · {user.email}</Text>
        </Space>

        {forced && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 20 }}
            message="Bạn cần đặt mật khẩu mới để tiếp tục"
            description="Mật khẩu hiện tại do quản trị viên cấp. Hãy đặt mật khẩu của riêng bạn và không chia sẻ cho ai."
          />
        )}

        <Form layout="vertical" onFinish={onFinish} size="large" autoComplete="off">
          <Form.Item
            name="currentPassword"
            label={forced ? 'Mật khẩu được cấp' : 'Mật khẩu hiện tại'}
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại!' }]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="Mật khẩu mới"
            extra={PASSWORD_RULE}
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu mới!' },
              { min: 10, message: PASSWORD_RULE },
              { max: 72, message: PASSWORD_RULE },
              { pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: PASSWORD_RULE },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="Nhập lại mật khẩu mới"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Vui lòng nhập lại mật khẩu mới!' },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || getFieldValue('newPassword') === value
                    ? Promise.resolve()
                    : Promise.reject(new Error('Hai mật khẩu không giống nhau')),
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
          </Form.Item>

          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button onClick={forced ? logout : () => navigate(-1)}>{forced ? 'Đăng xuất' : 'Quay lại'}</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Đổi mật khẩu
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
};

export default ChangePasswordPage;
