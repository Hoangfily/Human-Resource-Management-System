import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Layout,
  Avatar,
  Dropdown,
  Space,
  Typography,
  Badge,
  Tooltip,
  App as AntdApp,
} from 'antd';
import {
  HomeOutlined,
  CommentOutlined,
  PlusSquareOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  InboxOutlined,
  UnorderedListOutlined,
  ControlOutlined,
  UserOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { UserRole } from '@hr-agent/shared';
import { useAuth } from '../features/auth/AuthContext';
import { RoleTag } from '../components/common';
import apiClient from '../lib/api-client';
import { RequestItem } from '../types';

const { Sider, Content } = Layout;
const { Text } = Typography;

export const MainLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = AntdApp.useApp();

  const [pendingCount, setPendingCount] = useState<number>(4);

  const isManagerOrAdmin =
    user?.role === UserRole.Manager ||
    user?.role === UserRole.HrAdmin ||
    user?.role === UserRole.Admin;

  useEffect(() => {
    if (isManagerOrAdmin) {
      apiClient
        .get<RequestItem[]>('/requests/approvals/queue?tab=pending')
        .then((res) => {
          const data = res as unknown as RequestItem[];
          if (Array.isArray(data) && data.length > 0) {
            setPendingCount(data.length);
          }
        })
        .catch(() => {});
    }
  }, [isManagerOrAdmin, location.pathname]);

  const handleLogout = () => {
    logout();
    message.success('Đã đăng xuất khỏi hệ thống an toàn.');
    navigate('/login', { replace: true });
  };

  const navItemStyle = (path: string) => {
    const isActive = location.pathname === path;
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '9px 16px',
      borderRadius: '8px',
      color: isActive ? '#ffffff' : '#9ca3af',
      backgroundColor: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
      fontWeight: isActive ? 600 : 400,
      fontSize: '14px',
      textDecoration: 'none',
      marginBottom: '3px',
      transition: 'all 0.15s ease',
      cursor: 'pointer',
    };
  };

  const userMenuItems = {
    items: [
      {
        key: 'profile-info',
        disabled: true,
        label: (
          <div style={{ padding: '8px 4px', minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{user?.fullName}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{user?.email}</div>
            <div style={{ marginTop: 8 }}>
              {user && <RoleTag role={user.role} />}
            </div>
          </div>
        ),
      },
      { type: 'divider' as const },
      {
        key: 'switch-account',
        label: 'Đổi tài khoản đăng nhập',
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

  return (
    <Layout style={{ minHeight: '100vh', background: '#fcfbf7' }}>
      {/* Matte Dark Charcoal Sidebar from Screenshot */}
      <Sider
        trigger={null}
        width={230}
        style={{
          background: '#161615',
          height: '100vh',
          position: 'sticky',
          top: 0,
          left: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #262624',
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '18px 12px' }}>
          {/* Logo Section: [N] Nhân Sự+ */}
          <div
            onClick={() => navigate('/dashboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '6px 12px 24px',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#5eead4',
                color: '#042f2e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 16,
                letterSpacing: '-0.5px',
                flexShrink: 0,
              }}
            >
              N
            </div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#fcfbf7', letterSpacing: '-0.2px' }}>
              Nhân Sự<span style={{ color: '#5eead4' }}>+</span>
            </div>
          </div>

          {/* Navigation Groups */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {/* Nhóm CÁ NHÂN */}
            <div style={{ padding: '0 12px 6px', fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.8px' }}>
              CÁ NHÂN
            </div>
            <Link to="/dashboard" style={navItemStyle('/dashboard')}>
              <Space size={12}>
                <HomeOutlined style={{ fontSize: 16 }} />
                <span>Tổng quan</span>
              </Space>
            </Link>
            <Link to="/agent-chat" style={navItemStyle('/agent-chat')}>
              <Space size={12}>
                <CommentOutlined style={{ fontSize: 16 }} />
                <span>Trợ lý HR</span>
              </Space>
            </Link>
            <Link to="/requests" style={navItemStyle('/requests')}>
              <Space size={12}>
                <PlusSquareOutlined style={{ fontSize: 16 }} />
                <span>Tạo đơn</span>
              </Space>
            </Link>
            <Link to="/attendance" style={navItemStyle('/attendance')}>
              <Space size={12}>
                <ClockCircleOutlined style={{ fontSize: 16 }} />
                <span>Chấm công</span>
              </Space>
            </Link>
            <Link to="/shifts" style={navItemStyle('/shifts')}>
              <Space size={12}>
                <CalendarOutlined style={{ fontSize: 16 }} />
                <span>Lịch ca</span>
              </Space>
            </Link>

            {/* Nhóm QUẢN LÝ */}
            <div style={{ padding: '20px 12px 6px', fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.8px' }}>
              QUẢN LÝ
            </div>
            <Link to="/approvals" style={navItemStyle('/approvals')}>
              <Space size={12}>
                <InboxOutlined style={{ fontSize: 16 }} />
                <span>Chờ xử lý</span>
              </Space>
              <div
                style={{
                  background: '#134e4a',
                  color: '#5eead4',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 12,
                  padding: '1px 8px',
                  lineHeight: '18px',
                }}
              >
                {pendingCount}
              </div>
            </Link>
            <Link to="/agent-trace" style={navItemStyle('/agent-trace')}>
              <Space size={12}>
                <UnorderedListOutlined style={{ fontSize: 16 }} />
                <span>Nhật ký Agent</span>
              </Space>
            </Link>

            {/* Nhóm QUẢN TRỊ HR */}
            <div style={{ padding: '20px 12px 6px', fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.8px' }}>
              QUẢN TRỊ HR
            </div>
            <Link to="/agent-settings" style={navItemStyle('/agent-settings')}>
              <Space size={12}>
                <ControlOutlined style={{ fontSize: 16 }} />
                <span>Cấu hình Agent</span>
              </Space>
            </Link>
          </div>

          {/* Bottom Profile Row */}
          <div style={{ borderTop: '1px solid #262624', paddingTop: 14 }}>
            <Dropdown menu={userMenuItems} placement="topRight">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                <Avatar
                  style={{ backgroundColor: '#2d3748', color: '#e2e8f0', fontWeight: 700, flexShrink: 0 }}
                  size={32}
                >
                  {user?.fullName?.charAt(0) || 'N'}
                </Avatar>
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <div
                    style={{
                      color: '#f3f4f6',
                      fontSize: 13,
                      fontWeight: 600,
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {user?.fullName || 'Trần Nam'}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 11, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {(() => {
                      const r = String(user?.role || '').toUpperCase();
                      if (r === 'ADMIN') return 'Quản trị viên';
                      if (r === 'HR' || r === 'HR_ADMIN' || user?.email === 'huyhoang@gmail.com') return 'Trưởng phòng HR';
                      if (r === 'MANAGER') return 'Quản lý Bộ phận';
                      return 'Nhân viên';
                    })()}
                  </div>
                </div>
              </div>
            </Dropdown>
          </div>
        </div>
      </Sider>

      {/* Main Content Area in Warm Ivory Cream */}
      <Layout style={{ background: '#fcfbf7' }}>
        <Content style={{ padding: '36px 40px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
