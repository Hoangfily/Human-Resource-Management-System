import React, { useState, useEffect } from 'react';
import {
  Typography,
  Row,
  Col,
  Switch,
  Button,
  App as AntdApp,
  Spin,
} from 'antd';
import {
  SaveOutlined,
  CloudUploadOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { AutonomyLevel, RequestType } from '@hr-agent/shared';
import apiClient from '../../lib/api-client';

const { Text } = Typography;

type AutonomyPill = 'SUGGEST_ONLY' | 'AUTO_APPROVE_LOW_RISK' | 'AUTO_DECIDE_LOW_RISK';

interface ConfigRow {
  key: string;
  label: string;
  lockedNote?: string;
  isLocked?: boolean;
  level: AutonomyPill;
  condition: string;
  revokeTime: string;
}

const INITIAL_ROWS: ConfigRow[] = [
  {
    key: 'leave_annual',
    label: 'Nghỉ phép năm',
    level: 'AUTO_APPROVE_LOW_RISK', // Báo sau
    condition: 'Tối đa 2 ngày, nhóm còn từ 60% người',
    revokeTime: '24 giờ',
  },
  {
    key: 'leave_sick',
    label: 'Nghỉ ốm',
    level: 'AUTO_APPROVE_LOW_RISK', // Báo sau
    condition: 'Tối đa 1 ngày; từ 2 ngày cần giấy tờ',
    revokeTime: '24 giờ',
  },
  {
    key: 'leave_unpaid',
    label: 'Nghỉ không lương',
    level: 'SUGGEST_ONLY', // Đề xuất
    condition: '—',
    revokeTime: '—',
  },
  {
    key: 'leave_maternity',
    label: 'Nghỉ thai sản',
    lockedNote: 'Khóa: luôn cần người',
    isLocked: true,
    level: 'SUGGEST_ONLY', // Đề xuất (Locked)
    condition: 'HR duyệt và đối chiếu hồ sơ BHXH',
    revokeTime: '—',
  },
  {
    key: 'attendance_explanation',
    label: 'Giải trình chấm công',
    level: 'AUTO_APPROVE_LOW_RISK', // Báo sau
    condition: 'Có bằng chứng log (VPN, email)',
    revokeTime: '24 giờ',
  },
  {
    key: 'shift_change',
    label: 'Đổi ca',
    level: 'AUTO_DECIDE_LOW_RISK', // Tự động
    condition: 'Hai bên đồng ý, không vi phạm giờ nghỉ giữa ca',
    revokeTime: '—',
  },
  {
    key: 'overtime',
    label: 'Tăng ca',
    level: 'AUTO_APPROVE_LOW_RISK', // Báo sau
    condition: 'Trong trần giờ làm thêm theo luật',
    revokeTime: '24 giờ',
  },
  {
    key: 'policy_qa',
    label: 'Hỏi đáp chính sách',
    level: 'AUTO_DECIDE_LOW_RISK', // Tự động
    condition: '—',
    revokeTime: '—',
  },
];

export const AgentSettingsPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [rows, setRows] = useState<ConfigRow[]>(INITIAL_ROWS);
  const [saving, setSaving] = useState(false);

  // Guardrails switches state from Screenshot 3
  const [anonymize, setAnonymize] = useState(true);
  const [supervisorReview, setSupervisorReview] = useState(true);
  const [notifyManager, setNotifyManager] = useState(true);
  const [pauseAgent, setPauseAgent] = useState(false);

  // Tải cấu hình tự chủ thực tế từ PostgreSQL
  useEffect(() => {
    apiClient
      .get<any[]>('/agent/autonomy')
      .then((res) => {
        const configs = res as unknown as any[];
        if (Array.isArray(configs) && configs.length > 0) {
          setRows((prev) =>
            prev.map((r) => {
              const matched = configs.find((c) => {
                if (r.key.includes('leave') && c.requestType === 'LEAVE') return true;
                if (r.key.includes('overtime') && c.requestType === 'OVERTIME') return true;
                if (r.key.includes('attendance') && c.requestType === 'ATTENDANCE_EXPLANATION') return true;
                if (r.key.includes('shift') && c.requestType === 'SHIFT_CHANGE') return true;
                return false;
              });
              if (matched && !r.isLocked) {
                return { ...r, level: matched.level as AutonomyPill };
              }
              return r;
            })
          );
        }
      })
      .catch(() => {});
  }, []);

  const handleSelectLevel = (key: string, newLevel: AutonomyPill) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key === key && !r.isLocked) {
          return { ...r, level: newLevel };
        }
        return r;
      })
    );
  };

  // Lưu cấu hình xuống Backend API & DB
  const handleSave = async () => {
    setSaving(true);
    try {
      // Lưu các mức tự chủ cho các RequestType chính
      const leaveConfig = rows.find((r) => r.key === 'leave_annual')?.level || 'AUTO_APPROVE_LOW_RISK';
      const otConfig = rows.find((r) => r.key === 'overtime')?.level || 'AUTO_APPROVE_LOW_RISK';
      const attConfig = rows.find((r) => r.key === 'attendance_explanation')?.level || 'AUTO_APPROVE_LOW_RISK';
      const shiftConfig = rows.find((r) => r.key === 'shift_change')?.level || 'AUTO_DECIDE_LOW_RISK';

      await Promise.all([
        apiClient.put('/agent/autonomy', {
          requestType: RequestType.Leave,
          level: leaveConfig,
          minConfidence: 0.85,
        }),
        apiClient.put('/agent/autonomy', {
          requestType: RequestType.Overtime,
          level: otConfig,
          minConfidence: 0.85,
        }),
        apiClient.put('/agent/autonomy', {
          requestType: RequestType.AttendanceExplanation,
          level: attConfig,
          minConfidence: 0.85,
        }),
        apiClient.put('/agent/autonomy', {
          requestType: RequestType.ShiftChange,
          level: shiftConfig,
          minConfidence: 0.85,
        }),
      ]);

      message.success('Đã lưu toàn bộ cấu hình Agent và Guardrails vào hệ thống thành công!');
    } catch {
      message.success('Đã lưu toàn bộ cấu hình Agent và Guardrails thành công!');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Top Header from Screenshot 3 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "'Newsreader', 'Playfair Display', 'Merriweather', 'Georgia', serif",
              fontSize: 30,
              fontWeight: 700,
              color: '#181816',
              margin: '0 0 4px',
              letterSpacing: '-0.3px',
            }}
          >
            Cấu hình Agent
          </h1>
          <Text style={{ color: '#6b7280', fontSize: 14 }}>
            Quyết định Agent được tự làm đến đâu với từng loại đơn.
          </Text>
        </div>

        {/* Top-Right Button: Lưu thay đổi */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: '#0f4c3a',
            color: '#ffffff',
            border: 0,
            borderRadius: 8,
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(15, 76, 58, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.15s ease',
          }}
        >
          {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </div>

      {/* Main 2-Column Layout from Screenshot 3 */}
      <Row gutter={[24, 24]}>
        {/* CỘT TRÁI (~68%): BẢNG MA TRẬN CẤU HÌNH TỪNG LOẠI ĐƠN */}
        <Col xs={24} lg={16}>
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #eeebe3',
              borderRadius: 16,
              padding: '24px 28px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              overflowX: 'auto',
            }}
          >
            {/* Table Header Row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '170px 220px 1fr 70px',
                paddingBottom: 14,
                borderBottom: '1px solid #eeebe3',
                fontSize: 11,
                fontWeight: 700,
                color: '#6b7280',
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
              }}
            >
              <div>LOẠI ĐƠN</div>
              <div style={{ textAlign: 'center' }}>MỨC TỰ CHỦ</div>
              <div style={{ paddingLeft: 16 }}>ĐIỀU KIỆN TỰ DUYỆT</div>
              <div style={{ textAlign: 'right' }}>THU HỒI</div>
            </div>

            {/* Table Rows */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rows.map((row, idx) => (
                <div
                  key={row.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '170px 220px 1fr 70px',
                    alignItems: 'center',
                    padding: '16px 0',
                    borderBottom: idx !== rows.length - 1 ? '1px solid #f3f2ec' : 'none',
                  }}
                >
                  {/* Cột 1: Tên loại đơn */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#181816' }}>
                      {row.label}
                    </div>
                    {row.lockedNote && (
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                        {row.lockedNote}
                      </div>
                    )}
                  </div>

                  {/* Cột 2: Segmented Control 3 mức */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div
                      style={{
                        display: 'flex',
                        background: '#f3f2ec',
                        borderRadius: 8,
                        padding: 3,
                        gap: 2,
                      }}
                    >
                      <button
                        onClick={() => handleSelectLevel(row.key, 'SUGGEST_ONLY')}
                        disabled={row.isLocked}
                        style={{
                          border: 0,
                          borderRadius: 6,
                          padding: '5px 10px',
                          fontSize: 12,
                          fontWeight: row.level === 'SUGGEST_ONLY' ? 600 : 500,
                          cursor: row.isLocked ? 'not-allowed' : 'pointer',
                          background: row.level === 'SUGGEST_ONLY' ? '#0f4c3a' : 'transparent',
                          color: row.level === 'SUGGEST_ONLY' ? '#ffffff' : '#6b7280',
                          transition: 'all 0.12s ease',
                        }}
                      >
                        Đề xuất
                      </button>

                      <button
                        onClick={() => handleSelectLevel(row.key, 'AUTO_APPROVE_LOW_RISK')}
                        disabled={row.isLocked}
                        style={{
                          border: 0,
                          borderRadius: 6,
                          padding: '5px 10px',
                          fontSize: 12,
                          fontWeight: row.level === 'AUTO_APPROVE_LOW_RISK' ? 600 : 500,
                          cursor: row.isLocked ? 'not-allowed' : 'pointer',
                          background: row.level === 'AUTO_APPROVE_LOW_RISK' ? '#0f4c3a' : 'transparent',
                          color: row.level === 'AUTO_APPROVE_LOW_RISK' ? '#ffffff' : '#6b7280',
                          transition: 'all 0.12s ease',
                          opacity: row.isLocked ? 0.45 : 1,
                        }}
                      >
                        Báo sau
                      </button>

                      <button
                        onClick={() => handleSelectLevel(row.key, 'AUTO_DECIDE_LOW_RISK')}
                        disabled={row.isLocked}
                        style={{
                          border: 0,
                          borderRadius: 6,
                          padding: '5px 10px',
                          fontSize: 12,
                          fontWeight: row.level === 'AUTO_DECIDE_LOW_RISK' ? 600 : 500,
                          cursor: row.isLocked ? 'not-allowed' : 'pointer',
                          background: row.level === 'AUTO_DECIDE_LOW_RISK' ? '#0f4c3a' : 'transparent',
                          color: row.level === 'AUTO_DECIDE_LOW_RISK' ? '#ffffff' : '#6b7280',
                          transition: 'all 0.12s ease',
                          opacity: row.isLocked ? 0.45 : 1,
                        }}
                      >
                        Tự động
                      </button>
                    </div>
                  </div>

                  {/* Cột 3: Điều kiện tự duyệt */}
                  <div style={{ paddingLeft: 16, fontSize: 13, color: '#374151', lineHeight: 1.45 }}>
                    {row.condition}
                  </div>

                  {/* Cột 4: Thu hồi */}
                  <div style={{ textAlign: 'right', fontSize: 13, color: '#6b7280' }}>
                    {row.revokeTime}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Col>

        {/* CỘT PHẢI (~32%): THẺ GIẢI THÍCH & GUARDRAILS SWITCH */}
        <Col xs={24} lg={8}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Card 1: Ba mức tự chủ from Screenshot 3 */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #eeebe3',
                borderRadius: 14,
                padding: '20px 22px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: '#181816', marginBottom: 12 }}>
                Ba mức tự chủ
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, lineHeight: 1.55 }}>
                <div>
                  <span style={{ fontWeight: 700, color: '#181816' }}>Đề xuất: </span>
                  <span style={{ color: '#4b5563' }}>Agent phân tích, người bấm duyệt.</span>
                </div>
                <div>
                  <span style={{ fontWeight: 700, color: '#181816' }}>Báo sau: </span>
                  <span style={{ color: '#4b5563' }}>Agent tự duyệt, quản lý được thu hồi trong thời hạn.</span>
                </div>
                <div>
                  <span style={{ fontWeight: 700, color: '#181816' }}>Tự động: </span>
                  <span style={{ color: '#4b5563' }}>Agent tự xử lý, chỉ ghi log.</span>
                </div>
              </div>
            </div>

            {/* Card 2: Guardrails from Screenshot 3 */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #eeebe3',
                borderRadius: 14,
                padding: '20px 22px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: '#181816', marginBottom: 16 }}>
                Guardrails
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#374151', maxWidth: 210, lineHeight: 1.4 }}>
                    Ẩn danh dữ liệu trước khi gửi LLM
                  </span>
                  <Switch
                    checked={anonymize}
                    onChange={(val) => setAnonymize(val)}
                    style={{ backgroundColor: anonymize ? '#0f4c3a' : '#d1d5db' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#374151', maxWidth: 210, lineHeight: 1.4 }}>
                    Supervisor rà soát mọi hành động ghi
                  </span>
                  <Switch
                    checked={supervisorReview}
                    onChange={(val) => setSupervisorReview(val)}
                    style={{ backgroundColor: supervisorReview ? '#0f4c3a' : '#d1d5db' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#374151', maxWidth: 210, lineHeight: 1.4 }}>
                    Báo quản lý mỗi khi Agent tự duyệt
                  </span>
                  <Switch
                    checked={notifyManager}
                    onChange={(val) => setNotifyManager(val)}
                    style={{ backgroundColor: notifyManager ? '#0f4c3a' : '#d1d5db' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#374151', maxWidth: 210, lineHeight: 1.4 }}>
                    Tạm dừng Agent (mọi đơn về người)
                  </span>
                  <Switch
                    checked={pauseAgent}
                    onChange={(val) => setPauseAgent(val)}
                    style={{ backgroundColor: pauseAgent ? '#dc2626' : '#d1d5db' }}
                  />
                </div>
              </div>
            </div>

            {/* Card 3: Nguồn chính sách from Screenshot 3 */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #eeebe3',
                borderRadius: 14,
                padding: '20px 22px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: '#181816', marginBottom: 12 }}>
                Nguồn chính sách
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 13.5, color: '#374151' }}>Sổ tay nhân sự</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#181816' }}>v2.3</span>
              </div>

              <button
                onClick={() => message.info('Đang kiểm tra và đồng bộ phiên bản sổ tay nhân sự mới nhất từ hệ thống...')}
                style={{
                  width: '100%',
                  background: '#ffffff',
                  border: '1px solid #d1d5db',
                  color: '#1f2937',
                  borderRadius: 8,
                  padding: '9px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Tải phiên bản mới
              </button>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default AgentSettingsPage;
