import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { UserRole } from '@hr-agent/shared';

// Layout & Guards
import { MainLayout } from './layouts/MainLayout';
import { ProtectedRoute } from './features/auth/ProtectedRoute';

// Pages
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { RequestsPage } from './features/requests/RequestsPage';
import { ApprovalsPage } from './features/approvals/ApprovalsPage';
import { AttendancePage } from './features/attendance/AttendancePage';
import { ShiftsPage } from './features/shifts/ShiftsPage';
import { AgentChatPage } from './features/agent-chat/AgentChatPage';
import { AdminPage } from './features/admin/AdminPage';
import { AgentSettingsPage } from './features/agent-settings/AgentSettingsPage';
import { AgentTracePage } from './features/agent-trace/AgentTracePage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <MainLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: 'dashboard',
            element: <DashboardPage />,
          },
          {
            path: 'requests',
            element: <RequestsPage />,
          },
          {
            path: 'attendance',
            element: <AttendancePage />,
          },
          {
            path: 'shifts',
            element: <ShiftsPage />,
          },
          {
            path: 'agent-chat',
            element: <AgentChatPage />,
          },
          // Routes yêu cầu quyền Quản lý (Manager, HR Admin, Admin)
          {
            element: (
              <ProtectedRoute
                allowedRoles={[UserRole.Manager, UserRole.HrAdmin, UserRole.Admin]}
              />
            ),
            children: [
              {
                path: 'approvals',
                element: <ApprovalsPage />,
              },
            ],
          },
          // Routes yêu cầu quyền HR Admin / Admin
          {
            element: (
              <ProtectedRoute allowedRoles={[UserRole.HrAdmin, UserRole.Admin]} />
            ),
            children: [
              {
                path: 'admin',
                element: <AdminPage />,
              },
              {
                path: 'agent-settings',
                element: <AgentSettingsPage />,
              },
              {
                path: 'agent-trace',
                element: <AgentTracePage />,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);

export default router;