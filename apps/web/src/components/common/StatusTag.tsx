import React from 'react';
import { Tag, Tooltip } from 'antd';
import { formatRequestStatus } from '../../lib/display-mappers';

interface StatusTagProps {
  status: string;
  showDot?: boolean;
}

export const StatusTag: React.FC<StatusTagProps> = ({ status, showDot = true }) => {
  const meta = formatRequestStatus(status);

  return (
    <Tooltip title={meta.description || meta.label}>
      <Tag
        style={{
          backgroundColor: meta.bg,
          borderColor: meta.border,
          color: meta.tagColor,
          fontWeight: 600,
          fontSize: 12,
          borderRadius: 6,
          padding: '2px 8px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          whiteSpace: 'nowrap',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
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
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta.label}
        </span>
      </Tag>
    </Tooltip>
  );
};

export default StatusTag;
