import React from 'react';
import { Tag } from 'antd';
import { RequestStatus } from '@hr-agent/shared';

interface StatusTagProps {
  status: RequestStatus | string;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  [RequestStatus.Draft]: { color: 'default', label: 'Bản nháp' },
  [RequestStatus.Pending]: { color: 'processing', label: 'Chờ duyệt' },
  [RequestStatus.Approved]: { color: 'success', label: 'Đã duyệt' },
  [RequestStatus.Rejected]: { color: 'error', label: 'Bị từ chối' },
  [RequestStatus.Cancelled]: { color: 'warning', label: 'Đã hủy' },
};

export const StatusTag: React.FC<StatusTagProps> = ({ status }) => {
  const config = statusConfig[status] || { color: 'default', label: status };
  return <Tag color={config.color}>{config.label}</Tag>;
};

export default StatusTag;
