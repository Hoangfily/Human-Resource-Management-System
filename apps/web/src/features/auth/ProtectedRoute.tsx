import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { Result, Button, Spin } from 'antd';
import { UserRole } from '@hr-agent/shared';
import { useAuth } from './AuthContext';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="Đang tải phiên làm việc..." />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <div style={{ padding: '64px 24px', textAlign: 'center' }}>
        <Result
          status="403"
          title="Truy cập bị từ chối (403)"
          subTitle="Tài khoản của bạn không có quyền hạn truy cập vào chức năng này."
          extra={
            <Button type="primary" onClick={() => (window.location.href = '/dashboard')}>
              Quay lại Bảng điều khiển
            </Button>
          }
        />
      </div>
    );
  }

  return <Outlet />;
};

export default ProtectedRoute;
