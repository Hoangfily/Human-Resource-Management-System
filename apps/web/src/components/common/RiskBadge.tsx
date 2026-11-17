import React from 'react';
import { Tag, Tooltip } from 'antd';
import { SafetyCertificateOutlined, ExclamationCircleOutlined, AlertOutlined } from '@ant-design/icons';
import { getRiskMeta } from '../../lib/display-mappers';

export interface RiskBadgeProps {
  riskLevel?: string;
  riskScore?: number;
  confidence?: number;
  showIcon?: boolean;
  showScore?: boolean;
  tooltip?: boolean;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  riskLevel,
  riskScore,
  confidence,
  showIcon = true,
  showScore = true,
  tooltip = true,
}) => {
  const meta = getRiskMeta(riskLevel, riskScore);

  const getIcon = () => {
    if (meta.level === 'HIGH') return <AlertOutlined style={{ color: meta.tagColor }} />;
    if (meta.level === 'MEDIUM') return <ExclamationCircleOutlined style={{ color: meta.tagColor }} />;
    return <SafetyCertificateOutlined style={{ color: meta.tagColor }} />;
  };

  const badgeContent = (
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
      }}
    >
      {showIcon && getIcon()}
      <span>{meta.shortLabel}</span>
      {showScore && confidence !== undefined && (
        <span style={{ fontSize: 11, opacity: 0.85, marginLeft: 2 }}>
          ({Math.round(confidence * 100)}%)
        </span>
      )}
      {showScore && confidence === undefined && riskScore !== undefined && (
        <span style={{ fontSize: 11, opacity: 0.85, marginLeft: 2 }}>
          ({Math.round((1 - riskScore) * 100)}% an toàn)
        </span>
      )}
    </Tag>
  );

  if (tooltip) {
    return <Tooltip title={meta.description}>{badgeContent}</Tooltip>;
  }

  return badgeContent;
};

export default RiskBadge;
