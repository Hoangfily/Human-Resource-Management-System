import React from 'react';
import { Tag } from 'antd';
import { formatRequestStatus } from '../../lib/display-mappers';

interface StatusTagProps {
  status: string;
  showDot?: boolean;
}

export const StatusTag: React.FC<StatusTagProps> = ({ status, showDot = true }) => {
  const meta = formatRequestStatus(status);

  return (
    <Tag
      style={{
        backgroundColor: meta.bg,
        borderColor: meta.border,
        color: meta.tagColor,
        fontWeight: 600,
        fontSize: 12,
        borderRadius: 6,
        padding: '2px 10px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        margin: 0,
      }}
    >
      {showDot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: meta.tagColor,
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
      )}
      <span>{meta.label}</span>
    </Tag>
  );
};

export default StatusTag;
