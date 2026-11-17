import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Form, Input, Button, Typography, App as AntdApp, Row, Col, Modal, Tag } from 'antd';
import {
  CheckCircleOutlined,
  SafetyCertificateFilled,
  ArrowRightOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useAuth } from './AuthContext';

const { Text } = Typography;

// Tài khoản mẫu của `npm run seed:api` (mật khẩu mẫu chỉ có ở máy phát triển)
const DEMO_ACCOUNTS = [
  { key: 'employee' as const, name: 'Phạm Minh Phong', role: 'Nhân viên', email: 'minhphong@gmail.com', tag: 'blue' },
  { key: 'manager' as const, name: 'Nguyễn Tiến Dũng', role: 'Quản lý Bộ phận', email: 'tiendung@gmail.com', tag: 'purple' },
  { key: 'hrAdmin' as const, name: 'Nguyễn Huy Hoàng', role: 'Trưởng phòng HR', email: 'huyhoang@gmail.com', tag: 'green' },
  { key: 'admin' as const, name: 'Quản trị viên Hệ thống', role: 'Quản trị cấp cao', email: 'admin@gmail.com', tag: 'gold' },
];

const FEATURES = [
  { title: 'Thẩm định & phê duyệt tự động', text: 'AI đối soát quy chế tức thì; đơn nghi vấn luôn được chuyển cho người duyệt.' },
  { title: 'Trợ lý giải đáp quy chế', text: 'Tra cứu điều khoản ngày phép, giờ làm thêm và soạn sẵn đơn bằng hội thoại.' },
  { title: 'Minh bạch & Kiểm soát toàn quyền', text: 'Mỗi quyết định của AI có vết suy luận; quản lý luôn có quyền ghi đè.' },
];

export const LoginPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginAsDemoRole, isAuthenticated } = useAuth();

  const [submitting, setSubmitting] = useState(false);
  const [demoModalVisible, setDemoModalVisible] = useState(false);
  const [loginForm] = Form.useForm();

  // Đường dẫn chuyển hướng sau khi đăng nhập thành công
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  // Nếu đã đăng nhập, tự động chuyển về trang đích
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleLogin = async (values: { email: string; password: string }) => {
    setSubmitting(true);
    try {
      const success = await login({ email: values.email, password: values.password });
      if (success) {
        message.success('Đăng nhập thành công! Chào mừng trở lại.');
        navigate(from, { replace: true });
      } else {
        message.error('Đăng nhập thất bại. Vui lòng kiểm tra email hoặc mật khẩu.');
      }
    } catch (err) {
      // Thông báo thật của API: sai email/mật khẩu, tài khoản tạm khóa sau nhiều lần sai…
      message.error((err as { message?: string })?.message || 'Đã xảy ra lỗi trong quá trình xác thực.');
    } finally {
      setSubmitting(false);
    }
  };

  // Chỉ dùng ở bản chạy phát triển (mật khẩu mẫu của seed); production không có
  const handleQuickDemo = async (roleKey: 'employee' | 'manager' | 'hrAdmin' | 'admin') => {
    setSubmitting(true);
    setDemoModalVisible(false);
    try {
      const success = await loginAsDemoRole(roleKey);
      if (success) {
        message.success('Đăng nhập tài khoản thử nghiệm thành công!');
        navigate(from, { replace: true });
      } else {
        message.error('Không thể đăng nhập tài khoản thử nghiệm.');
      }
    } catch {
      message.error('Đăng nhập thất bại. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f4f3ee',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <style>{`
        .custom-auth-input.ant-input,
        .custom-auth-input.ant-input-affix-wrapper {
          border-radius: 4px !important;
          font-size: 14px !important;
          border: 1px solid #d9d9d9 !important;
          height: 44px !important;
          box-shadow: none !important;
          background: #ffffff !important;
          transition: border-color 0.2s, box-shadow 0.2s !important;
        }
        .custom-auth-input.ant-input,
        .custom-auth-input.ant-input-affix-wrapper { padding: 8px 12px !important; }
        .custom-auth-input.ant-input-affix-wrapper > input.ant-input {
          height: auto !important;
          padding: 0 !important;
          border: none !important;
        }
        .custom-auth-input input::placeholder,
        .custom-auth-input.ant-input::placeholder {
          color: #9ca3af !important;
          font-size: 14px !important;
        }
        .custom-auth-input:focus,
        .custom-auth-input.ant-input-affix-wrapper-focused { border-color: #0f4c3a !important; }

        /* Ô lỗi validation: viền đỏ, dấu chấm than và chữ lỗi bên dưới */
        .ant-form-item-has-error .custom-auth-input.ant-input,
        .ant-form-item-has-error .custom-auth-input.ant-input-affix-wrapper {
          border-color: #ff4d4f !important;
          box-shadow: 0 0 0 1px #ff4d4f !important;
          background: #ffffff !important;
        }
        .custom-auth-form .ant-form-item-explain-error {
          display: flex !important;
          align-items: center !important;
          color: #ff4d4f !important;
          font-size: 12.5px !important;
          margin-top: 5px !important;
          line-height: 1.4 !important;
        }
        .custom-auth-form .ant-form-item-explain-error::before {
          content: "!" !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 14px !important;
          height: 14px !important;
          min-width: 14px !important;
          background-color: #ff4d4f !important;
          color: #ffffff !important;
          border-radius: 50% !important;
          font-size: 10px !important;
          font-weight: 800 !important;
          margin-right: 6px !important;
          line-height: 1 !important;
        }
        .required-star {
          color: #ff4d4f;
          font-size: 16px;
          font-weight: bold;
          line-height: 44px;
          width: 12px;
          flex-shrink: 0;
          text-align: center;
          user-select: none;
        }
      `}</style>

      <div
        style={{
          width: '100%',
          maxWidth: 1040,
          background: '#ffffff',
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)',
          border: '1px solid #ebe8df',
        }}
      >
        <Row gutter={[0, 0]}>
          {/* Cột trái: nhận diện thương hiệu và thông điệp giải pháp */}
          <Col
            xs={24}
            md={11}
            style={{
              background: 'linear-gradient(165deg, #092c20 0%, #0d382a 45%, #051b14 100%)',
              padding: '48px 40px',
              color: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -80,
                right: -80,
                width: 260,
                height: 260,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(94, 234, 212, 0.12) 0%, transparent 70%)',
                pointerEvents: 'none',
              }}
            />

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: '#5eead4',
                    color: '#042f2e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 18,
                    letterSpacing: '-0.5px',
                    boxShadow: '0 4px 12px rgba(94, 234, 212, 0.25)',
                  }}
                >
                  N
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 20, color: '#fcfbf7', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
                    Nhân Sự<span style={{ color: '#5eead4' }}>+</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', letterSpacing: '0.4px', textTransform: 'uppercase', marginTop: 2 }}>
                    Enterprise HR Platform
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontFamily: "'Newsreader', serif",
                  fontSize: '32px',
                  lineHeight: 1.25,
                  fontWeight: 600,
                  color: '#fcfbf7',
                  marginBottom: 16,
                  letterSpacing: '-0.4px',
                }}
              >
                Vận hành nhân sự thông minh & chuẩn xác với Trợ lý AI.
              </div>

              <p style={{ color: '#9ca3af', fontSize: 14.5, lineHeight: 1.65, margin: '0 0 32px 0' }}>
                Hệ thống tự động hóa thủ tục phê duyệt đơn từ, giải trình chấm công và tra cứu quy chế công ty.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {FEATURES.map((f) => (
                  <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        background: 'rgba(94, 234, 212, 0.12)',
                        color: '#5eead4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 2,
                        flexShrink: 0,
                      }}
                    >
                      <CheckCircleOutlined style={{ fontSize: 14 }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#f3f4f6' }}>{f.title}</div>
                      <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 2, lineHeight: 1.5 }}>{f.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                marginTop: 40,
                paddingTop: 20,
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: '#6b7280',
              }}
            >
              <SafetyCertificateFilled style={{ color: '#5eead4' }} />
              <span>Mật khẩu được băm, mọi thao tác quan trọng có nhật ký kiểm toán</span>
            </div>
          </Col>

          {/* Cột phải: form đăng nhập (tài khoản do HR/Admin cấp, không tự đăng ký) */}
          <Col xs={24} md={13} style={{ padding: '56px 40px 44px', background: '#ffffff' }}>
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontFamily: "'Newsreader', serif",
                  fontSize: '26px',
                  fontWeight: 700,
                  color: '#161615',
                  letterSpacing: '-0.3px',
                  marginBottom: 6,
                }}
              >
                Đăng nhập tài khoản
              </div>
              <Text style={{ color: '#6b7280', fontSize: 13.5 }}>
                Nhập email và mật khẩu do công ty cấp để truy cập không gian làm việc.
              </Text>
            </div>

            <Form
              form={loginForm}
              name="login_form"
              layout="vertical"
              onFinish={handleLogin}
              requiredMark={false}
              autoComplete="off"
              className="custom-auth-form"
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 18 }}>
                <span className="required-star">*</span>
                <div style={{ flex: 1 }}>
                  <Form.Item
                    name="email"
                    rules={[
                      { required: true, message: 'Nhập email công việc' },
                      { type: 'email', message: 'Email không đúng định dạng' },
                    ]}
                    style={{ margin: 0 }}
                  >
                    <Input className="custom-auth-input" placeholder="Email công việc" autoComplete="username" />
                  </Form.Item>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 12 }}>
                <span className="required-star">*</span>
                <div style={{ flex: 1 }}>
                  <Form.Item name="password" rules={[{ required: true, message: 'Nhập mật khẩu' }]} style={{ margin: 0 }}>
                    <Input.Password className="custom-auth-input" placeholder="Mật khẩu" autoComplete="current-password" />
                  </Form.Item>
                </div>
              </div>

              <div style={{ textAlign: 'right', marginBottom: 22 }}>
                <a
                  href="#forgot"
                  onClick={(e) => {
                    e.preventDefault();
                    message.info('Vui lòng liên hệ HR hoặc Quản trị viên để được cấp lại mật khẩu.');
                  }}
                  style={{ fontSize: 13, color: '#0f4c3a', fontWeight: 500 }}
                >
                  Quên mật khẩu?
                </a>
              </div>

              <Button
                type="primary"
                htmlType="submit"
                block
                loading={submitting}
                style={{
                  height: 44,
                  borderRadius: 4,
                  background: '#0f4c3a',
                  borderColor: '#0f4c3a',
                  fontSize: 15,
                  fontWeight: 600,
                  boxShadow: '0 2px 6px rgba(15, 76, 58, 0.25)',
                }}
              >
                Đăng nhập vào hệ thống
              </Button>
            </Form>

            <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13.5, color: '#6b7280' }}>
              Chưa có tài khoản? Liên hệ phòng Nhân sự để được cấp tài khoản.
            </div>

            {/* Đăng nhập nhanh chỉ có ở bản chạy phát triển; production không có */}
            {import.meta.env.DEV && (
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f3f1ea', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={() => setDemoModalVisible(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#9ca3af',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 8px',
                    borderRadius: 6,
                  }}
                >
                  <InfoCircleOutlined />
                  <span>Đăng nhập nhanh bằng tài khoản mẫu (chỉ bản phát triển)</span>
                </button>
              </div>
            )}
          </Col>
        </Row>
      </div>

      {import.meta.env.DEV && (
        <Modal
          title={<div style={{ fontWeight: 700, fontSize: 16, color: '#161615' }}>Chọn tài khoản mẫu để trải nghiệm nhanh</div>}
          open={demoModalVisible}
          onCancel={() => setDemoModalVisible(false)}
          footer={null}
          width={480}
          centered
          styles={{ body: { padding: '16px 4px 8px' } }}
        >
          <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
            Các tài khoản do <code>npm run seed:api</code> tạo, đủ bốn vai trò để thử luồng phê duyệt và cấu hình:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {DEMO_ACCOUNTS.map((acc) => (
              <div
                key={acc.key}
                role="button"
                tabIndex={0}
                onClick={() => handleQuickDemo(acc.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleQuickDemo(acc.key);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  background: '#faf9f5',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: '#111827' }}>
                    {acc.name}{' '}
                    <Tag color={acc.tag} style={{ marginLeft: 6, fontSize: 11 }}>
                      {acc.role}
                    </Tag>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{acc.email}</div>
                </div>
                <ArrowRightOutlined style={{ color: '#0f4c3a', fontSize: 13 }} />
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default LoginPage;
