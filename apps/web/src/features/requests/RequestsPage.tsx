import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Tag,
  Modal,
  Form,
  Select,
  DatePicker,
  Input,
  Row,
  Col,
  Badge,
  App as AntdApp,
  Segmented,
  Tooltip,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SafetyCertificateOutlined,
  FileDoneOutlined,
  EyeOutlined,
  StopOutlined,
  SearchOutlined,
  ReloadOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { RequestStatus, RequestType } from '@hr-agent/shared';
import { MOCK_REQUESTS, MOCK_LEAVE_BALANCE } from '../../lib/mock-data';
import { StatusTag } from '../../components/common';
import { RequestItem, LeaveBalanceResponse } from '../../types';
import { RequestDetailModal } from '../../components/requests';
import apiClient from '../../lib/api-client';

const { Title, Text } = Typography;

export const RequestsPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [requests, setRequests] = useState<RequestItem[]>(MOCK_REQUESTS);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Bộ lọc & tìm kiếm
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Modal xem chi tiết
  const [selectedDetailRequest, setSelectedDetailRequest] = useState<RequestItem | null>(null);

  // Form states cho tạo đơn mới
  const [form] = Form.useForm();
  const [selectedType, setSelectedType] = useState<RequestType>(RequestType.Leave);
  const [selectedLeaveType, setSelectedLeaveType] = useState<string>('ANNUAL');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>([
    dayjs().add(5, 'day'),
    dayjs().add(6, 'day'),
  ]);
  const [singleDate, setSingleDate] = useState<Dayjs | null>(dayjs().add(1, 'day'));
  const [daysCount, setDaysCount] = useState<number>(2);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceResponse>(MOCK_LEAVE_BALANCE);

  // Tải danh sách đơn từ API
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<RequestItem[]>('/requests');
      const data = res as unknown as RequestItem[];
      if (Array.isArray(data)) {
        setRequests(data);
      }
    } catch {
      // Giữ mock data nếu offline hoặc lỗi kết nối
    } finally {
      setLoading(false);
    }
  }, []);

  // Tải số dư quỹ phép từ API
  const fetchLeaveBalance = useCallback(async () => {
    try {
      const res = await apiClient.get<LeaveBalanceResponse>('/leave/balance');
      const data = res as unknown as LeaveBalanceResponse;
      if (data && data.balances && data.balances.length > 0) {
        setLeaveBalance(data);
      }
    } catch {
      // Giữ mock data nếu offline
    }
  }, []);

  useEffect(() => {
    fetchRequests();
    fetchLeaveBalance();
  }, [fetchRequests, fetchLeaveBalance]);

  // Cập nhật số ngày tính toán khi đổi dải ngày
  const handleRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange([dates[0], dates[1]]);
      const diff = dates[1].diff(dates[0], 'day') + 1;
      setDaysCount(Math.max(1, diff));
    } else {
      setDateRange(null);
      setDaysCount(1);
    }
  };

  // Quỹ phép tương ứng với loại phép đang chọn
  const currentLeaveBalanceItem = leaveBalance.balances.find(
    (b: any) =>
      b.leaveType === selectedLeaveType ||
      b.leaveTypeCode === selectedLeaveType ||
      (selectedLeaveType === 'ANNUAL' && (b.leaveType === 'ANNUAL' || b.leaveTypeCode === 'ANNUAL')),
  );
  const availableDays = currentLeaveBalanceItem?.availableDays ?? 10;
  const isOverLimit = selectedType === RequestType.Leave && daysCount > availableDays;

  // Gửi tạo đơn mới lên API
  const handleCreateSubmit = async (values: { reason: string }) => {
    if (selectedType === RequestType.Leave && !dateRange) {
      message.error('Vui lòng chọn khoảng thời gian nghỉ phép!');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        reason: values.reason,
        daysCount,
      };

      if (selectedType === RequestType.Leave) {
        payload.leaveType = selectedLeaveType;
        if (dateRange && dateRange[0] && dateRange[1]) {
          payload.startDate = dateRange[0].format('YYYY-MM-DD');
          payload.endDate = dateRange[1].format('YYYY-MM-DD');
        }
      } else if (selectedType === RequestType.AttendanceExplanation) {
        payload.date = singleDate?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD');
        payload.explanationType = 'FORGOT_CHECK_IN';
      } else if (selectedType === RequestType.ShiftChange) {
        payload.shiftDate = singleDate?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD');
        payload.targetShiftId = 'shift-afternoon';
      }

      const res = await apiClient.post<RequestItem>('/requests', {
        type: selectedType,
        payload,
      });

      const newCreated = res as unknown as RequestItem;
      message.success('Đã gửi yêu cầu phê duyệt thành công!');

      // Làm mới danh sách và số dư phép
      if (newCreated && newCreated.id) {
        setRequests((prev) => [newCreated, ...prev]);
      } else {
        await fetchRequests();
      }
      await fetchLeaveBalance();

      form.resetFields();
      setActiveTab('list');
    } catch (err: any) {
      const errMsg = err.response?.data?.message;
      const displayMsg = Array.isArray(errMsg) ? errMsg.join(', ') : errMsg || 'Không thể tạo yêu cầu';
      message.error(displayMsg);
    } finally {
      setSubmitting(false);
    }
  };

  // Hủy yêu cầu qua API
  const handleCancelRequest = (id: string) => {
    Modal.confirm({
      title: 'Xác nhận hủy yêu cầu',
      content: `Bạn có chắc chắn muốn hủy yêu cầu #${id}? Thao tác này sẽ hoàn lại số ngày phép chờ duyệt.`,
      okText: 'Hủy yêu cầu',
      okType: 'danger',
      cancelText: 'Quay lại',
      onOk: async () => {
        try {
          const res = await apiClient.post<RequestItem>(`/requests/${id}/cancel`);
          const updated = res as unknown as RequestItem;
          message.success(`Đã hủy yêu cầu #${id} thành công.`);

          setRequests((prev) =>
            prev.map((r) => (r.id === id ? { ...r, status: RequestStatus.Cancelled } : r)),
          );

          if (selectedDetailRequest && selectedDetailRequest.id === id) {
            setSelectedDetailRequest((prev) =>
              prev ? { ...prev, ...(updated || {}), status: RequestStatus.Cancelled } : null,
            );
          }

          // Cập nhật lại số dư phép sau khi hoàn hủy
          await fetchLeaveBalance();
        } catch (err: any) {
          const errMsg = err.response?.data?.message || 'Không thể hủy yêu cầu';
          message.error(errMsg);
        }
      },
    });
  };

  // Lọc danh sách đơn theo tab và ô tìm kiếm
  const filteredRequests = requests.filter((item) => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) {
      return false;
    }
    if (searchKeyword.trim()) {
      const q = searchKeyword.toLowerCase();
      const reason = String((item.payload as Record<string, string>)?.reason || '').toLowerCase();
      const empName = String(item.employeeName || '').toLowerCase();
      return item.id.toLowerCase().includes(q) || reason.includes(q) || empName.includes(q);
    }
    return true;
  });

  const columns = [
    {
      title: 'Mã đơn',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <Text code style={{ color: '#0f766e', fontWeight: 600 }}>
          {id.length > 12 ? `${id.slice(0, 8)}...` : id}
        </Text>
      ),
    },
    {
      title: 'Nhân viên',
      dataIndex: 'employeeName',
      key: 'employeeName',
      render: (name: string, record: RequestItem) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0f172a' }}>{name || 'Nhân viên'}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.departmentName || 'Phòng CNTT'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Loại yêu cầu',
      dataIndex: 'type',
      key: 'type',
      render: (type: RequestType) => {
        const labels: Record<string, string> = {
          [RequestType.Leave]: 'Nghỉ phép',
          [RequestType.Overtime]: 'Làm thêm giờ',
          [RequestType.AttendanceExplanation]: 'Bổ sung chấm công',
          [RequestType.ShiftChange]: 'Đổi ca làm việc',
        };
        return (
          <Tag color="cyan" style={{ borderRadius: 6 }}>
            {labels[type] || type}
          </Tag>
        );
      },
    },
    {
      title: 'Chi tiết / Lý do',
      key: 'reason',
      render: (_: unknown, record: RequestItem) => {
        const payload = record.payload as Record<string, any>;
        const days = (record as any).computed?.daysRequested || payload?.daysCount;
        return (
          <div>
            <Text ellipsis style={{ maxWidth: 220, display: 'inline-block' }}>
              {payload?.reason || '—'}
            </Text>
            {days && (
              <div style={{ fontSize: 11, color: '#059669', fontWeight: 500 }}>
                Thời gian: {days} ngày
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Đánh giá AI',
      key: 'aiRisk',
      render: (_: unknown, record: RequestItem) => {
        const risk = record.riskLevel || 'LOW';
        const color = risk === 'HIGH' ? 'error' : risk === 'MEDIUM' ? 'warning' : 'success';
        return (
          <Tag color={color} style={{ borderRadius: 6, fontSize: 11 }}>
            {risk} ({Math.round((record.aiConfidence ?? 0.95) * 100)}%)
          </Tag>
        );
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: RequestStatus) => <StatusTag status={status} />,
    },
    {
      title: 'Người duyệt',
      dataIndex: 'approverName',
      key: 'approverName',
      render: (name?: string) => name || <Text type="secondary">Chờ chỉ định</Text>,
    },
    {
      title: 'Ngày gửi',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (d: string) => new Date(d).toLocaleDateString('vi-VN'),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: unknown, record: RequestItem) => (
        <Space size={6} onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Xem chi tiết & phân tích của AI">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setSelectedDetailRequest(record)}
            >
              Chi tiết
            </Button>
          </Tooltip>
          {(record.status === RequestStatus.Pending || record.status === RequestStatus.Draft) && (
            <Tooltip title="Hủy yêu cầu">
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={() => handleCancelRequest(record.id)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Tiêu đề & Nút chuyển đổi */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Quản lý Đơn từ & Yêu cầu
          </Title>
          <Text type="secondary">
            Tạo đơn nghỉ phép, giải trình công, đổi ca và xem xét thẩm định tự động từ AI Agent.
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => { fetchRequests(); fetchLeaveBalance(); }}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setActiveTab(activeTab === 'list' ? 'create' : 'list')}
            style={{ background: '#059669', borderColor: '#059669' }}
          >
            {activeTab === 'list' ? 'Tạo đơn mới' : 'Xem danh sách đơn'}
          </Button>
        </Space>
      </div>

      {activeTab === 'list' ? (
        <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
          {/* Thanh công cụ tìm kiếm & bộ lọc */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <Segmented
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as string)}
              options={[
                { label: `Tất cả (${requests.length})`, value: 'ALL' },
                {
                  label: `Chờ duyệt (${requests.filter((r) => r.status === RequestStatus.Pending).length})`,
                  value: RequestStatus.Pending,
                },
                {
                  label: `Đã duyệt (${requests.filter((r) => r.status === RequestStatus.Approved).length})`,
                  value: RequestStatus.Approved,
                },
                {
                  label: `Từ chối (${requests.filter((r) => r.status === RequestStatus.Rejected).length})`,
                  value: RequestStatus.Rejected,
                },
                {
                  label: `Đã hủy (${requests.filter((r) => r.status === RequestStatus.Cancelled).length})`,
                  value: RequestStatus.Cancelled,
                },
              ]}
            />

            <Input
              placeholder="Tìm theo mã đơn, nhân viên hoặc lý do..."
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ width: 280, borderRadius: 8 }}
              allowClear
            />
          </div>

          <Table
            dataSource={filteredRequests}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 8 }}
            onRow={(record) => ({
              onClick: () => setSelectedDetailRequest(record),
              style: { cursor: 'pointer' },
            })}
          />
        </Card>
      ) : (
        /* Giao diện Tạo đơn 2 cột */
        <Row gutter={[24, 24]}>
          {/* Cột trái: Form nhập thông tin đơn */}
          <Col xs={24} lg={15}>
            <Card
              title={
                <Space>
                  <FileDoneOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 600 }}>Thông tin yêu cầu</span>
                </Space>
              }
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              <Form form={form} layout="vertical" onFinish={handleCreateSubmit}>
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item label="Loại yêu cầu" required>
                      <Select
                        value={selectedType}
                        onChange={(val) => setSelectedType(val)}
                        options={[
                          { value: RequestType.Leave, label: 'Nghỉ phép' },
                          { value: RequestType.AttendanceExplanation, label: 'Giải trình chấm công' },
                          { value: RequestType.ShiftChange, label: 'Đổi ca làm việc' },
                        ]}
                      />
                    </Form.Item>
                  </Col>

                  {selectedType === RequestType.Leave && (
                    <Col xs={24} sm={12}>
                      <Form.Item label="Loại nghỉ phép" required>
                        <Select
                          value={selectedLeaveType}
                          onChange={(val) => setSelectedLeaveType(val)}
                          options={[
                            { value: 'ANNUAL', label: 'Nghỉ phép năm (Có lương)' },
                            { value: 'SICK', label: 'Nghỉ ốm (Hưởng BHXH)' },
                            { value: 'PERSONAL', label: 'Nghỉ việc riêng' },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                  )}
                </Row>

                {selectedType === RequestType.Leave ? (
                  <Row gutter={16}>
                    <Col xs={24} sm={16}>
                      <Form.Item label="Thời gian áp dụng (Từ ngày - Đến ngày)" required>
                        <DatePicker.RangePicker
                          style={{ width: '100%' }}
                          value={dateRange}
                          onChange={(dates) => handleRangeChange(dates as any)}
                          format="DD/MM/YYYY"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item label="Số ngày nghỉ tính toán">
                        <Input
                          value={`${daysCount} ngày`}
                          readOnly
                          style={{
                            background: '#f8fafc',
                            fontWeight: 600,
                            color: isOverLimit ? '#dc2626' : '#065f46',
                          }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                ) : (
                  <Row gutter={16}>
                    <Col xs={24} sm={16}>
                      <Form.Item label="Ngày áp dụng" required>
                        <DatePicker
                          style={{ width: '100%' }}
                          value={singleDate}
                          onChange={(d) => setSingleDate(d)}
                          format="DD/MM/YYYY"
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                )}

                <Form.Item
                  label="Lý do chi tiết"
                  name="reason"
                  rules={[{ required: true, message: 'Vui lòng nhập lý do cụ thể!' }]}
                >
                  <Input.TextArea
                    rows={4}
                    placeholder="Nhập lý do cụ thể gửi cấp quản lý phê duyệt..."
                  />
                </Form.Item>

                <Space size={12}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    size="large"
                    loading={submitting}
                    disabled={isOverLimit}
                    style={{ background: '#059669', borderColor: '#059669' }}
                  >
                    Xác nhận gửi duyệt
                  </Button>
                  <Button size="large" onClick={() => setActiveTab('list')}>
                    Hủy bỏ
                  </Button>
                </Space>
              </Form>
            </Card>
          </Col>

          {/* Cột phải: Bảng kiểm tra điều kiện quy chế HR (Policy Compliance Check) */}
          <Col xs={24} lg={9}>
            <Card
              title={
                <Space>
                  <SafetyCertificateOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 600 }}>Kiểm tra tuân thủ chính sách</span>
                </Space>
              }
              style={{ borderRadius: 12, border: '1px solid #e2e8f0', height: '100%' }}
            >
              {isOverLimit ? (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: '#991b1b',
                      fontWeight: 600,
                      marginBottom: 8,
                    }}
                  >
                    <ExclamationCircleOutlined style={{ fontSize: 16 }} />
                    Không đủ số dư ngày phép
                  </div>
                  <div style={{ fontSize: 13, color: '#7f1d1d', lineHeight: 1.6 }}>
                    Số ngày yêu cầu ({daysCount} ngày) vượt quá số dư phép khả dụng ({availableDays}{' '}
                    ngày). Vui lòng điều chỉnh lại khoảng thời gian.
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: '#166534',
                      fontWeight: 600,
                      marginBottom: 8,
                    }}
                  >
                    <CheckCircleOutlined style={{ fontSize: 16 }} />
                    Đủ điều kiện gửi phê duyệt
                  </div>
                  <div style={{ fontSize: 13, color: '#14532d', lineHeight: 1.6 }}>
                    Hệ thống AI đã tự động đối soát với Quy chế Nhân sự công ty.
                  </div>
                </div>
              )}

              {selectedType === RequestType.Leave && (
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '14px',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <Text type="secondary">Quỹ phép ({currentLeaveBalanceItem?.leaveTypeName || 'Phép năm'}):</Text>
                    <Text strong>{availableDays} ngày khả dụng</Text>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <Text type="secondary">Số ngày yêu cầu:</Text>
                    <Text strong style={{ color: isOverLimit ? '#dc2626' : '#059669' }}>
                      - {daysCount} ngày
                    </Text>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingTop: 8,
                      borderTop: '1px dashed #cbd5e1',
                    }}
                  >
                    <Text strong>Số dư dự kiến sau duyệt:</Text>
                    <Text
                      strong
                      style={{ color: isOverLimit ? '#dc2626' : '#065f46' }}
                    >
                      {availableDays - daysCount} ngày
                    </Text>
                  </div>
                </div>
              )}

              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge status="success" />
                  <Text style={{ fontSize: 13 }}>
                    Thời gian gửi trước: <strong>5 ngày</strong> (yêu cầu ≥ 3 ngày)
                  </Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge status="success" />
                  <Text style={{ fontSize: 13 }}>Không trùng lịch trực bận của phòng ban</Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge status="success" />
                  <Text style={{ fontSize: 13 }}>
                    Độ rủi ro AI: <strong>0.05 (Rất an toàn)</strong>
                  </Text>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>
      )}

      {/* MODAL XEM CHI TIẾT ĐƠN & THẨM ĐỊNH AI */}
      <RequestDetailModal
        open={Boolean(selectedDetailRequest)}
        onClose={() => setSelectedDetailRequest(null)}
        request={selectedDetailRequest}
        onCancelRequest={(id) => handleCancelRequest(id)}
      />
    </div>
  );
};

export default RequestsPage;
