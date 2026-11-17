import React from 'react';
import { Typography, Button, Space } from 'antd';
import { InboxOutlined, PlusOutlined, FileTextOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actionText?: string;
  onAction?: () => void;
  style?: React.CSSProperties;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Chưa có dữ liệu ghi nhận',
  description = 'Hiện tại hệ thống chưa ghi nhận thông tin nào trong danh mục này.',
  icon,
  actionText,
  onAction,
  style,
}) => {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        background: '#ffffff',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          color: '#059669',
          marginBottom: 16,
          boxShadow: '0 4px 12px rgba(5, 150, 105, 0.12)',
        }}
      >
        {icon || <InboxOutlined />}
      </div>
      <Title level={5} style={{ margin: '0 0 6px', color: '#1e293b', fontWeight: 600 }}>
        {title}
      </Title>
      <Text
        type="secondary"
        style={{
          fontSize: 13,
          maxWidth: 420,
          lineHeight: 1.5,
          marginBottom: actionText ? 20 : 0,
        }}
      >
        {description}
      </Text>
      {actionText && onAction && (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onAction}
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            border: 0,
            borderRadius: 8,
            fontWeight: 500,
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
          }}
        >
          {actionText}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;
