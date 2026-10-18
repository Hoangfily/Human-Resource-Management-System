import React, { useState } from 'react';
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
  Alert,
  Row,
  Col,
  Tabs,
  Badge,
  App as AntdApp,
  Segmented,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  FileDoneOutlined,
  EyeOutlined,
  StopOutlined,
  SearchOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { RequestStatus, RequestType } from '@hr-agent/shared';
import { MOCK_REQUESTS, MOCK_LEAVE_BALANCE } from '../../lib/mock-data';
import { StatusTag } from '../../components/common';
import { RequestItem } from '../../types';
import { RequestDetailModal } from '../../components/requests';

const { Title, Text, Paragraph } = Typography;

export const RequestsPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [requests, setRequests] = useState<RequestItem[]>(MOCK_REQUESTS);

  // Bộ lọc & tìm kiếm
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Modal xem chi tiết
  const [selectedDetailRequest, setSelectedDetailRequest] = useState<RequestItem | null>(null);

  // Form states cho tạo đơn mới
  const [selectedType, setSelectedType] = useState<RequestType>(RequestType.Leave);
  const [daysCount, setDaysCount] = useState<number>(2);

  const annualLeave = MOCK_LEAVE_BALANCE.balances.find((b) => b.leaveType === 'ANNUAL');

  const handleCreateSubmit = (values: { reason: string; dates?: unknown }) => {
    const newReq: RequestItem = {
      id: `req-00${requests.length + 1}`,
      employeeId: 'emp-001',
      employeeName: 'Nguyễn Văn An',
      employeeCode: 'EMP001',
      departmentName: 'Phòng Công nghệ Thông tin',
      type: selectedType,
      status: RequestStatus.Pending,
      payload: {
        reason: values.reason || 'Xin nghỉ phép',
        daysCount,
      },
      riskLevel: 'LOW',
      aiRiskScore: 0.05,
      aiConfidence: 0.95,
      aiRationale: 'Đơn nộp hợp lệ trước 5 ngày làm việc. Số dư ngày phép còn đủ.',
      aiPolicyFindings: ['Đã gửi trước 5 ngày theo quy chế LEAVE.NOTICE_DAYS', 'Số dư ngày phép còn đủ'],
      approverId: 'mgr-001',
      approverName: 'Trần Thị Bích',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeline: [
        {
          title: 'Tạo yêu cầu',
          actor: 'Nguyễn Văn An',
          actorType: 'HUMAN',
          timestamp: new Date().toLocaleString('vi-VN'),
          description: values.reason,
          status: 'finish',
        },
        {
          title: 'AI Agent Thẩm định',
          actor: 'HR AI Copilot',
          actorType: 'AI',
          timestamp: new Date().toLocaleString('vi-VN'),
          description: 'LOW RISK - Đạt chuẩn quy chế HR',
          status: 'finish',
        },
        {
          title: 'Chờ Quản lý duyệt',
          actor: 'Trần Thị Bích',
          actorType: 'HUMAN',
          timestamp: new Date().toLocaleString('vi-VN'),
          status: 'process',
        },
      ],
    };

    setRequests([newReq, ...requests]);
    message.success('Đã gửi yêu cầu phê duyệt thành công!');
    setActiveTab('list');
  };

  const handleCancelRequest = (id: string) => {
    Modal.confirm({
      title: 'Xác nhận hủy yêu cầu',
      content: `Bạn có chắc chắn muốn hủy yêu cầu #${id}? Thao tác này không thể hoàn tác.`,
      okText: 'Hủy yêu cầu',
      okType: 'danger',
      cancelText: 'Quay lại',
      onOk() {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: RequestStatus.Cancelled,
                  timeline: [
                    ...(r.timeline || []),
                    {
                      title: 'Đã hủy yêu cầu',
                      actor: 'Nguyễn Văn An',
                      actorType: 'HUMAN',
                      timestamp: new Date().toLocaleString('vi-VN'),
                      description: 'Nhân viên chủ động hủy đơn',
                      status: 'error',
                    },
                  ],
                }
              : r
          )
        );
        message.info(`Đã hủy yêu cầu #${id}.`);
      },
    });
  };

  // Lọc danh sách đơn theo tab và ô tìm kiếm
  const filteredRequests = requests.filter((item) => {
    // Lọc theo trạng thái
    if (statusFilter !== 'ALL' && item.status !== statusFilter) {
      return false;
    }
    // Lọc theo từ khóa tìm kiếm
    if (searchKeyword.trim()) {
      const q = searchKeyword.toLowerCase();
      const reason = String((item.payload as Record<string, string>)?.reason || '').toLowerCase();
      return item.id.toLowerCase().includes(q) || reason.includes(q);
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
          {id}
        </Text>
      ),
    },
    {
      title: 'Loại yêu cầu',
      dataIndex: 'type',
      key: 'type',
      render: (type: RequestType) => {
        const labels: Record<string, string> = {
          [RequestType.Leave]: 'Nghỉ phép',
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
        const payload = record.payload as Record<string, string>;
        return (
          <Text ellipsis style={{ maxWidth: 220, display: 'inline-block' }}>
            {payload.reason || '—'}
          </Text>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Quản lý Đơn từ & Yêu cầu
          </Title>
          <Text type="secondary">
            Tạo đơn nghỉ phép, giải trình công, đổi ca và xem xét thẩm định tự động từ AI Agent.
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setActiveTab(activeTab === 'list' ? 'create' : 'list')}
          style={{ background: '#059669', borderColor: '#059669' }}
        >
          {activeTab === 'list' ? 'Tạo đơn mới' : 'Xem danh sách đơn'}
        </Button>
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
              ]}
            />

            <Input
              placeholder="Tìm theo mã đơn hoặc lý do..."
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ width: 260, borderRadius: 8 }}
              allowClear
            />
          </div>

          <Table
            dataSource={filteredRequests}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 6 }}
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
              <Form layout="vertical" onFinish={handleCreateSubmit}>
                <Form.Item label="Loại yêu cầu" required>
                  <Select
                    value={selectedType}
                    onChange={(val) => setSelectedType(val)}
                    options={[
                      { value: RequestType.Leave, label: 'Nghỉ phép (Phép năm / Nghỉ ốm)' },
                      { value: RequestType.AttendanceExplanation, label: 'Giải trình quên quẹt thẻ / Đi muộn' },
                      { value: RequestType.ShiftChange, label: 'Đổi ca làm việc' },
                    ]}
                  />
                </Form.Item>

                <Row gutter={16}>
                  <Col xs={24} sm={16}>
                    <Form.Item label="Thời gian áp dụng" required>
                      <DatePicker.RangePicker style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item label="Số ngày nghỉ tính toán">
                      <Input
                        value={`${daysCount} ngày`}
                        readOnly
                        style={{ background: '#f8fafc', fontWeight: 600, color: '#065f46' }}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item
                  label="Lý do chi tiết"
                  name="reason"
                  rules={[{ required: true, message: 'Vui lòng nhập lý do!' }]}
                >
                  <Input.TextArea rows={4} placeholder="Nhập lý do cụ thể gửi cấp quản lý phê duyệt..." />
                </Form.Item>

                <Space size={12}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    size="large"
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
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 10,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#166534', fontWeight: 600, marginBottom: 8 }}>
                  <CheckCircleOutlined style={{ fontSize: 16 }} />
                  Đủ điều kiện gửi phê duyệt
                </div>
                <div style={{ fontSize: 13, color: '#14532d', lineHeight: 1.6 }}>
                  Hệ thống AI đã tự động đối soát với Quy chế Nhân sự công ty (Điều 4.2).
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text type="secondary">Phép năm hiện tại:</Text>
                  <Text strong>{annualLeave?.availableDays ?? 10} ngày</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text type="secondary">Số ngày yêu cầu:</Text>
                  <Text strong style={{ color: '#059669' }}>- {daysCount} ngày</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px dashed #cbd5e1' }}>
                  <Text strong>Số dư sau khi nghỉ:</Text>
                  <Text strong style={{ color: '#065f46' }}>{(annualLeave?.availableDays ?? 10) - daysCount} ngày</Text>
                </div>
              </div>

              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge status="success" />
                  <Text style={{ fontSize: 13 }}>Thời gian gửi trước: <strong>5 ngày</strong> (yêu cầu ≥ 3 ngày)</Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge status="success" />
                  <Text style={{ fontSize: 13 }}>Không trùng lịch trực bận của phòng ban</Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge status="success" />
                  <Text style={{ fontSize: 13 }}>Độ rủi ro AI: <strong>0.05 (Rất an toàn)</strong></Text>
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
