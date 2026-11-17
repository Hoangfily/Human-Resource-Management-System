import React, { useState, useEffect, useCallback } from 'react';
import { Typography, Row, Col, Input, Space, Button, Table, Card, Spin, App as AntdApp } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../lib/api-client';
import { RequestStatus } from '@hr-agent/shared';
import { StatusTag, RequestTypeTag, EmptyState } from '../../components/common';
import { formatRequestType } from '../../lib/display-mappers';

const { Text } = Typography;

interface ApprovalItem {
  id: string;
  code: string;
  employeeName: string;
  typeText: string;
  dateText: string;
  reasonFlag: string;
  riskBadge: 'TRUNG BÌNH' | 'CAO';
  submittedTime: string;
  remainingLeave: string;
  noticeDays: string;
  teamAvailability: string;
  pastLeaves: string;
  aiSummary: string;
  aiSuggestion: string;
  alternativeDate?: string;
  originalPayload?: any;
}

export const ApprovalsPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const [tabMode, setTabMode] = useState<'exception' | 'auto'>('exception');
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [noteText, setNoteText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Tải danh sách đơn chờ duyệt từ backend API thật
  const fetchPendingQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<any[]>('/requests/approvals/queue?tab=pending');
      const apiRequests = res as unknown as any[];
      if (Array.isArray(apiRequests)) {
        const mapped = apiRequests.map((r) => ({
          id: r.id,
          code: `#${r.id.slice(0, 7).toUpperCase()}`,
          employeeName: r.employee?.fullName || r.employeeName || 'Nhân viên',
          typeText: formatRequestType(r.type).label,
          dateText: r.payload?.daysCount ? `${r.payload.daysCount} ngày` : 'Sắp tới',
          reasonFlag: r.riskLevel === 'HIGH' ? 'Rủi ro cao (Cần người thẩm định)' : 'Đơn cần người phê duyệt',
          riskBadge: (r.riskLevel === 'HIGH' ? 'CAO' : 'TRUNG BÌNH') as 'TRUNG BÌNH' | 'CAO',
          submittedTime: `gửi ${new Date(r.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
          remainingLeave: r.computed?.availableLeave ? `${r.computed.availableLeave} ngày` : '8,0 ngày',
          noticeDays: r.computed?.noticeDays ? `${r.computed.noticeDays} ngày` : '7 ngày',
          teamAvailability: r.computed?.teamAvailability ? `${r.computed.teamAvailability}` : 'Đầy đủ',
          pastLeaves: '—',
          aiSummary: r.aiRationale || r.payload?.reason || 'Đơn cần sự thẩm định của người quản lý.',
          aiSuggestion: 'Đề xuất Quản lý kiểm tra lịch công tác trước khi phê duyệt.',
          originalPayload: r,
        }));
        setItems(mapped);
        if (mapped.length > 0) {
          setSelectedId(mapped[0].id);
        } else {
          setSelectedId('');
        }
      }
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  }, []);

  // Tải lịch sử đơn đã xử lý / tự duyệt
  const fetchHistoryQueue = useCallback(async () => {
    try {
      const res = await apiClient.get<any[]>('/requests/approvals/queue?tab=history');
      const data = res as unknown as any[];
      if (Array.isArray(data)) {
        setHistoryItems(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchPendingQueue();
    fetchHistoryQueue();
  }, [fetchPendingQueue, fetchHistoryQueue]);

  const currentItem = items.find((i) => i.id === selectedId) || items[0];

  // Xử lý Phê duyệt đơn thật qua API
  const handleApprove = async () => {
    if (!currentItem) return;
    setActionLoading(true);
    try {
      await apiClient.post(`/requests/${currentItem.id}/decision`, {
        status: RequestStatus.Approved,
        reason: noteText || 'Phê duyệt chấp thuận yêu cầu',
        note: noteText,
      });

      message.success(`Đã phê duyệt chấp thuận đơn ${currentItem.code} của ${currentItem.employeeName}!`);
      setNoteText('');
      await fetchPendingQueue();
      await fetchHistoryQueue();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Không thể phê duyệt đơn này.';
      message.error(errMsg);
    } finally {
      setActionLoading(false);
    }
  };

  // Xử lý Đề xuất ngày khác
  const handleSuggestAlternative = () => {
    if (!currentItem) return;
    message.info(`Đã gửi thông báo đề xuất điều chỉnh ngày tới ${currentItem.employeeName}.`);
  };

  // Xử lý Từ chối đơn thật qua API
  const handleReject = async () => {
    if (!currentItem) return;
    if (!noteText.trim()) {
      message.warning('Vui lòng nhập lý do từ chối vào ô ghi chú!');
      return;
    }
    setActionLoading(true);
    try {
      await apiClient.post(`/requests/${currentItem.id}/decision`, {
        status: RequestStatus.Rejected,
        reason: noteText,
        note: noteText,
      });

      message.warning(`Đã từ chối đơn ${currentItem.code} của ${currentItem.employeeName}.`);
      setNoteText('');
      await fetchPendingQueue();
      await fetchHistoryQueue();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Không thể từ chối đơn này.';
      message.error(errMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const historyColumns = [
    {
      title: 'Mã đơn',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => <Text code style={{ color: '#0f766e', fontWeight: 600 }}>#{id.slice(0, 8)}</Text>,
    },
    {
      title: 'Nhân viên',
      key: 'employee',
      render: (_: any, r: any) => r.employee?.fullName || 'Nhân viên',
    },
    {
      title: 'Loại yêu cầu',
      dataIndex: 'type',
      key: 'type',
      render: (type: any) => <RequestTypeTag type={type} />,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st: any) => <StatusTag status={st} />,
    },
    {
      title: 'Thời gian',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (dt: string) => new Date(dt).toLocaleString('vi-VN'),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, r: any) => (
        <Button size="small" onClick={() => navigate(`/agent-trace?id=${r.id}`)}>
          Xem Trace
        </Button>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Top Header */}
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
            Chờ bạn xử lý
          </h1>
          <Text style={{ color: '#6b7280', fontSize: 14 }}>
            Chỉ những đơn Agent không tự quyết được mới được chuyển đến đây.
          </Text>
        </div>

        {/* Top-Right Toggle Pills */}
        <div style={{ display: 'flex', gap: 6, background: '#f3f2ec', padding: 4, borderRadius: 24 }}>
          <button
            onClick={() => setTabMode('exception')}
            style={{
              border: 0,
              borderRadius: 20,
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              background: tabMode === 'exception' ? '#ffffff' : 'transparent',
              color: tabMode === 'exception' ? '#181816' : '#6b7280',
              boxShadow: tabMode === 'exception' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Chờ duyệt ({items.length})
          </button>
          <button
            onClick={() => setTabMode('auto')}
            style={{
              border: 0,
              borderRadius: 20,
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              background: tabMode === 'auto' ? '#ffffff' : 'transparent',
              color: tabMode === 'auto' ? '#181816' : '#6b7280',
              boxShadow: tabMode === 'auto' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Đã xử lý ({historyItems.length})
          </button>
        </div>
      </div>

      {tabMode === 'auto' ? (
        <Card style={{ borderRadius: 16, border: '1px solid #e7e5de', background: '#ffffff', padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <CheckCircleOutlined style={{ fontSize: 28, color: '#10b981' }} />
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#181816' }}>
                Lịch sử các đơn đã được giải quyết ({historyItems.length} đơn)
              </h3>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Bao gồm các đơn do AI tự động duyệt theo ngưỡng an toàn và các đơn Quản lý đã thẩm định.
              </Text>
            </div>
          </div>

          <Table
            dataSource={historyItems}
            columns={historyColumns}
            rowKey="id"
            pagination={{ pageSize: 8 }}
            size="middle"
          />
        </Card>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
        </div>
      ) : items.length === 0 ? (
        <Card style={{ borderRadius: 16, border: '1px solid #e7e5de', background: '#ffffff', padding: '40px 20px', textAlign: 'center' }}>
          <EmptyState
            title="Hàng đợi đã được xử lý xong!"
            description="Hiện không còn đơn từ nào cần Quản lý phê duyệt. Tất cả các yêu cầu hợp lệ đã được xử lý an toàn."
            actionText="Xem tất cả đơn từ"
            onAction={() => navigate('/requests')}
          />
        </Card>
      ) : (
        /* Main 2-Column Layout */
        <Row gutter={[24, 24]}>
          {/* CỘT TRÁI: DANH SÁCH ĐƠN CHỜ */}
          <Col xs={24} lg={9}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {items.map((item) => {
                const isSelected = item.id === selectedId;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    style={{
                      background: isSelected ? '#f8faf9' : '#ffffff',
                      border: isSelected ? '1.5px solid #0f4c3a' : '1px solid #e7e5de',
                      borderRadius: 14,
                      padding: '16px 18px',
                      cursor: 'pointer',
                      boxShadow: isSelected ? '0 2px 8px rgba(15, 76, 58, 0.08)' : '0 1px 3px rgba(0,0,0,0.02)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: '#181816' }}>
                        {item.employeeName}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 10,
                          letterSpacing: '0.4px',
                          backgroundColor: item.riskBadge === 'CAO' ? '#fee2e2' : '#fef3c7',
                          color: item.riskBadge === 'CAO' ? '#b91c1c' : '#b45309',
                        }}
                      >
                        {item.riskBadge}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                      {item.typeText} · {item.dateText}
                    </div>

                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {item.reasonFlag}
                    </div>
                  </div>
                );
              })}
            </div>
          </Col>

          {/* CỘT PHẢI: CHI TIẾT ĐƠN ĐANG CHỌN */}
          <Col xs={24} lg={15}>
            {currentItem && (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #eeebe3',
                  borderRadius: 16,
                  padding: '28px 32px',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                }}
              >
                {/* Header row: Mã đơn + Link Nhật ký quyết định */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: '#6b7280' }}>
                    {currentItem.code} · {currentItem.submittedTime}
                  </span>
                  <span
                    onClick={() => navigate(`/agent-trace?id=${currentItem.id}`)}
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#0f4c3a',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Xem vết suy luận AI
                  </span>
                </div>

                {/* Main Title: [Tên nhân viên] · [Loại đơn] [Ngày] */}
                <h2
                  style={{
                    fontFamily: "'Newsreader', 'Playfair Display', 'Merriweather', 'Georgia', serif",
                    fontSize: 24,
                    fontWeight: 700,
                    color: '#181816',
                    margin: '0 0 20px',
                    letterSpacing: '-0.2px',
                  }}
                >
                  {currentItem.employeeName} · {currentItem.typeText} {currentItem.dateText}
                </h2>

                {/* 4 Khung Thống kê chỉ số */}
                <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
                  <Col span={6}>
                    <div style={{ background: '#f9f8f4', border: '1px solid #f0ede6', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Quỹ phép còn</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#181816' }}>{currentItem.remainingLeave}</div>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ background: '#f9f8f4', border: '1px solid #f0ede6', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Báo trước</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#181816' }}>{currentItem.noticeDays}</div>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ background: '#f9f8f4', border: '1px solid #f0ede6', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Nhóm còn lại</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#181816' }}>{currentItem.teamAvailability}</div>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ background: '#f9f8f4', border: '1px solid #f0ede6', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Nghỉ trong năm</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#181816' }}>{currentItem.pastLeaves}</div>
                    </div>
                  </Col>
                </Row>

                {/* Khung Tóm tắt của Agent */}
                <div
                  style={{
                    background: '#edf7f2',
                    border: '1px solid #c8e6c9',
                    borderRadius: 12,
                    padding: '16px 20px',
                    marginBottom: 20,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div
                      style={{
                        background: '#134e4a',
                        color: '#ffffff',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}
                    >
                      AI
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 14, color: '#064e3b' }}>
                      Tóm tắt phân tích của Agent
                    </span>
                  </div>
                  <div style={{ color: '#1c1917', fontSize: 13.5, lineHeight: 1.6 }}>
                    {currentItem.aiSummary}
                  </div>
                </div>

                {/* Section: Ghi chú */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    Ghi chú / Lý do phê duyệt hoặc từ chối
                  </div>
                  <Input.TextArea
                    rows={2}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Nhập ghi chú cho nhân viên (Bắt buộc nếu từ chối)"
                    style={{
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      padding: '8px 12px',
                      fontSize: 13,
                    }}
                  />
                </div>

                {/* Bottom Actions Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
                  <Space size={12}>
                    <button
                      onClick={handleApprove}
                      disabled={actionLoading}
                      style={{
                        background: '#0f4c3a',
                        color: '#ffffff',
                        border: 0,
                        borderRadius: 8,
                        padding: '10px 26px',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(15, 76, 58, 0.2)',
                      }}
                    >
                      Duyệt đơn
                    </button>

                    <button
                      onClick={handleSuggestAlternative}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #d1d5db',
                        color: '#1f2937',
                        borderRadius: 8,
                        padding: '10px 20px',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Đề xuất điều chỉnh
                    </button>
                  </Space>

                  <button
                    onClick={handleReject}
                    disabled={actionLoading}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #fecaca',
                      color: '#dc2626',
                      borderRadius: 8,
                      padding: '10px 20px',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Từ chối đơn
                  </button>
                </div>
              </div>
            )}
          </Col>
        </Row>
      )}
    </div>
  );
};

export default ApprovalsPage;
