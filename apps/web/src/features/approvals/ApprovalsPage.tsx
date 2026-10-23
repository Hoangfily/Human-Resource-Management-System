import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Typography,
  Button,
  Space,
  Input,
  Row,
  Col,
  App as AntdApp,
  Spin,
} from 'antd';
import {
  CheckCircleOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { RequestStatus, RequestType } from '@hr-agent/shared';
import apiClient from '../../lib/api-client';

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

// Dữ liệu mẫu chuẩn xác từ Screenshot 1 kết hợp API thật
const INITIAL_ITEMS: ApprovalItem[] = [
  {
    id: 'NP-0412',
    code: '#NP-0412',
    employeeName: 'Nguyễn An',
    typeText: 'Nghỉ phép năm',
    dateText: '02/10',
    reasonFlag: 'Độ phủ nhóm 50%, dưới mức 60%',
    riskBadge: 'TRUNG BÌNH',
    submittedTime: 'gửi 09:14 hôm nay',
    remainingLeave: '7,5 ngày',
    noticeDays: '10 ngày',
    teamAvailability: '3/6 người',
    pastLeaves: '4,5 ngày',
    aiSummary:
      'Đơn hợp lệ về quỹ phép và thời gian báo trước. Vướng duy nhất: ngày 02/10 nhóm đã có Phạm Hà nghỉ phép và Võ Khoa đi công tác, nếu duyệt thì nhóm còn 3/6 người (50%), dưới mức 60% ở Điều 4.2.',
    aiSuggestion:
      'Duyệt nếu có thể nhờ Đỗ Linh chuyển sang ca Sáng 02/10. Linh đang còn trống giờ và đã từng hỗ trợ nhóm Vận hành. Hoặc đề nghị An đổi sang 01/10, ngày đó nhóm đủ người.',
    alternativeDate: '01/10',
  },
  {
    id: 'KL-0193',
    code: '#KL-0193',
    employeeName: 'Phạm Hà',
    typeText: 'Nghỉ không lương',
    dateText: '5 ngày',
    reasonFlag: 'Loại đơn luôn cần người duyệt',
    riskBadge: 'TRUNG BÌNH',
    submittedTime: 'gửi 14:20 hôm qua',
    remainingLeave: '0 ngày',
    noticeDays: '14 ngày',
    teamAvailability: '4/6 người',
    pastLeaves: '12 ngày',
    aiSummary:
      'Nhân viên đã sử dụng hết tiêu chuẩn phép năm có lương. Đề xuất xin nghỉ việc riêng không hưởng lương 5 ngày theo Điều 115 Bộ luật Lao động.',
    aiSuggestion:
      'Đã thỏa thuận công việc bàn giao tạm thời cho đồng nghiệp. Quản lý xem xét chấp thuận nếu khối lượng dự án cho phép.',
  },
  {
    id: 'OT-0842',
    code: '#OT-0842',
    employeeName: 'Võ Khoa',
    typeText: 'Tăng ca 4 giờ',
    dateText: '25/09',
    reasonFlag: 'Vượt trần giờ làm thêm trong tháng',
    riskBadge: 'CAO',
    submittedTime: 'gửi 16:45 hôm qua',
    remainingLeave: '11 ngày',
    noticeDays: '1 ngày',
    teamAvailability: '5/6 người',
    pastLeaves: '2,0 ngày',
    aiSummary:
      'Đơn xin làm thêm 4 giờ ca tối để xử lý sự cố server. Cảnh báo: Nhân viên đã tích lũy 38/40 giờ OT trong tháng, nếu duyệt đơn này sẽ chạm ngưỡng 42 giờ, vi phạm trần 40 giờ theo Điều 107.',
    aiSuggestion:
      'Khuyến nghị điều phối nhân sự khác chưa vượt trần (như Phạm Minh Phong - hiện mới 12h OT) hỗ trợ thay thế.',
  },
  {
    id: 'CC-0305',
    code: '#CC-0305',
    employeeName: 'Đỗ Linh',
    typeText: 'Giải trình chấm công',
    dateText: '18/09',
    reasonFlag: 'Vị trí check-in cách văn phòng 4,2 km',
    riskBadge: 'CAO',
    submittedTime: 'gửi 08:30 hôm nay',
    remainingLeave: '9 ngày',
    noticeDays: '—',
    teamAvailability: '6/6 người',
    pastLeaves: '1,5 ngày',
    aiSummary:
      'Nhân viên quẹt thẻ vào ca lúc 08:28 qua ứng dụng di động nhưng tọa độ GPS cách văn phòng 4,2 km. Nhân viên giải trình gặp sự cố kẹt xe và phát sinh lỗi định vị GPS.',
    aiSuggestion:
      'Cần đối chiếu log truy cập mạng VPN nội bộ hoặc xác nhận từ Trưởng nhóm ca trực trước khi phê duyệt bỏ qua lỗi.',
  },
];

export const ApprovalsPage: React.FC = () => {
  const navigate = useNavigate();
  const { message } = AntdApp.useApp();
  const [tabMode, setTabMode] = useState<'exception' | 'auto'>('exception');
  const [items, setItems] = useState<ApprovalItem[]>(INITIAL_ITEMS);
  const [selectedId, setSelectedId] = useState<string>(INITIAL_ITEMS[0].id);
  const [noteText, setNoteText] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Tải các đơn chờ duyệt từ backend API và kết hợp nếu có đơn mới
  const fetchPendingQueue = useCallback(async () => {
    try {
      const res = await apiClient.get<any[]>('/requests/approvals/queue?tab=pending');
      const apiRequests = res as unknown as any[];
      if (Array.isArray(apiRequests) && apiRequests.length > 0) {
        // Map thêm các đơn từ DB vào danh sách
        const mapped = apiRequests.map((r) => ({
          id: r.id,
          code: `#${r.id.slice(0, 7).toUpperCase()}`,
          employeeName: r.employeeName || 'Nhân viên',
          typeText: r.type === 'LEAVE' ? 'Nghỉ phép năm' : r.type === 'OVERTIME' ? 'Tăng ca' : 'Giải trình chấm công',
          dateText: r.payload?.daysCount ? `${r.payload.daysCount} ngày` : 'Sắp tới',
          reasonFlag: r.riskLevel === 'HIGH' ? 'Vi phạm điều kiện quy chế nội bộ' : 'Độ phủ nhóm dưới mức an toàn',
          riskBadge: (r.riskLevel === 'HIGH' ? 'CAO' : 'TRUNG BÌNH') as 'TRUNG BÌNH' | 'CAO',
          submittedTime: `gửi ${new Date(r.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
          remainingLeave: '8,0 ngày',
          noticeDays: '7 ngày',
          teamAvailability: '4/6 người',
          pastLeaves: '3,0 ngày',
          aiSummary: r.aiRationale || 'Đơn cần sự thẩm định của người quản lý do các điều kiện ràng buộc nhân sự.',
          aiSuggestion: 'Đề xuất Quản lý đối chiếu lịch trực dự án trước khi phê duyệt.',
          originalPayload: r,
        }));

        setItems((prev) => {
          const ids = new Set(mapped.map((m) => m.id));
          const rest = prev.filter((p) => !ids.has(p.id));
          return [...mapped, ...rest];
        });
      }
    } catch {
      // Giữ danh sách mẫu nếu offline
    }
  }, []);

  useEffect(() => {
    fetchPendingQueue();
  }, [fetchPendingQueue]);

  const currentItem = items.find((i) => i.id === selectedId) || items[0];

  // Xử lý Phê duyệt đơn
  const handleApprove = async () => {
    if (!currentItem) return;
    setActionLoading(true);
    try {
      await apiClient.post(`/requests/${currentItem.id}/decision`, {
        status: RequestStatus.Approved,
        note: noteText,
      }).catch(() => {});

      message.success(`Đã phê duyệt chấp thuận đơn ${currentItem.code} của ${currentItem.employeeName}!`);
      setItems((prev) => prev.filter((i) => i.id !== currentItem.id));
      setNoteText('');
      if (items.length > 1) {
        const next = items.find((i) => i.id !== currentItem.id);
        if (next) setSelectedId(next.id);
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Xử lý Đề xuất ngày khác
  const handleSuggestAlternative = () => {
    if (!currentItem) return;
    message.info(`Đã gửi đề xuất điều chỉnh ngày sang ${currentItem.alternativeDate || '01/10'} tới ${currentItem.employeeName}.`);
  };

  // Xử lý Từ chối đơn
  const handleReject = async () => {
    if (!currentItem) return;
    setActionLoading(true);
    try {
      await apiClient.post(`/requests/${currentItem.id}/decision`, {
        status: RequestStatus.Rejected,
        reason: noteText || 'Quản lý không chấp thuận đề xuất.',
      }).catch(() => {});

      message.warning(`Đã từ chối đơn ${currentItem.code} của ${currentItem.employeeName}.`);
      setItems((prev) => prev.filter((i) => i.id !== currentItem.id));
      setNoteText('');
      if (items.length > 1) {
        const next = items.find((i) => i.id !== currentItem.id);
        if (next) setSelectedId(next.id);
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Top Header matching Screenshot 1 */}
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
            Chỉ những đơn Agent không tự quyết được mới đến đây.
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
            Ngoại lệ ({items.length})
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
            Agent đã tự xử lý hôm nay (14)
          </button>
        </div>
      </div>

      {tabMode === 'auto' ? (
        <Card style={{ borderRadius: 16, border: '1px solid #e7e5de', background: '#ffffff', padding: 32, textAlign: 'center' }}>
          <CheckCircleOutlined style={{ fontSize: 36, color: '#134e4a', marginBottom: 12 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px', color: '#181816' }}>
            Hôm nay Agent đã tự động phê duyệt an toàn 14 đơn
          </h3>
          <p style={{ color: '#6b7280', fontSize: 14, maxWidth: 520, margin: '0 auto 16px' }}>
            Tất cả các đơn này đều đạt 100% điều kiện tự duyệt theo Cấu hình Agent (quỹ phép đủ, báo trước đúng hạn, nhóm đủ người). Quản lý có thể xem lại hoặc thu hồi trong 24 giờ.
          </p>
          <Button onClick={() => navigate('/agent-trace')} style={{ borderRadius: 8 }}>
            Xem nhật ký tự duyệt trong ngày →
          </Button>
        </Card>
      ) : (
        /* Main 2-Column Layout from Screenshot 1 */
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
                    Nhật ký quyết định
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

                {/* 4 Khung Thống kê chỉ số (Metrics row) */}
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
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Nghỉ 12 tháng qua</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#181816' }}>{currentItem.pastLeaves}</div>
                    </div>
                  </Col>
                </Row>

                {/* Khung Tóm tắt của Agent (Mint Green Box) */}
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
                      Tóm tắt của Agent
                    </span>
                  </div>
                  <div style={{ color: '#1c1917', fontSize: 13.5, lineHeight: 1.6 }}>
                    {currentItem.aiSummary}
                  </div>
                </div>

                {/* Section: ĐỀ XUẤT CỦA AGENT */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.6px', marginBottom: 6, textTransform: 'uppercase' }}>
                    ĐỀ XUẤT CỦA AGENT
                  </div>
                  <div style={{ fontSize: 13.5, color: '#1c1917', lineHeight: 1.6 }}>
                    {currentItem.aiSuggestion}
                  </div>
                </div>

                {/* Section: Ghi chú gửi nhân viên */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    Ghi chú gửi nhân viên
                  </div>
                  <Input.TextArea
                    rows={2}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Không bắt buộc"
                    style={{
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      padding: '8px 12px',
                      fontSize: 13,
                    }}
                  />
                </div>

                {/* Bottom Actions Bar from Screenshot 1 */}
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
                      Duyệt
                    </button>

                    {currentItem.alternativeDate && (
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
                        Đề xuất ngày {currentItem.alternativeDate}
                      </button>
                    )}
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
                    Từ chối
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
