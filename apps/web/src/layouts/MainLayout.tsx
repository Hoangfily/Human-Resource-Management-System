import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Layout,
  Menu,
  Button,
  Avatar,
  Dropdown,
  Space,
  Typography,
  Badge,
  Tag,
  Breadcrumb,
  Tooltip,
  App as AntdApp,
} from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  FileTextOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CheckSquareOutlined,
  SettingOutlined,
  RobotOutlined,
  LogoutOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  SlidersOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import { UserRole } from '@hr-agent/shared';
import { useAuth } from '../features/auth/AuthContext';
import { RoleTag } from '../components/common';
import { isMockEnabled, setMockEnabled } from '../lib/mock-data';

const { Header, Sider, Content, Footer } = Layout;
const { Text } = Typography;

export const MainLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntdApp.useApp();

  const [collapsed, setCollapsed] = useState(false);
  const [mockActive, setMockActive] = useState(isMockEnabled());

  const handleToggleMock = () => {
    const next = !mockActive;
    setMockEnabled(next);
    setMockActive(next);
    message.info(
      next
        ? 'Đã BẬT chế độ Mock Data.'
        : 'Đã TẮT chế độ Mock Data. Hệ thống sẽ kết nối trực tiếp đến Backend.'
    );
  };

  const handleLogout = () => {
    logout();
    message.success('Đã đăng xuất khỏi hệ thống.');
    navigate('/login', { replace: true });
  };

  // Xác định các quyền truy cập
  const isManagerOrAdmin =
    user?.role === UserRole.Manager ||
    user?.role === UserRole.HrAdmin ||
    user?.role === UserRole.Admin;

  const isHrOrAdmin =
    user?.role === UserRole.HrAdmin || user?.role === UserRole.Admin;

  // Xây dựng danh sách menu theo quyền hạn (Dark Sidebar phong cách thiết kế)
  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: <Link to="/dashboard">Tổng quan</Link>,
    },
    {
      key: '/requests',
      icon: <FileTextOutlined />,
      label: <Link to="/requests">Quản lý Đơn từ</Link>,
    },
    {
      key: '/attendance',
      icon: <CalendarOutlined />,
      label: <Link to="/attendance">Chấm công</Link>,
    },
    {
      key: '/shifts',
      icon: <ClockCircleOutlined />,
      label: <Link to="/shifts">Lịch ca làm</Link>,
    },
    ...(isManagerOrAdmin
      ? [
          {
            key: '/approvals',
            icon: <CheckSquareOutlined />,
            label: (
              <Link to="/approvals" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Phê duyệt đơn</span>
                <Badge count={2} size="small" style={{ backgroundColor: '#10b981' }} />
              </Link>
            ),
          },
        ]
      : []),
    {
      key: '/agent-chat',
      icon: <RobotOutlined style={{ color: '#34d399' }} />,
      label: (
        <Link to="/agent-chat">
          <span style={{ fontWeight: 600, color: '#34d399' }}>Trợ lý AI (HR Chat)</span>
        </Link>
      ),
    },
    ...(isHrOrAdmin
      ? [
          {
            key: 'group-admin',
            type: 'group' as const,
            label: <span style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase' }}>Hệ thống & HR</span>,
            children: [
              {
                key: '/admin',
                icon: <ApartmentOutlined />,
                label: <Link to="/admin">Cơ cấu & Quy định</Link>,
              },
              {
                key: '/agent-settings',
                icon: <SlidersOutlined />,
                label: <Link to="/agent-settings">Cấu hình Agent</Link>,
              },
              {
                key: '/agent-trace',
                icon: <SettingOutlined />,
                label: <Link to="/agent-trace">Nhật ký AI (Trace)</Link>,
              },
            ],
          },
        ]
      : []),
  ];

  // User Dropdown Menu
  const userMenuItems = {
    items: [
      {
        key: 'profile-info',
        disabled: true,
        label: (
          <div style={{ padding: '6px 4px', minWidth: 170 }}>
            <div style={{ fontWeight: 600, color: '#0f172a' }}>{user?.fullName}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{user?.email}</div>
            <div style={{ marginTop: 6 }}>
              {user && <RoleTag role={user.role} />}
            </div>
          </div>
        ),
      },
      { type: 'divider' as const },
      {
        key: 'switch-role',
        label: 'Đổi tài khoản demo',
        icon: <UserOutlined />,
        onClick: () => navigate('/login'),
      },
      {
        key: 'logout',
        danger: true,
        label: 'Đăng xuất',
        icon: <LogoutOutlined />,
        onClick: handleLogout,
      },
    ],
  };

  const pathSnippets = location.pathname.split('/').filter((i) => i);
  const breadcrumbNameMap: Record<string, string> = {
    dashboard: 'Tổng quan',
    requests: 'Quản lý Đơn từ',
    attendance: 'Chấm công',
    shifts: 'Lịch ca làm',
    approvals: 'Phê duyệt đơn',
    'agent-chat': 'Trợ lý AI (HR Chat)',
    admin: 'Cơ cấu & Quy định',
    'agent-settings': 'Cấu hình Agent',
    'agent-trace': 'Nhật ký AI (Trace)',
  };

  const breadcrumbItems = [
    { title: <Link to="/dashboard">Trang chủ</Link> },
    ...pathSnippets.map((snippet, index) => {
      const url = `/${pathSnippets.slice(0, index + 1).join('/')}`;
      const isLast = index === pathSnippets.length - 1;
      return {
        title: isLast ? (
          breadcrumbNameMap[snippet] || snippet
        ) : (
          <Link to={url}>{breadcrumbNameMap[snippet] || snippet}</Link>
        ),
      };
    }),
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Dark Sidebar Navigation */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={250}
        theme="dark"
        style={{
          background: '#0f172a',
          boxShadow: '2px 0 12px rgba(0, 0, 0, 0.15)',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Logo Section */}
        <div
          style={{
            height: 68,
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            gap: 12,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 20,
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
            }}
          >
            <SafetyCertificateOutlined />
          </div>
          {!collapsed && (
            <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#f8fafc', letterSpacing: '0.3px' }}>
                HR Agent
              </div>
              <div style={{ fontSize: 11, color: '#34d399', fontWeight: 500 }}>
                Hệ thống Nhân sự AI
              </div>
            </div>
          )}
        </div>

        {/* Menu Items */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          style={{
            background: 'transparent',
            borderRight: 0,
            marginTop: 14,
          }}
        />

        {/* Bottom User Card in Sidebar (như thiết kế bản gốc) */}
        {!collapsed && user && (
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: 12,
              right: 12,
              padding: '12px 14px',
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Space size={10} style={{ overflow: 'hidden' }}>
              <Avatar
                style={{ backgroundColor: '#059669', flexShrink: 0 }}
                icon={<UserOutlined />}
              >
                {user.fullName.charAt(0)}
              </Avatar>
              <div style={{ overflow: 'hidden' }}>
                <div
                  style={{
                    color: '#f1f5f9',
                    fontSize: 13,
                    fontWeight: 600,
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user.fullName}
                </div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>{user.departmentName}</div>
              </div>
            </Space>
            <Tooltip title="Đăng xuất">
              <Button
                type="text"
                size="small"
                icon={<LogoutOutlined style={{ color: '#94a3b8' }} />}
                onClick={handleLogout}
              />
            </Tooltip>
          </div>
        )}
      </Sider>

      {/* Main Body */}
      <Layout style={{ background: '#f8fafc' }}>
        {/* Header */}
        <Header
          style={{
            padding: '0 24px',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #e2e8f0',
            position: 'sticky',
            top: 0,
            zIndex: 9,
            height: 64,
          }}
        >
          <Space size={16}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16, width: 36, height: 36 }}
            />
            <Breadcrumb items={breadcrumbItems} />
          </Space>

          <Space size={16} align="center">
            {/* Nút bật/tắt Mock Mode */}
            <Tooltip title="Nhấp để chuyển đổi Mock Data và API thật">
              <Tag
                color={mockActive ? 'success' : 'default'}
                icon={<ThunderboltOutlined />}
                style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 12, borderRadius: 6 }}
                onClick={handleToggleMock}
              >
                Mock Data: {mockActive ? 'BẬT' : 'TẮT'}
              </Tag>
            </Tooltip>

            {/* Quick Button mở Chat AI với màu Emerald */}
            <Tooltip title="Mở Trợ lý HR AI">
              <Button
                type="primary"
                shape="round"
                icon={<RobotOutlined />}
                onClick={() => navigate('/agent-chat')}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 0,
                  boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                  fontWeight: 500,
                }}
              >
                Hỏi Trợ lý AI
              </Button>
            </Tooltip>

            {/* User Profile Dropdown */}
            <Dropdown menu={userMenuItems} trigger={['click']} placement="bottomRight">
              <Space style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}>
                <Avatar style={{ backgroundColor: '#059669' }} icon={<UserOutlined />}>
                  {user?.fullName?.charAt(0)}
                </Avatar>
                <div style={{ lineHeight: 1.2 }}>
                  <Text strong style={{ color: '#0f172a' }}>{user?.fullName}</Text>
                </div>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        {/* Content Outlet */}
        <Content style={{ margin: '24px 28px', minHeight: 480 }}>
          <Outlet />
        </Content>

        {/* Footer */}
        <Footer style={{ textAlign: 'center', color: '#94a3b8', padding: '16px 24px', fontSize: 13, background: 'transparent' }}>
          HR Agent Management System © 2026 — Hệ thống Quản lý Yêu cầu Nhân sự với AI hỗ trợ phê duyệt
        </Footer>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
