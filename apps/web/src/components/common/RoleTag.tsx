import React from 'react';
import { Tag } from 'antd';
import { ROLE_DISPLAY_MAP } from '../../lib/display-mappers';

interface RoleTagProps {
  role: string;
}

export const RoleTag: React.FC<RoleTagProps> = ({ role }) => {
  const meta = ROLE_DISPLAY_MAP[role?.toUpperCase()] || {
    label: role,
    tagColor: '#64748b',
    color: 'default',
  };

  return (
    <Tag
      style={{
        borderRadius: 6,
        padding: '2px 8px',
        fontWeight: 500,
        color: meta.tagColor,
        borderColor: meta.tagColor + '40',
        backgroundColor: meta.tagColor + '12',
      }}
    >
      {meta.label}
    </Tag>
  );
};

export default RoleTag;
