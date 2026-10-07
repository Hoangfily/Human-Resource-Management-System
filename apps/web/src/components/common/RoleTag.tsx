import React from 'react';
import { Tag } from 'antd';
import { UserRole } from '@hr-agent/shared';

interface RoleTagProps {
  role: UserRole | string;
}

const roleConfig: Record<string, { color: string; label: string }> = {
  [UserRole.Employee]: { color: 'blue', label: 'Nhân viên' },
  [UserRole.Manager]: { color: 'purple', label: 'Quản lý' },
  [UserRole.HrAdmin]: { color: 'volcano', label: 'Quản trị HR' },
  [UserRole.Admin]: { color: 'magenta', label: 'Admin Hệ thống' },
};

export const RoleTag: React.FC<RoleTagProps> = ({ role }) => {
  const config = roleConfig[role] || { color: 'default', label: role };
  return <Tag color={config.color}>{config.label}</Tag>;
};

export default RoleTag;
