import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Form,
  Input,
  Button,
  Typography,
  Checkbox,
  App as AntdApp,
  Row,
  Col,
  Segmented,
  Select,
  Modal,
  Tag,
} from 'antd';
import {
  CheckCircleOutlined,
  SafetyCertificateFilled,
  ArrowRightOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useAuth } from './AuthContext';

const { Text } = Typography;

export const LoginPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, loginAsDemoRole, isAuthenticated } = useAuth();

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [submitting, setSubmitting] = useState(false);
  const [demoModalVisible, setDemoModalVisible] = useState(false);

  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();

  // Đường dẫn chuyển hướng sau khi đăng nhập thành công
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  React.useEffect(() => {
    loginForm.resetFields();
    registerForm.resetFields();
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from, loginForm, registerForm]);

  // Xử lý Đăng nhập
  const handleLogin = async (values: { email: string; password?: string }) => {
    setSubmitting(true);
    try {
      const success = await login({ email: values.email, password: values.password });
      if (success) {
        message.success('Đăng nhập thành công! Chào mừng trở lại.');
        navigate(from, { replace: true });
      } else {
        message.error('Đăng nhập thất bại. Vui lòng kiểm tra lại email hoặc mật khẩu.');
      }
    } catch {
      message.error('Đã xảy ra sự cố trong quá trình xác thực.');
    } finally {
      setSubmitting(false);
    }
  };

  // Xử lý Đăng ký tài khoản mới
  const handleRegister = async (values: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
    departmentId?: string;
  }) => {
    setSubmitting(true);
    try {
      const result = await register({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        phone: values.phone,
        departmentId: values.departmentId,
      });

      if (result.success) {
        message.success('Đăng ký tài khoản thành công! Bạn đã được tự động đăng nhập.');
        navigate(from, { replace: true });
      } else {
        message.error(result.message || 'Đăng ký không thành công. Vui lòng thử lại.');
      }
    } catch {
      message.error('Đã xảy ra lỗi khi tạo tài khoản.');
    } finally {
      setSubmitting(false);
    }
  };

  // Hỗ trợ nhanh cho kiểm thử các vai trò
  const handleQuickDemo = async (roleKey: 'employee' | 'manager' | 'hrAdmin' | 'admin') => {
    setSubmitting(true);
    setDemoModalVisible(false);
    try {
      const success = await loginAsDemoRole(roleKey);
      if (success) {
        message.success('Đăng nhập tài khoản kiểm thử thành công!');
        navigate(from, { replace: true });
      } else {
        message.error('Không thể đăng nhập tài khoản kiểm thử.');
      }
    } catch {
      message.error('Đã xảy ra sự cố khi đăng nhập.');
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
        /* Ô nhập liệu theo mẫu Garena / Shopee của người dùng */
        .custom-auth-input.ant-input,
        .custom-auth-input.ant-input-affix-wrapper,
        .custom-auth-input.ant-select .ant-select-selector {
          border-radius: 4px !important;
          font-size: 14px !important;
          border: 1px solid #d9d9d9 !important;
          height: 44px !important;
          box-shadow: none !important;
          background: #ffffff !important;
          transition: border-color 0.2s, box-shadow 0.2s !important;
        }

        .custom-auth-input.ant-input-affix-wrapper {
          padding: 8px 12px !important;
        }

        .custom-auth-input.ant-input {
          padding: 8px 12px !important;
        }

        .custom-auth-input.ant-select .ant-select-selector {
          padding: 6px 11px !important;
        }

        .custom-auth-input.ant-input-affix-wrapper > input.ant-input {
          height: auto !important;
          padding: 0 !important;
          border: none !important;
        }

        .custom-auth-input input::placeholder,
        .custom-auth-input.ant-input::placeholder,
        .custom-auth-input .ant-select-selection-placeholder {
          color: #9ca3af !important;
          font-size: 14px !important;
        }

        .custom-auth-input:focus,
        .custom-auth-input.ant-input-affix-wrapper-focused,
        .custom-auth-input.ant-select-focused .ant-select-selector {
          border-color: #0f4c3a !important;
        }

        /* Khi ô bị lỗi validation (has-error) - viền đỏ theo đúng mẫu */
        .ant-form-item-has-error .custom-auth-input.ant-input,
        .ant-form-item-has-error .custom-auth-input.ant-input-affix-wrapper,
        .ant-form-item-has-error .custom-auth-input.ant-select .ant-select-selector {
          border-color: #ff4d4f !important;
          box-shadow: 0 0 0 1px #ff4d4f !important;
          background: #ffffff !important;
        }

        /* Dấu chấm than đỏ và text lỗi bên dưới */
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

        /* Dấu sao đỏ ngoài lề trái */
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
          {/* CỘT TRÁI: Nhận diện thương hiệu & Thông điệp giải pháp */}
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
            {/* Background aura mờ tinh tế */}
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
              {/* Brand Logo */}
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

              {/* Headline */}
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
                Hệ thống tự động hóa thủ tục phê duyệt đơn từ, giải trình chấm công và tra cứu quy chế công ty theo thời gian thực.
              </p>

              {/* 3 tính năng nổi bật */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
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
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#f3f4f6' }}>Thẩm định & phê duyệt tự động</div>
                    <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 2, lineHeight: 1.5 }}>
                      AI đối soát quy chế tức thì, giảm 85% thời gian xử lý đơn từ.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
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
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#f3f4f6' }}>Trợ lý giải đáp quy chế 24/7</div>
                    <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 2, lineHeight: 1.5 }}>
                      Tra cứu chính xác điều khoản ngày phép, giờ làm và chế độ đãi ngộ.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
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
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#f3f4f6' }}>Minh bạch & Kiểm soát toàn quyền</div>
                    <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 2, lineHeight: 1.5 }}>
                      Nhật ký suy luận rõ ràng, Quản lý luôn có quyền ghi đè quyết định.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Footer */}
            <div
              style={{
                marginTop: 40,
                paddingTop: 20,
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 12,
                color: '#6b7280',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SafetyCertificateFilled style={{ color: '#5eead4' }} />
                <span>Tiêu chuẩn bảo mật dữ liệu doanh nghiệp</span>
              </div>
              <span>v2.4</span>
            </div>
          </Col>

          {/* CỘT PHẢI: Tab chuyển đổi Đăng nhập / Đăng ký */}
          <Col xs={24} md={13} style={{ padding: '44px 40px', background: '#ffffff' }}>
            {/* Header Switcher: Đăng nhập vs Đăng ký */}
            <div style={{ marginBottom: 28 }}>
              <Segmented
                value={authMode}
                onChange={(val) => {
                  const mode = val as 'login' | 'register';
                  setAuthMode(mode);
                  loginForm.resetFields();
                  registerForm.resetFields();
                }}
                block
                options={[
                  { label: 'Đăng nhập', value: 'login' },
                  { label: 'Đăng ký tài khoản', value: 'register' },
                ]}
                style={{
                  background: '#f4f3ee',
                  padding: 4,
                  borderRadius: 10,
                  fontWeight: 600,
                  fontSize: 14,
                }}
              />
            </div>

            {/* ================= FORM ĐĂNG NHẬP ================= */}
            {authMode === 'login' ? (
              <div>
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
                    Vui lòng nhập thông tin để truy cập không gian làm việc.
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
                  {/* Ô nhập Email theo mẫu */}
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
                        <Input
                          className="custom-auth-input"
                          placeholder="Email công việc"
                          autoComplete="off"
                        />
                      </Form.Item>
                    </div>
                  </div>

                  {/* Ô nhập Mật khẩu theo mẫu */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 16 }}>
                    <span className="required-star">*</span>
                    <div style={{ flex: 1 }}>
                      <Form.Item
                        name="password"
                        rules={[{ required: true, message: 'Nhập mật khẩu' }]}
                        style={{ margin: 0 }}
                      >
                        <Input.Password
                          className="custom-auth-input"
                          placeholder="Mật khẩu"
                          autoComplete="new-password"
                        />
                      </Form.Item>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, marginTop: 4 }}>
                    <Form.Item name="remember" valuePropName="checked" initialValue={true} style={{ margin: 0 }}>
                      <Checkbox style={{ color: '#4b5563', fontSize: 13 }}>
                        Ghi nhớ thông tin đăng nhập
                      </Checkbox>
                    </Form.Item>
                    <a
                      href="#forgot"
                      onClick={(e) => {
                        e.preventDefault();
                        message.info('Vui lòng liên hệ Quản trị viên HR để được cấp lại mật khẩu.');
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

                {/* Footer chuyển sang Đăng ký */}
                <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13.5, color: '#6b7280' }}>
                  Chưa có tài khoản nhân sự?{' '}
                  <span
                    onClick={() => {
                      setAuthMode('register');
                      registerForm.resetFields();
                    }}
                    style={{ color: '#0f4c3a', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Đăng ký tài khoản mới
                  </span>
                </div>
              </div>
            ) : (
              /* ================= FORM ĐĂNG KÝ ================= */
              <div>
                <div style={{ marginBottom: 20 }}>
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
                    Đăng ký tài khoản nhân sự
                  </div>
                  <Text style={{ color: '#6b7280', fontSize: 13.5 }}>
                    Điền thông tin để tạo hồ sơ làm việc và sử dụng Trợ lý HR.
                  </Text>
                </div>

                <Form
                  form={registerForm}
                  name="register_form"
                  layout="vertical"
                  onFinish={handleRegister}
                  requiredMark={false}
                  autoComplete="off"
                  className="custom-auth-form"
                >
                  {/* Họ và tên */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 14 }}>
                    <span className="required-star">*</span>
                    <div style={{ flex: 1 }}>
                      <Form.Item
                        name="fullName"
                        rules={[{ required: true, message: 'Nhập họ và tên' }]}
                        style={{ margin: 0 }}
                      >
                        <Input
                          className="custom-auth-input"
                          placeholder="Họ và tên"
                        />
                      </Form.Item>
                    </div>
                  </div>

                  <Row gutter={12}>
                    <Col xs={24} sm={14}>
                      {/* Email công việc */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 14 }}>
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
                            <Input
                              className="custom-auth-input"
                              placeholder="Email công việc"
                              autoComplete="off"
                            />
                          </Form.Item>
                        </div>
                      </div>
                    </Col>
                    <Col xs={24} sm={10}>
                      {/* Số điện thoại */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 14 }}>
                        <span className="required-star">*</span>
                        <div style={{ flex: 1 }}>
                          <Form.Item
                            name="phone"
                            rules={[{ required: true, message: 'Nhập số điện thoại' }]}
                            style={{ margin: 0 }}
                          >
                            <Input
                              className="custom-auth-input"
                              placeholder="Số điện thoại"
                            />
                          </Form.Item>
                        </div>
                      </div>
                    </Col>
                  </Row>

                  {/* Phòng ban trực thuộc */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 14 }}>
                    <span className="required-star">*</span>
                    <div style={{ flex: 1 }}>
                      <Form.Item
                        name="departmentId"
                        initialValue="dept-tech"
                        style={{ margin: 0 }}
                      >
                        <Select
                          className="custom-auth-input"
                          style={{ width: '100%' }}
                          placeholder="Chọn phòng ban trực thuộc"
                          options={[
                            { value: 'dept-tech', label: 'Phòng Công nghệ Thông tin (CNTT)' },
                            { value: 'dept-hr', label: 'Phòng Nhân sự (HR)' },
                            { value: 'dept-sales', label: 'Phòng Kinh doanh & Tiếp thị' },
                          ]}
                        />
                      </Form.Item>
                    </div>
                  </div>

                  <Row gutter={12}>
                    <Col xs={24} sm={12}>
                      {/* Mật khẩu */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 16 }}>
                        <span className="required-star">*</span>
                        <div style={{ flex: 1 }}>
                          <Form.Item
                            name="password"
                            rules={[
                              { required: true, message: 'Nhập mật khẩu' },
                              { min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' },
                            ]}
                            style={{ margin: 0 }}
                          >
                            <Input.Password
                              className="custom-auth-input"
                              placeholder="Mật khẩu"
                              autoComplete="new-password"
                            />
                          </Form.Item>
                        </div>
                      </div>
                    </Col>
                    <Col xs={24} sm={12}>
                      {/* Xác nhận mật khẩu */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 16 }}>
                        <span className="required-star">*</span>
                        <div style={{ flex: 1 }}>
                          <Form.Item
                            name="confirmPassword"
                            dependencies={['password']}
                            rules={[
                              { required: true, message: 'Nhập lại mật khẩu' },
                              ({ getFieldValue }) => ({
                                validator(_, value) {
                                  if (!value || getFieldValue('password') === value) {
                                    return Promise.resolve();
                                  }
                                  return Promise.reject(new Error('Mật khẩu xác nhận không khớp'));
                                },
                              }),
                            ]}
                            style={{ margin: 0 }}
                          >
                            <Input.Password
                              className="custom-auth-input"
                              placeholder="Xác nhận mật khẩu"
                              autoComplete="new-password"
                            />
                          </Form.Item>
                        </div>
                      </div>
                    </Col>
                  </Row>

                  <Form.Item
                    name="agreement"
                    valuePropName="checked"
                    rules={[
                      {
                        validator: (_, value) =>
                          value
                            ? Promise.resolve()
                            : Promise.reject(new Error('Vui lòng đồng ý với điều khoản sử dụng')),
                      },
                    ]}
                    style={{ marginBottom: 20 }}
                  >
                    <Checkbox style={{ color: '#4b5563', fontSize: 12.5 }}>
                      Tôi cam kết tuân thủ Quy chế lao động & Tiêu chuẩn bảo mật nội bộ
                    </Checkbox>
                  </Form.Item>

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
                    Đăng ký tài khoản & Đăng nhập
                  </Button>
                </Form>

                {/* Footer chuyển sang Đăng nhập */}
                <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13.5, color: '#6b7280' }}>
                  Đã có tài khoản nhân sự?{' '}
                  <span
                    onClick={() => {
                      setAuthMode('login');
                      loginForm.resetFields();
                    }}
                    style={{ color: '#0f4c3a', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Đăng nhập ngay
                  </span>
                </div>
              </div>
            )}

            {/* Link hỗ trợ kiểm thử tiện ích (không làm phiền màn hình chính) */}
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
                <span>Trải nghiệm nhanh các vai trò mẫu (Quản lý, Trưởng phòng HR, Admin)</span>
              </button>
            </div>
          </Col>
        </Row>
      </div>

      {/* Modal danh sách tài khoản mẫu hỗ trợ khi người dùng/giám khảo cần test nhanh */}
      <Modal
        title={
          <div style={{ fontWeight: 700, fontSize: 16, color: '#161615' }}>
            Chọn tài khoản mẫu để trải nghiệm nhanh
          </div>
        }
        open={demoModalVisible}
        onCancel={() => setDemoModalVisible(false)}
        footer={null}
        width={480}
        centered
        styles={{ body: { padding: '16px 4px 8px' } }}
      >
        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
          Hệ thống đã có sẵn 4 tài khoản phân quyền hoàn chỉnh để bạn kiểm thử các luồng phê duyệt và cấu hình:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            {
              key: 'employee' as const,
              name: 'Phạm Minh Phong',
              role: 'Nhân viên',
              email: 'minhphong@gmail.com',
              tag: 'blue',
            },
            {
              key: 'manager' as const,
              name: 'Nguyễn Tiến Dũng',
              role: 'Quản lý Bộ phận',
              email: 'tiendung@gmail.com',
              tag: 'purple',
            },
            {
              key: 'hrAdmin' as const,
              name: 'Nguyễn Huy Hoàng',
              role: 'Trưởng phòng HR',
              email: 'huyhoang@gmail.com',
              tag: 'green',
            },
            {
              key: 'admin' as const,
              name: 'Quản trị viên Hệ thống',
              role: 'Quản trị cấp cao',
              email: 'admin@gmail.com',
              tag: 'gold',
            },
          ].map((acc) => (
            <div
              key={acc.key}
              onClick={() => handleQuickDemo(acc.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid #e5e7eb',
                background: '#faf9f5',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#0f4c3a';
                e.currentTarget.style.background = '#f0fdf4';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.background = '#faf9f5';
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: '#111827' }}>
                  {acc.name} <Tag color={acc.tag} style={{ marginLeft: 6, fontSize: 11 }}>{acc.role}</Tag>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{acc.email}</div>
              </div>
              <ArrowRightOutlined style={{ color: '#0f4c3a', fontSize: 13 }} />
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
};

export default LoginPage;
