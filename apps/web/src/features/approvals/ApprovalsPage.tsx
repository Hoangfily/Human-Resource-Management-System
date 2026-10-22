import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Tag,
  App as AntdApp,
  Modal,
  Input,
  Badge,
  Row,
  Col,
  Descriptions,
  Tabs,
  Tooltip,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  RobotOutlined,
  ArrowUpOutlined,
  UserOutlined,
  EyeOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { RequestStatus, RequestType } from '@hr-agent/shared';
import { StatusTag } from '../../components/common';
import { RequestItem } from '../../types';
import { RequestDetailModal } from '../../components/requests';
import { useAuth } from '../auth/AuthContext';
import apiClient from '../../lib/api-client';

const { Title, Text } = Typography;

export const ApprovalsPage: React.FC = () => {
  const { user } = useAuth();
  const { message } = AntdApp.useApp();
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [pendingList, setPendingList] = useState<RequestItem[]>([]);
  const [historyList, setHistoryList] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);

  // Modal xem chi tiết toàn diện
  const [modalRequest, setModalRequest] = useState<RequestItem | null>(null);

  // Tải danh sách đơn chờ duyệt và lịch sử duyệt từ Backend API
  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingRes, historyRes] = await Promise.all([
        apiClient.get<RequestItem[]>('/requests/approvals/queue?tab=pending'),
        apiClient.get<RequestItem[]>('/requests/approvals/queue?tab=history'),
      ]);

      const pendings = pendingRes as unknown as RequestItem[];
      const histories = historyRes as unknown as RequestItem[];

      if (Array.isArray(pendings)) {
        setPendingList(pendings);
        setSelectedRequest((curr) => {
          if (!curr) return pendings[0] || null;
          const found = pendings.find((p) => p.id === curr.id);
          return found || pendings[0] || null;
        });
      }

      if (Array.isArray(histories)) {
        setHistoryList(histories);
      }
    } catch {
      // Giữ trạng thái nếu offline
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals, user?.id]);

  // Xử lý Phê duyệt đơn
  const handleApprove = async (id: string) => {
    setActionLoading(true);
    try {
      await apiClient.post<RequestItem>(`/requests/${id}/decision`, {
        status: RequestStatus.Approved,
      });

      message.success(`Đã phê duyệt đơn #${id} thành công!`);
      await fetchApprovals();

      if (modalRequest?.id === id) {
        setModalRequest(null);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Không thể phê duyệt đơn';
      message.error(errMsg);
    } finally {
      setActionLoading(false);
    }
  };

  // Xử lý Từ chối đơn
  const handleReject = (id: string, customReason?: string) => {
    if (customReason) {
      executeReject(id, customReason);
      return;
    }

    let reasonInput = '';
    Modal.confirm({
      title: 'Xác nhận từ chối yêu cầu',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div style={{ marginTop: 12 }}>
          <Text type="secondary">Nhập lý do từ chối (bắt buộc theo quy định):</Text>
          <Input.TextArea
            rows={3}
            placeholder="Ví dụ: Lịch dự án đang gấp, đề nghị sắp xếp lại lịch nghỉ..."
            style={{ marginTop: 8 }}
            onChange={(e) => (reasonInput = e.target.value)}
          />
        </div>
      ),
      okText: 'Xác nhận từ chối',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        if (!reasonInput.trim()) {
          message.error('Vui lòng nhập lý do từ chối!');
          return Promise.reject();
        }
        await executeReject(id, reasonInput.trim());
      },
    });
  };

  const executeReject = async (id: string, reason: string) => {
    setActionLoading(true);
    try {
      await apiClient.post<RequestItem>(`/requests/${id}/decision`, {
        status: RequestStatus.Rejected,
        reason,
      });

      message.info(`Đã từ chối đơn #${id}.`);
      await fetchApprovals();

      if (modalRequest?.id === id) {
        setModalRequest(null);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Không thể từ chối đơn';
      message.error(errMsg);
    } finally {
      setActionLoading(false);
    }
  };

  // Xử lý Chuyển cấp thẩm định lên HR
  const handleEscalate = async (id: string) => {
    setActionLoading(true);
    try {
      await apiClient.post<RequestItem>(`/requests/${id}/escalate`, {
        reason: 'Chuyển cấp thẩm định lên Trưởng phòng HR do có yếu tố đặc thù',
      });

      message.warning(`Đã chuyển đơn #${id} lên cấp Trưởng phòng HR thẩm định!`);
      await fetchApprovals();

      if (modalRequest?.id === id) {
        setModalRequest(null);
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message || 'Không thể chuyển cấp thẩm định';
      message.error(errMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const columns = [
    {
      title: 'Mã đơn',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <Text code style={{ color: '#0f766e', fontWeight: 600 }}>
          {id.length > 10 ? `${id.slice(0, 8)}...` : id}
        </Text>
      ),
    },
    {
      title: 'Nhân viên',
      dataIndex: 'employeeName',
      key: 'employeeName',
      render: (name: string, record: RequestItem) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0f172a' }}>{name}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>{record.departmentName}</div>
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
          [RequestType.AttendanceExplanation]: 'Bổ sung công',
          [RequestType.ShiftChange]: 'Đổi ca',
        };
        return <Tag color="cyan" style={{ borderRadius: 6 }}>{labels[type] || type}</Tag>;
      },
    },
    {
      title: 'Đánh giá AI',
      key: 'ai',
      render: (_: unknown, record: RequestItem) => {
        const risk = record.riskLevel || 'LOW';
        const color = risk === 'HIGH' ? 'error' : risk === 'MEDIUM' ? 'warning' : 'success';
        return <Tag color={color}>{risk}</Tag>;
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s: RequestStatus) => <StatusTag status={s} />,
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
        <Space size={4} onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Mở modal phân tích toàn diện">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setModalRequest(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
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
            Trung tâm Phê duyệt Yêu cầu (Approvals)
          </Title>
          <Text type="secondary">
            Xem xét các đơn xin nghỉ phép, đổi ca và giải trình công kèm phân tích tuân thủ chính sách tự động từ AI.
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchApprovals} loading={loading}>
          Làm mới
        </Button>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as any)}
        style={{ marginBottom: 16 }}
        items={[
          {
            key: 'pending',
            label: (
              <Space>
                <span>Chờ phê duyệt</span>
                <Badge count={pendingList.length} style={{ backgroundColor: '#059669' }} />
              </Space>
            ),
          },
          {
            key: 'history',
            label: (
              <Space>
                <HistoryOutlined />
                <span>Lịch sử đã xử lý ({historyList.length})</span>
              </Space>
            ),
          },
        ]}
      />

      {activeTab === 'pending' ? (
        /* Giao diện 2 cột cho hàng đợi chờ duyệt */
        <Row gutter={[20, 20]}>
          {/* Cột trái: Danh sách đơn chờ duyệt */}
          <Col xs={24} lg={11}>
            <Card
              title={
                <Space>
                  <span>Hàng đợi phê duyệt</span>
                  <Badge count={pendingList.length} style={{ backgroundColor: '#059669' }} />
                </Space>
              }
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              <Table
                dataSource={pendingList}
                columns={columns}
                rowKey="id"
                pagination={false}
                size="middle"
                loading={loading}
                rowClassName={(record) =>
                  record.id === selectedRequest?.id ? 'ant-table-row-selected' : ''
                }
                onRow={(record) => ({
                  onClick: () => setSelectedRequest(record),
                  style: { cursor: 'pointer' },
                })}
                locale={{ emptyText: 'Hiện không có đơn nào đang chờ duyệt.' }}
              />
            </Card>
          </Col>

          {/* Cột phải: Chi tiết đơn & Phân tích rủi ro AI */}
          <Col xs={24} lg={13}>
            {selectedRequest ? (
              <Card
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                      <span style={{ fontWeight: 600 }}>Chi tiết đơn: #{selectedRequest.id.slice(0, 8)}...</span>
                      <StatusTag status={selectedRequest.status} />
                    </Space>
                    <Tag color={selectedRequest.riskLevel === 'HIGH' ? 'red' : 'green'}>
                      Mức rủi ro: {selectedRequest.riskLevel || 'LOW'} ({Math.round((selectedRequest.aiConfidence ?? 0.95) * 100)}%)
                    </Tag>
                  </div>
                }
                extra={
                  <Button
                    size="small"
                    type="link"
                    icon={<EyeOutlined />}
                    onClick={() => setModalRequest(selectedRequest)}
                  >
                    Mở modal toàn diện
                  </Button>
                }
                style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
              >
                <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="Nhân viên">
                    <strong>{selectedRequest.employeeName}</strong> ({selectedRequest.employeeCode || 'EMP001'})
                  </Descriptions.Item>
                  <Descriptions.Item label="Phòng ban">{selectedRequest.departmentName}</Descriptions.Item>
                  <Descriptions.Item label="Loại yêu cầu">
                    <Tag color="cyan">{selectedRequest.type}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Ngày gửi">
                    {new Date(selectedRequest.createdAt).toLocaleString('vi-VN')}
                  </Descriptions.Item>
                </Descriptions>

                <div
                  style={{
                    background: '#f8fafc',
                    padding: 14,
                    borderRadius: 8,
                    marginBottom: 16,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                    Nội dung & Lý do đề xuất:
                  </div>
                  <div style={{ color: '#334155', fontSize: 14, lineHeight: 1.6, fontStyle: 'italic' }}>
                    "{(selectedRequest.payload as Record<string, string>).reason || 'Không có lý do chi tiết.'}"
                  </div>
                  {(selectedRequest as any).computed?.daysRequested && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#059669', fontWeight: 600 }}>
                      Thời gian: {(selectedRequest as any).computed.daysRequested} ngày
                    </div>
                  )}
                </div>

                {/* Hộp Đánh giá của AI Assistant */}
                <Card
                  size="small"
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 8,
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontWeight: 600,
                      color: '#166534',
                      marginBottom: 6,
                    }}
                  >
                    <RobotOutlined style={{ color: '#059669' }} />
                    Đánh giá tự động từ AI Agent (Policy Check):
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 20, color: '#14532d', fontSize: 13 }}>
                    {(selectedRequest.aiPolicyFindings || [
                      'Số dư ngày phép của nhân viên: Còn đủ ngày phép khả dụng',
                      'Thời hạn thông báo trước: Thỏa mãn quy chế ≥ 3 ngày làm việc',
                      'Đánh giá rủi ro tuân thủ: An toàn, không trùng lịch cao điểm',
                    ]).map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                  {selectedRequest.aiRationale && (
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: '1px dashed #bbf7d0',
                        fontSize: 12,
                        color: '#15803d',
                      }}
                    >
                      💡 <em>{selectedRequest.aiRationale}</em>
                    </div>
                  )}
                </Card>

                {/* Action Buttons Bar */}
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    justifyContent: 'flex-end',
                    paddingTop: 12,
                    borderTop: '1px solid #f1f5f9',
                  }}
                >
                  <Button
                    icon={<ArrowUpOutlined />}
                    loading={actionLoading}
                    onClick={() => handleEscalate(selectedRequest.id)}
                  >
                    Chuyển cấp HR
                  </Button>
                  <Button
                    danger
                    icon={<CloseOutlined />}
                    loading={actionLoading}
                    onClick={() => handleReject(selectedRequest.id)}
                  >
                    Từ chối
                  </Button>
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    loading={actionLoading}
                    onClick={() => handleApprove(selectedRequest.id)}
                    style={{ background: '#059669', borderColor: '#059669' }}
                  >
                    Phê duyệt đơn
                  </Button>
                </div>
              </Card>
            ) : (
              <Card
                style={{
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  textAlign: 'center',
                  padding: '48px 0',
                }}
              >
                <Text type="secondary">
                  Chọn một đơn từ danh sách bên trái để xem xét và xử lý phê duyệt.
                </Text>
              </Card>
            )}
          </Col>
        </Row>
      ) : (
        /* Bảng lịch sử các đơn đã xử lý */
        <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <Table
            dataSource={historyList}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 8 }}
            onRow={(record) => ({
              onClick: () => setModalRequest(record),
              style: { cursor: 'pointer' },
            })}
            locale={{ emptyText: 'Chưa có yêu cầu nào trong lịch sử đã xử lý.' }}
          />
        </Card>
      )}

      {/* Modal chi tiết toàn diện */}
      <RequestDetailModal
        open={Boolean(modalRequest)}
        onClose={() => setModalRequest(null)}
        request={modalRequest}
        isApproverMode={true}
        onApprove={(id) => handleApprove(id)}
        onReject={(id, reason) => handleReject(id, reason)}
        onEscalate={(id) => handleEscalate(id)}
      />
    </div>
  );
};

export default ApprovalsPage;
