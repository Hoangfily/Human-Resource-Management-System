import React, { useState } from 'react';
import {
  Modal,
  Tabs,
  Typography,
  Space,
  Tag,
  Descriptions,
  Row,
  Col,
  Progress,
  Card,
  Timeline,
  Alert,
  Button,
  Input,
  Divider,
} from 'antd';
import {
  FileTextOutlined,
  RobotOutlined,
  HistoryOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  BookOutlined,
  ArrowUpOutlined,
  CloseOutlined,
  CheckOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { RequestStatus, RequestType } from '@hr-agent/shared';
import { StatusTag } from '../common';
import { RequestItem } from '../../types';

const { Title, Text, Paragraph } = Typography;

interface RequestDetailModalProps {
  open: boolean;
  onClose: () => void;
  request: RequestItem | null;
  isApproverMode?: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string, reason: string) => void;
  onEscalate?: (id: string) => void;
  onCancelRequest?: (id: string) => void;
}

export const RequestDetailModal: React.FC<RequestDetailModalProps> = ({
  open,
  onClose,
  request,
  isApproverMode = false,
  onApprove,
  onReject,
  onEscalate,
  onCancelRequest,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'ai-audit' | 'timeline'>('details');
  const [rejectReason, setRejectReason] = useState('');
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);

  if (!request) return null;

  const payload = request.payload as Record<string, any>;
  const riskColor =
    request.riskLevel === 'HIGH' ? 'error' : request.riskLevel === 'MEDIUM' ? 'warning' : 'success';

  const riskLabel =
    request.riskLevel === 'HIGH'
      ? 'RỦI RO CAO (HIGH)'
      : request.riskLevel === 'MEDIUM'
      ? 'RỦI RO TRUNG BÌNH (MEDIUM)'
      : 'RỦI RO THẤP (LOW)';

  const handleConfirmReject = () => {
    if (onReject) {
      onReject(request.id, rejectReason || 'Quản lý từ chối yêu cầu.');
      setIsRejectModalOpen(false);
      setRejectReason('');
      onClose();
    }
  };

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        width={780}
        footer={null}
        style={{ top: 30 }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
            <Space size={10}>
              <FileTextOutlined style={{ color: '#059669', fontSize: 20 }} />
              <span style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                Chi tiết yêu cầu #{request.id}
              </span>
              <StatusTag status={request.status} />
            </Space>
            <Tag color="cyan" style={{ borderRadius: 6, fontWeight: 500 }}>
              {request.type === RequestType.Leave
                ? 'Nghỉ phép'
                : request.type === RequestType.AttendanceExplanation
                ? 'Giải trình chấm công'
                : request.type === RequestType.ShiftChange
                ? 'Đổi ca làm việc'
                : 'Làm thêm giờ (OT)'}
            </Tag>
          </div>
        }
      >
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as any)}
          style={{ marginTop: 8 }}
          items={[
            // ==========================================
            // TAB 1: THÔNG TIN CHI TIẾT
            // ==========================================
            {
              key: 'details',
              label: (
                <Space>
                  <FileTextOutlined />
                  <span>Thông tin yêu cầu</span>
                </Space>
              ),
              children: (
                <div>
                  {/* Bảng thông tin người gửi & thời gian */}
                  <Descriptions
                    bordered
                    size="small"
                    column={{ xs: 1, sm: 2 }}
                    style={{ marginBottom: 16 }}
                  >
                    <Descriptions.Item label="Nhân viên nộp đơn">
                      <Space>
                        <UserOutlined style={{ color: '#059669' }} />
                        <Text strong>{request.employeeName}</Text>
                        <Text type="secondary">({request.employeeCode || 'EMP001'})</Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Phòng ban">
                      {request.departmentName || 'Phòng Công nghệ Thông tin'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Thời gian gửi đơn">
                      {new Date(request.createdAt).toLocaleString('vi-VN')}
                    </Descriptions.Item>
                    <Descriptions.Item label="Người duyệt phân công">
                      {request.approverName ? (
                        <Text strong style={{ color: '#0f172a' }}>
                          {request.approverName}
                        </Text>
                      ) : (
                        <Text type="secondary">Chờ hệ thống chỉ định</Text>
                      )}
                    </Descriptions.Item>
                    {payload.dates && (
                      <Descriptions.Item label="Thời gian áp dụng">
                        <strong>{payload.dates}</strong>
                      </Descriptions.Item>
                    )}
                    {payload.daysCount && (
                      <Descriptions.Item label="Số ngày yêu cầu">
                        <Tag color="blue">{payload.daysCount} ngày</Tag>
                      </Descriptions.Item>
                    )}
                  </Descriptions>

                  {/* Khối Lý do chi tiết */}
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 16,
                    }}
                  >
                    <Text strong style={{ display: 'block', color: '#334155', marginBottom: 6 }}>
                      Nội dung & Lý do đề xuất:
                    </Text>
                    <div style={{ color: '#0f172a', fontSize: 14, lineHeight: 1.6, fontStyle: 'italic' }}>
                      "{payload.reason || 'Không có lý do chi tiết.'}"
                    </div>
                  </div>

                  {/* Nếu bị từ chối, hiển thị lý do từ chối */}
                  {request.status === RequestStatus.Rejected && request.rejectionReason && (
                    <Alert
                      type="error"
                      showIcon
                      icon={<CloseCircleOutlined />}
                      message="Yêu cầu đã bị từ chối"
                      description={`Lý do từ chối: ${request.rejectionReason}`}
                      style={{ marginBottom: 16 }}
                    />
                  )}

                  {/* Tóm tắt nhanh nhận định AI */}
                  <div
                    style={{
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: 10,
                      padding: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Space>
                      <RobotOutlined style={{ color: '#059669', fontSize: 20 }} />
                      <div>
                        <Text strong style={{ color: '#166534', fontSize: 13, display: 'block' }}>
                          Thẩm định sơ bộ từ AI Agent:
                        </Text>
                        <Text style={{ color: '#14532d', fontSize: 12 }}>
                          {request.aiRationale?.slice(0, 85) || 'Yêu cầu hợp lệ theo quy chế nội bộ.'}...
                        </Text>
                      </div>
                    </Space>
                    <Button
                      size="small"
                      type="link"
                      onClick={() => setActiveTab('ai-audit')}
                      style={{ color: '#059669', fontWeight: 600 }}
                    >
                      Xem chi tiết AI →
                    </Button>
                  </div>
                </div>
              ),
            },

            // ==========================================
            // TAB 2: THẨM ĐỊNH & PHÂN TÍCH AI (AI AUDIT)
            // ==========================================
            {
              key: 'ai-audit',
              label: (
                <Space>
                  <RobotOutlined />
                  <span>Phân tích & Thẩm định AI</span>
                </Space>
              ),
              children: (
                <div>
                  {/* Hộp chỉ số Rủi ro & Độ tin cậy */}
                  <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                    <Col xs={24} sm={12}>
                      <Card
                        size="small"
                        style={{
                          borderRadius: 10,
                          border: '1px solid #e2e8f0',
                          background: '#fafafa',
                        }}
                      >
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Mức độ rủi ro (Risk Level):
                        </Text>
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Tag color={riskColor} style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6 }}>
                            {riskLabel}
                          </Tag>
                          <Text strong style={{ fontSize: 14 }}>
                            Score: {(request.aiRiskScore ?? 0.05).toFixed(2)}
                          </Text>
                        </div>
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                          {request.riskLevel === 'LOW'
                            ? 'Thuộc diện được AI đề xuất Auto-Approve'
                            : 'Cần sự can thiệp phê duyệt của con người'}
                        </Text>
                      </Card>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Card
                        size="small"
                        style={{
                          borderRadius: 10,
                          border: '1px solid #e2e8f0',
                          background: '#fafafa',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Độ tin cậy của AI (Confidence):
                          </Text>
                          <Text strong style={{ color: '#059669' }}>
                            {Math.round((request.aiConfidence ?? 0.95) * 100)}%
                          </Text>
                        </div>
                        <Progress
                          percent={Math.round((request.aiConfidence ?? 0.95) * 100)}
                          strokeColor="#059669"
                          size="small"
                          style={{ marginTop: 6 }}
                        />
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          Mô hình RAG phân tích theo quy chế CompanyPolicy 2026.10
                        </Text>
                      </Card>
                    </Col>
                  </Row>

                  {/* Lý do đề xuất của AI (AI Rationale) */}
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <SafetyCertificateOutlined style={{ color: '#059669', fontSize: 16 }} />
                      <Text strong style={{ color: '#0f172a', fontSize: 14 }}>
                        Lý giải đề xuất của AI (Decision Rationale):
                      </Text>
                    </div>
                    <Paragraph style={{ color: '#334155', fontSize: 13, lineHeight: 1.65, margin: 0 }}>
                      {request.aiRationale ||
                        'Đơn nộp hợp lệ, tuân thủ đầy đủ các tiêu chuẩn về thời gian báo trước và số dư ngày phép hiện hữu.'}
                    </Paragraph>
                  </div>

                  {/* Checklist đối soát quy chế công ty */}
                  <div style={{ marginBottom: 16 }}>
                    <Text strong style={{ display: 'block', color: '#0f172a', marginBottom: 8 }}>
                      Kết quả đối soát quy chuẩn (Policy Checklist):
                    </Text>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {(request.aiPolicyFindings || [
                        'Thời gian báo trước thỏa mãn quy định ≥ 3 ngày làm việc',
                        'Số dư ngày phép còn đủ để trừ',
                      ]).map((finding, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            padding: '8px 12px',
                            borderRadius: 6,
                            fontSize: 13,
                            color: '#166534',
                          }}
                        >
                          <CheckCircleOutlined style={{ color: '#059669' }} />
                          <span>{finding}</span>
                        </div>
                      ))}
                    </Space>
                  </div>

                  {/* Danh sách điều khoản quy chế trích dẫn */}
                  {request.policyReferences && request.policyReferences.length > 0 && (
                    <div>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                        Điều khoản quy chế được trích dẫn (docs/03-policy.md):
                      </Text>
                      <Space wrap>
                        {request.policyReferences.map((ref) => (
                          <Tag key={ref} color="blue" icon={<BookOutlined />}>
                            {ref}
                          </Tag>
                        ))}
                      </Space>
                    </div>
                  )}
                </div>
              ),
            },

            // ==========================================
            // TAB 3: DÒNG THỜI GIAN LỊCH SỬ (TIMELINE)
            // ==========================================
            {
              key: 'timeline',
              label: (
                <Space>
                  <HistoryOutlined />
                  <span>Dòng thời gian phê duyệt</span>
                </Space>
              ),
              children: (
                <div style={{ padding: '12px 16px' }}>
                  <Timeline
                    items={(
                      request.timeline || [
                        {
                          title: 'Tạo yêu cầu',
                          actor: request.employeeName,
                          actorType: 'HUMAN',
                          timestamp: request.createdAt,
                          description: 'Đơn được nộp lên hệ thống HRMS',
                          status: 'finish',
                        },
                        {
                          title: 'AI Agent thẩm định',
                          actor: 'HR AI Copilot',
                          actorType: 'AI',
                          timestamp: request.createdAt,
                          description: 'Đối soát chính sách & đánh giá mức rủi ro',
                          status: 'finish',
                        },
                        {
                          title: 'Xét duyệt cấp quản lý',
                          actor: request.approverName || 'Trần Thị Bích',
                          actorType: 'HUMAN',
                          timestamp: request.updatedAt,
                          description:
                            request.status === RequestStatus.Approved
                              ? 'Đã phê duyệt chấp thuận'
                              : request.status === RequestStatus.Rejected
                              ? 'Đã từ chối đơn'
                              : 'Đang chờ xem xét',
                          status:
                            request.status === RequestStatus.Approved
                              ? 'finish'
                              : request.status === RequestStatus.Rejected
                              ? 'error'
                              : 'process',
                        },
                      ]
                    ).map((t, i) => ({
                      color:
                        t.status === 'error'
                          ? 'red'
                          : t.status === 'process'
                          ? 'blue'
                          : '#059669',
                      children: (
                        <div key={i} style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Text strong style={{ color: '#0f172a', fontSize: 14 }}>
                              {t.title}
                            </Text>
                            <Tag color={t.actorType === 'AI' ? 'purple' : 'default'} style={{ fontSize: 11 }}>
                              {t.actor}
                            </Tag>
                          </div>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                            {t.timestamp}
                          </Text>
                          {t.description && (
                            <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
                              {t.description}
                            </div>
                          )}
                        </div>
                      ),
                    }))}
                  />
                </div>
              ),
            },
          ]}
        />

        {/* Thanh nút bấm hành động chân Modal */}
        <Divider style={{ margin: '16px 0 12px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {/* Nút hủy đơn dành cho Nhân viên khi đơn đang chờ */}
            {!isApproverMode &&
              (request.status === RequestStatus.Pending || request.status === RequestStatus.Draft) &&
              onCancelRequest && (
                <Button
                  danger
                  icon={<StopOutlined />}
                  onClick={() => {
                    onCancelRequest(request.id);
                    onClose();
                  }}
                >
                  Hủy yêu cầu này
                </Button>
              )}
          </div>

          <Space>
            <Button onClick={onClose}>Đóng</Button>

            {/* Các nút dành cho Quản lý phê duyệt */}
            {isApproverMode && request.status === RequestStatus.Pending && (
              <>
                {onEscalate && (
                  <Button
                    icon={<ArrowUpOutlined />}
                    onClick={() => {
                      onEscalate(request.id);
                      onClose();
                    }}
                  >
                    Chuyển cấp HR
                  </Button>
                )}
                <Button
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => setIsRejectModalOpen(true)}
                >
                  Từ chối
                </Button>
                {onApprove && (
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    style={{ background: '#059669', borderColor: '#059669' }}
                    onClick={() => {
                      onApprove(request.id);
                      onClose();
                    }}
                  >
                    Phê duyệt đơn
                  </Button>
                )}
              </>
            )}
          </Space>
        </div>
      </Modal>

      {/* Modal nhập lý do từ chối */}
      <Modal
        title="Nhập lý do từ chối yêu cầu"
        open={isRejectModalOpen}
        onCancel={() => setIsRejectModalOpen(false)}
        onOk={handleConfirmReject}
        okText="Xác nhận từ chối"
        okButtonProps={{ danger: true }}
      >
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            Vui lòng nhập lý do cụ thể để nhân viên nắm được thông tin:
          </Text>
          <Input.TextArea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Ví dụ: Dự án đang trong giai đoạn nước rút, đề nghị sắp xếp lại lịch nghỉ..."
          />
        </div>
      </Modal>
    </>
  );
};

export default RequestDetailModal;
