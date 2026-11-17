import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Typography,
  Calendar,
  Tag,
  Space,
  Button,
  Row,
  Col,
  Badge,
  Table,
  Modal,
  Form,
  Input,
  DatePicker,
  TimePicker,
  App as AntdApp,
  Spin,
} from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  AlertOutlined,
  HistoryOutlined,
  PlusOutlined,
  EnvironmentOutlined,
  SafetyCertificateOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import apiClient from '../../lib/api-client';
import { RequestType } from '@hr-agent/shared';

const { Title, Text, Paragraph } = Typography;

interface AttendanceStatus {
  isCheckedIn: boolean;
  isCheckedOut?: boolean;
  status?: string;
  firstClockIn?: string | null;
  lastClockOut?: string | null;
  clockInTime?: string | null;
  clockOutTime?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  workedHours?: number;
  workingHours?: number;
  todayEventsCount?: number;
  eventsCount?: number;
  recentLogs?: Array<{
    id: string;
    type: string;
    timestamp: string;
    location?: string;
  }>;
}

export const AttendancePage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [statusData, setStatusData] = useState<AttendanceStatus | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [isExplainModalOpen, setIsExplainModalOpen] = useState(false);
  const [explainForm] = Form.useForm();
  const [submittingExplain, setSubmittingExplain] = useState(false);

  // Đồng hồ thời gian thực
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Tải trạng thái và lịch sử quẹt thẻ từ Backend API
  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, historyRes] = await Promise.all([
        apiClient.get<any>('/attendance/status'),
        apiClient.get<any>('/attendance/history'),
      ]);
      setStatusData((statusRes as any) as AttendanceStatus);
      const logs = Array.isArray(historyRes)
        ? historyRes
        : Array.isArray((historyRes as any)?.history)
        ? (historyRes as any).history
        : [];
      setHistoryLogs(logs);
    } catch {
      // Giữ giao diện nếu lỗi mạng
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  // Xử lý Check-in / Check-out ghi nhận CSDL thật
  const handleCheckInOut = async () => {
    setActionLoading(true);
    try {
      const isCurrentlyIn = statusData?.isCheckedIn;
      if (!isCurrentlyIn) {
        const res: any = await apiClient.post('/attendance/clock-in', {
          location: 'Văn phòng chính (Tầng 4)',
          deviceInfo: navigator.userAgent.slice(0, 50),
        });
        message.success(res?.message || 'Check-in thành công! Chúc bạn ngày làm việc hiệu quả.');
      } else {
        const res: any = await apiClient.post('/attendance/clock-out', {
          location: 'Văn phòng chính (Tầng 4)',
          deviceInfo: navigator.userAgent.slice(0, 50),
        });
        message.info(res?.message || 'Check-out thành công! Tạm biệt và hẹn gặp lại.');
      }
      await fetchAttendance();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Không thể ghi nhận chấm công. Vui lòng thử lại.';
      message.error(errMsg);
    } finally {
      setActionLoading(false);
    }
  };

  // Nộp đơn giải trình chấm công trực tiếp vào CSDL Requests
  const handleExplainSubmit = async (values: any) => {
    setSubmittingExplain(true);
    try {
      await apiClient.post('/requests', {
        type: RequestType.AttendanceExplanation,
        payload: {
          date: values.date ? values.date.format('YYYY-MM-DD') : new Date().toISOString().split('T')[0],
          issue: values.issue || 'Quên quẹt thẻ vào ca',
          explanation: values.reason,
          reason: values.reason,
          timeRange: values.timeRange ? `${values.timeRange[0].format('HH:mm')} - ${values.timeRange[1].format('HH:mm')}` : '08:30 - 17:30',
        },
      });

      message.success('Đã gửi đơn giải trình chấm công thành công! Đơn đã chuyển tới Quản lý.');
      setIsExplainModalOpen(false);
      explainForm.resetFields();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Không thể gửi đơn giải trình.';
      message.error(errMsg);
    } finally {
      setSubmittingExplain(false);
    }
  };

  const logColumns = [
    {
      title: 'Ngày',
      dataIndex: 'date',
      key: 'date',
      render: (t: string) => <Text strong>{t}</Text>,
    },
    {
      title: 'Giờ vào',
      key: 'in',
      render: (_: any, r: any) => {
        const val = r.in || r.clockIn;
        return val && val !== '—' ? (
          <Tag color="success" style={{ fontWeight: 600, borderRadius: 6 }}>
            {val}
          </Tag>
        ) : (
          <Text type="secondary">—</Text>
        );
      },
    },
    {
      title: 'Giờ ra',
      key: 'out',
      render: (_: any, r: any) => {
        const val = r.out || r.clockOut;
        return val && val !== '—' ? (
          <Tag color="processing" style={{ fontWeight: 600, borderRadius: 6 }}>
            {val}
          </Tag>
        ) : (
          <Text type="secondary">—</Text>
        );
      },
    },
    {
      title: 'Thời lượng',
      key: 'duration',
      render: (_: any, r: any) => {
        const val = r.duration || (r.totalHours !== undefined ? `${r.totalHours} giờ` : null);
        return val ? <Text strong style={{ color: '#0f766e' }}>{val}</Text> : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => {
        if (s === 'IN_PROGRESS') return <Tag color="processing">Đang trong ca</Tag>;
        if (s === 'ON_TIME') return <Tag color="success">Đúng giờ</Tag>;
        if (s === 'LATE') return <Tag color="warning">Đi muộn</Tag>;
        if (s === 'EARLY_LEAVE') return <Tag color="orange">Về sớm</Tag>;
        return <Tag color="default">Ghi nhận</Tag>;
      },
    },
  ];

  const isCheckedIn = statusData?.isCheckedIn ?? false;
  const isCheckedOut = statusData?.isCheckedOut ?? false;
  const rawClockIn = statusData?.clockInTime || statusData?.firstClockIn;
  const firstInTime = statusData?.checkInTime || (rawClockIn
    ? new Date(rawClockIn).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : null);
  const rawClockOut = statusData?.clockOutTime || statusData?.lastClockOut;
  const lastOutTime = statusData?.checkOutTime || (rawClockOut
    ? new Date(rawClockOut).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : null);

  const dateCellRender = (value: Dayjs) => {
    const isToday = value.isSame(dayjs(), 'day');
    const dateStr = value.format('YYYY-MM-DD');

    if (isToday) {
      return (
        <Badge
          status={isCheckedIn ? 'processing' : isCheckedOut ? 'success' : 'default'}
          text={isCheckedIn ? 'Đang làm việc' : isCheckedOut ? 'Đã hoàn thành' : 'Chưa check-in'}
        />
      );
    }

    const logForDay = historyLogs.find((l) => l.date === dateStr);
    if (logForDay) {
      const inVal = logForDay.in || logForDay.clockIn;
      const outVal = logForDay.out || logForDay.clockOut;
      return (
        <Badge
          status={logForDay.status === 'LATE' ? 'warning' : 'success'}
          text={`${inVal !== '—' ? inVal : '??'} - ${outVal !== '—' ? outVal : '...'}`}
        />
      );
    }

    return null;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Quản lý Chấm công & Giờ làm việc
          </Title>
          <Text type="secondary">
            Ghi nhận thời gian ra vào thực tế, giờ công chuẩn và tạo đơn giải trình sự cố chấm công.
          </Text>
        </div>
        <Button
          icon={<PlusOutlined />}
          type="primary"
          style={{ background: '#059669', borderColor: '#059669' }}
          onClick={() => setIsExplainModalOpen(true)}
        >
          Gửi đơn giải trình công
        </Button>
      </div>

      {/* Top Banner Chấm công trực tiếp (Emerald & Slate) */}
      <Card
        style={{
          marginBottom: 24,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: 14,
          border: 0,
          color: '#ffffff',
          boxShadow: '0 4px 18px rgba(15, 23, 42, 0.25)',
        }}
      >
        <Row justify="space-between" align="middle" gutter={[20, 20]}>
          <Col xs={24} md={9}>
            <Text style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600 }}>
              Đồng hồ chấm công trực tiếp
            </Text>
            <div style={{ fontSize: 40, fontWeight: 800, color: '#f8fafc', fontFamily: 'monospace', margin: '4px 0' }}>
              {currentTime || '08:30:00'}
            </div>
            <Space style={{ color: '#cbd5e1', fontSize: 13 }}>
              <EnvironmentOutlined style={{ color: '#34d399' }} />
              <span>Văn phòng chính (Tầng 4) • Ca Sáng (08:30 - 17:30)</span>
            </Space>
          </Col>

          <Col xs={24} md={7} style={{ textAlign: 'center' }}>
            <Button
              type="primary"
              size="large"
              loading={actionLoading}
              icon={isCheckedIn ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
              onClick={handleCheckInOut}
              style={{
                height: 52,
                padding: '0 36px',
                fontSize: 16,
                fontWeight: 700,
                borderRadius: 12,
                background: isCheckedIn
                  ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                  : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                borderColor: 'transparent',
                boxShadow: isCheckedIn
                  ? '0 6px 18px rgba(239, 68, 68, 0.4)'
                  : '0 6px 18px rgba(16, 185, 129, 0.4)',
              }}
            >
              {isCheckedIn ? 'Check-out Giờ về' : isCheckedOut ? 'Check-in Ca tiếp theo' : 'Check-in Bắt đầu làm'}
            </Button>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 10 }}>
              {isCheckedIn && firstInTime ? (
                <span style={{ color: '#34d399' }}>● Đang làm việc (Vào lúc {firstInTime})</span>
              ) : isCheckedOut && lastOutTime ? (
                <span style={{ color: '#38bdf8' }}>● Đã hoàn thành ca (Ra lúc {lastOutTime})</span>
              ) : (
                'Chưa ghi nhận lượt vào ca hôm nay'
              )}
            </div>
          </Col>

          <Col xs={24} md={8}>
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <div style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '10px 14px', borderRadius: 10 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>Số giờ làm hôm nay</div>
                  <div style={{ color: '#f8fafc', fontSize: 20, fontWeight: 700 }}>
                    {statusData?.workingHours ?? statusData?.workedHours ?? 0} giờ
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '10px 14px', borderRadius: 10 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>Công ghi nhận tháng</div>
                  <div style={{ color: '#34d399', fontSize: 20, fontWeight: 700 }}>{historyLogs.length} ngày công</div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '10px 14px', borderRadius: 10 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>Lượt quẹt hôm nay</div>
                  <div style={{ color: '#f8fafc', fontSize: 20, fontWeight: 700 }}>
                    {statusData?.eventsCount ?? statusData?.todayEventsCount ?? 0} lần
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '10px 14px', borderRadius: 10 }}>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>Giải trình đã duyệt</div>
                  <div style={{ color: '#f8fafc', fontSize: 20, fontWeight: 700 }}>1 đơn</div>
                </div>
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      {/* Lưới Lịch Chấm công và Bảng nhật ký */}
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <CalendarOutlined style={{ color: '#059669' }} />
                <span style={{ fontWeight: 600 }}>Lịch làm việc & Chấm công tháng này</span>
              </Space>
            }
            style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
          >
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <Tag color="success">● Đúng giờ (08:24 - 17:35)</Tag>
              <Tag color="warning">● Quên quẹt thẻ / Đi muộn</Tag>
              <Tag color="processing">● Nghỉ phép năm</Tag>
              <Tag color="default">● Cuối tuần / Ngày lễ</Tag>
            </div>
            <Calendar cellRender={dateCellRender} />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <HistoryOutlined style={{ color: '#059669' }} />
                <span style={{ fontWeight: 600 }}>Lịch sử quẹt thẻ gần nhất</span>
              </Space>
            }
            style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <Spin />
              </div>
            ) : historyLogs.length > 0 ? (
              <Table
                dataSource={historyLogs}
                columns={logColumns}
                pagination={false}
                size="middle"
                rowKey={(record, idx) => record.date || String(idx)}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8' }}>
                <SafetyCertificateOutlined style={{ fontSize: 32, marginBottom: 8, color: '#cbd5e1' }} />
                <div>Chưa có dữ liệu quẹt thẻ gần đây</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Modal Giải trình công */}
      <Modal
        title="Đơn giải trình sự cố chấm công"
        open={isExplainModalOpen}
        onCancel={() => setIsExplainModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsExplainModalOpen(false)}>
            Hủy bỏ
          </Button>,
          <Button
            key="ok"
            type="primary"
            loading={submittingExplain}
            style={{ background: '#059669', borderColor: '#059669' }}
            onClick={() => explainForm.submit()}
          >
            Gửi giải trình lên Quản lý
          </Button>,
        ]}
      >
        <Form form={explainForm} layout="vertical" onFinish={handleExplainSubmit} style={{ marginTop: 16 }}>
          <Form.Item
            name="date"
            label="Ngày phát sinh sự cố"
            rules={[{ required: true, message: 'Vui lòng chọn ngày cần giải trình' }]}
            initialValue={dayjs()}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>

          <Form.Item
            name="issue"
            label="Loại sự cố"
            rules={[{ required: true, message: 'Vui lòng chọn loại sự cố' }]}
            initialValue="Quên quẹt thẻ Check-in đầu ca"
          >
            <Input placeholder="Ví dụ: Quên quẹt thẻ vào, máy chấm công lỗi vân tay, đi muộn do tắc đường..." />
          </Form.Item>

          <Form.Item name="timeRange" label="Khung giờ làm việc thực tế">
            <TimePicker.RangePicker style={{ width: '100%' }} format="HH:mm" />
          </Form.Item>

          <Form.Item
            name="reason"
            label="Lý do chi tiết"
            rules={[{ required: true, message: 'Vui lòng giải thích rõ lý do' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="Giải thích cụ thể lý do phát sinh sự cố để Quản lý và Bộ phận HR xem xét phê duyệt..."
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AttendancePage;
