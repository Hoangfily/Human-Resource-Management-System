import React from 'react';
import { Tag } from 'antd';
import {
  CalendarOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { formatRequestType } from '../../lib/display-mappers';

interface RequestTypeTagProps {
  type?: string;
  showIcon?: boolean;
}

export const RequestTypeTag: React.FC<RequestTypeTagProps> = ({ type, showIcon = true }) => {
  const meta = formatRequestType(type);

  const getIcon = () => {
    switch (type?.toUpperCase()) {
      case 'LEAVE':
        return <CalendarOutlined />;
      case 'OVERTIME':
        return <ThunderboltOutlined />;
      case 'ATTENDANCE_EXPLANATION':
        return <ClockCircleOutlined />;
      case 'SHIFT_CHANGE':
        return <SwapOutlined />;
      default:
        return <CalendarOutlined />;
    }
  };

  return (
    <Tag
      style={{
        backgroundColor: meta.bg,
        borderColor: meta.border,
        color: meta.tagColor,
        fontWeight: 500,
        fontSize: 12,
        borderRadius: 6,
        padding: '2px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {showIcon && getIcon()}
      <span>{meta.shortLabel}</span>
    </Tag>
  );
};

export default RequestTypeTag;
