import React, { useState } from 'react';
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
  Divider,
  Alert,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  RobotOutlined,
  ArrowUpOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { RequestStatus, RequestType } from '@hr-agent/shared';
import { MOCK_REQUESTS } from '../../lib/mock-data';
import { StatusTag } from '../../components/common';
import { RequestItem } from '../../types';

const { Title, Text, Paragraph } = Typography;

export const ApprovalsPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [pendingList, setPendingList] = useState<RequestItem[]>(
    MOCK_REQUESTS.filter((r) => r.status === RequestStatus.Pending)
  );
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(
    pendingList[0] || null
  );

  const handleApprove = (id: string) => {
    setPendingList((prev) => prev.filter((r) => r.id !== id));
    setSelectedRequest(null);
    message.success(`Đã phê duyệt đơn ${id} thành công!`);
  };

  const handleReject = (id: string) => {
    Modal.confirm({
      title: 'Xác nhận từ chối yêu cầu',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div style={{ marginTop: 12 }}>
          <Text>Nhập lý do từ chối (bắt buộc):</Text>
          <Input.TextArea rows={3} placeholder="Ví dụ: Lịch dự án đang gấp, đề nghị dời sang tuần sau..." style={{ marginTop: 8 }} />
        </div>
      ),
      okText: 'Xác nhận từ chối',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk() {
        setPendingList((prev) => prev.filter((r) => r.id !== id));
        setSelectedRequest(null);
        message.info(`Đã từ chối đơn ${id}.`);
      },
    });
  };

  const handleEscalate = (id: string) => {
    setPendingList((prev) => prev.filter((r) => r.id !== id));
    setSelectedRequest(null);
    message.warning(`Đã chuyển đơn ${id} lên cấp Trưởng phòng HR thẩm định!`);
  };

  const columns = [
    {
      title: 'Mã đơn',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => <Text code style={{ color: '#0f766e', fontWeight: 600 }}>{id}</Text>,
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
          [RequestType.AttendanceExplanation]: 'Bổ sung công',
          [RequestType.ShiftChange]: 'Đổi ca',
        };
        return <Tag color="cyan" style={{ borderRadius: 6 }}>{labels[type] || type}</Tag>;
      },
    },
    {
      title: 'Ngày gửi',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (d: string) => new Date(d).toLocaleDateString('vi-VN'),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0 }}>
          Trung tâm Phê duyệt Yêu cầu (Approvals)
        </Title>
        <Text type="secondary">
          Xem xét các đơn xin nghỉ phép, đổi ca và giải trình công kèm phân tích tuân thủ chính sách từ AI.
        </Text>
      </div>

      {/* 2-Column Approval Interface (Screen 7 trong thiết kế) */}
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
              rowClassName={(record) => (record.id === selectedRequest?.id ? 'ant-table-row-selected' : '')}
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
                    <span style={{ fontWeight: 600 }}>Chi tiết đơn: {selectedRequest.id}</span>
                    <StatusTag status={selectedRequest.status} />
                  </Space>
                  <Tag color="green">Mức độ rủi ro: 5% (Thấp)</Tag>
                </div>
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

              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, marginBottom: 18, border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>Nội dung & Lý do đề xuất:</div>
                <div style={{ color: '#334155', fontSize: 14, lineHeight: 1.6 }}>
                  {(selectedRequest.payload as Record<string, string>).reason || 'Không có lý do chi tiết.'}
                </div>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: '#166534', marginBottom: 6 }}>
                  <RobotOutlined style={{ color: '#059669' }} />
                  Đánh giá tự động từ AI Agent (Policy Check):
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#14532d', fontSize: 13 }}>
                  <li>Số dư ngày phép của nhân viên: <strong>Còn 10 ngày (Đủ điều kiện trừ 2 ngày)</strong>.</li>
                  <li>Thời hạn thông báo trước: <strong>5 ngày (Thỏa mãn quy chế ≥ 3 ngày)</strong>.</li>
                  <li>Tỷ lệ nhân sự còn lại của phòng ban trong ngày này: <strong>100% (Không ảnh hưởng tiến độ)</strong>.</li>
                </ul>
              </Card>

              {/* Action Buttons Bar */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                <Button
                  icon={<ArrowUpOutlined />}
                  onClick={() => handleEscalate(selectedRequest.id)}
                >
                  Chuyển cấp HR
                </Button>
                <Button
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => handleReject(selectedRequest.id)}
                >
                  Từ chối
                </Button>
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={() => handleApprove(selectedRequest.id)}
                  style={{ background: '#059669', borderColor: '#059669' }}
                >
                  Phê duyệt đơn
                </Button>
              </div>
            </Card>
          ) : (
            <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'center', padding: '48px 0' }}>
              <Text type="secondary">Chọn một đơn từ danh sách bên trái để xem xét và xử lý phê duyệt.</Text>
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default ApprovalsPage;
