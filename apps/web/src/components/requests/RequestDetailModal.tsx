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
  SafetyCertificateOutlined,
  UserOutlined,
  BookOutlined,
  ArrowUpOutlined,
  CloseOutlined,
  CheckOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { RequestStatus, RequestType } from '@hr-agent/shared';
import { StatusTag, RiskBadge, RequestTypeTag } from '../common';
import { RequestItem } from '../../types';
import { formatPolicyName, getRiskMeta } from '../../lib/display-mappers';

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

  const payload = (request.payload as Record<string, any>) || {};
  const riskMeta = getRiskMeta(request.riskLevel, request.aiRiskScore);

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
        width={800}
        footer={null}
        style={{ top: 28 }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
            <Space size={10}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#059669',
                }}
              >
                <FileTextOutlined style={{ fontSize: 18 }} />
              </div>
              <div>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  Hồ sơ yêu cầu #{request.id.slice(0, 8)}
                </span>
                <span style={{ marginLeft: 8 }}>
                  <StatusTag status={request.status} />
                </span>
              </div>
            </Space>
            <RequestTypeTag type={request.type} />
          </div>
        }
      >
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as any)}
          style={{ marginTop: 8 }}
          items={[
            // ==========================================
            // PHẦN 1: THÔNG TIN CHI TIẾT ĐƠN TỪ
            // ==========================================
            {
              key: 'details',
              label: (
                <Space>
                  <FileTextOutlined />
                  <span style={{ fontWeight: 500 }}>1. Thông tin yêu cầu</span>
                </Space>
              ),
              children: (
                <div style={{ paddingTop: 8 }}>
                  {/* Bảng thông tin người gửi & thời gian */}
                  <Descriptions
                    bordered
                    size="small"
                    column={{ xs: 1, sm: 2 }}
                    style={{ marginBottom: 16 }}
                  >
                    <Descriptions.Item label="Nhân viên đề xuất">
                      <Space>
                        <UserOutlined style={{ color: '#059669' }} />
                        <Text strong>{request.employeeName}</Text>
                        <Text type="secondary">({request.employeeCode || 'NV'})</Text>
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Phòng ban trực thuộc">
                      {request.departmentName || 'Phòng Công nghệ Thông tin'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Thời gian nộp đơn">
                      {new Date(request.createdAt).toLocaleString('vi-VN')}
                    </Descriptions.Item>
                    <Descriptions.Item label="Cán bộ phụ trách duyệt">
                      {request.approverName ? (
                        <Text strong style={{ color: '#0f172a' }}>
                          {request.approverName}
                        </Text>
                      ) : (
                        <Text type="secondary">Đang chờ hệ thống phân công</Text>
                      )}
                    </Descriptions.Item>
                    {payload.dates && (
                      <Descriptions.Item label="Khoảng thời gian áp dụng">
                        <strong>{payload.dates}</strong>
                      </Descriptions.Item>
                    )}
                    {payload.startDate && payload.endDate && !payload.dates && (
                      <Descriptions.Item label="Khoảng thời gian áp dụng">
                        <strong>
                          {new Date(payload.startDate).toLocaleDateString('vi-VN')} – {new Date(payload.endDate).toLocaleDateString('vi-VN')}
                        </strong>
                      </Descriptions.Item>
                    )}
                    {payload.daysCount && (
                      <Descriptions.Item label="Thời lượng yêu cầu">
                        <Tag color="cyan" style={{ borderRadius: 6, fontWeight: 600 }}>
                          {payload.daysCount} ngày làm việc
                        </Tag>
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
                      message="Yêu cầu không được phê duyệt"
                      description={`Lý do từ chối: ${request.rejectionReason}`}
                      style={{ marginBottom: 16, borderRadius: 8 }}
                    />
                  )}

                  {/* Tóm tắt nhanh nhận định AI */}
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                      border: '1px solid #a7f3d0',
                      borderRadius: 10,
                      padding: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Space size={12}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: '#d1fae5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#059669',
                        }}
                      >
                        <RobotOutlined style={{ fontSize: 20 }} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Text strong style={{ color: '#065f46', fontSize: 13 }}>
                            Thẩm định sơ bộ từ Trợ lý AI:
                          </Text>
                          <RiskBadge riskLevel={request.riskLevel} confidence={request.aiConfidence} showScore={false} />
                        </div>
                        <Text style={{ color: '#047857', fontSize: 12 }}>
                          {request.aiRationale?.slice(0, 95) || 'Yêu cầu hợp lệ, hoàn toàn tuân thủ quy chế nội bộ công ty.'}...
                        </Text>
                      </div>
                    </Space>
                    <Button
                      size="small"
                      type="link"
                      onClick={() => setActiveTab('ai-audit')}
                      style={{ color: '#059669', fontWeight: 600 }}
                    >
                      Xem chi tiết đối soát →
                    </Button>
                  </div>
                </div>
              ),
            },

            // ==========================================
            // PHẦN 2: THẨM ĐỊNH & PHÂN TÍCH AI (AI AUDIT)
            // ==========================================
            {
              key: 'ai-audit',
              label: (
                <Space>
                  <RobotOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 500 }}>2. Phân tích & Thẩm định AI</span>
                </Space>
              ),
              children: (
                <div style={{ paddingTop: 8 }}>
                  {/* Hộp chỉ số Rủi ro & Độ tin cậy */}
                  <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                    <Col xs={24} sm={12}>
                      <Card
                        size="small"
                        style={{
                          borderRadius: 10,
                          border: '1px solid #e2e8f0',
                          background: '#f8fafc',
                        }}
                      >
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Đánh giá mức độ an toàn:
                        </Text>
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <RiskBadge riskLevel={request.riskLevel} confidence={request.aiConfidence} showScore={false} />
                        </div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6, color: '#64748b' }}>
                          {riskMeta.description}
                        </Text>
                      </Card>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Card
                        size="small"
                        style={{
                          borderRadius: 10,
                          border: '1px solid #e2e8f0',
                          background: '#f8fafc',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Mức độ tự tin trong thẩm định:
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
                        <Text type="secondary" style={{ fontSize: 11, color: '#64748b' }}>
                          Hệ thống AI tự động đối soát theo 9 điều khoản Quy chế Nhân sự hiện hành
                        </Text>
                      </Card>
                    </Col>
                  </Row>

                  {/* Lý do đề xuất của AI */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <SafetyCertificateOutlined style={{ color: '#059669', fontSize: 16 }} />
                      <Text strong style={{ color: '#0f172a', fontSize: 14 }}>
                        Lý giải đề xuất từ Trợ lý HR AI:
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
                      Kết quả kiểm tra điều kiện quy chế nội bộ:
                    </Text>
                    <Space direction="vertical" style={{ width: '100%' }}>
                      {(request.aiPolicyFindings || [
                        'Thời gian gửi đơn báo trước thỏa mãn quy định (≥ 3 ngày làm việc)',
                        'Số dư quỹ phép năm của nhân viên còn khả dụng để trừ',
                        'Không trùng lịch cao điểm bàn giao hoặc trực dự án quan trọng',
                      ]).map((finding, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            padding: '9px 14px',
                            borderRadius: 8,
                            fontSize: 13,
                            color: '#166534',
                          }}
                        >
                          <CheckCircleOutlined style={{ color: '#059669', fontSize: 15 }} />
                          <span>{finding}</span>
                        </div>
                      ))}
                    </Space>
                  </div>

                  {/* Danh sách điều khoản quy chế trích dẫn */}
                  {request.policyReferences && request.policyReferences.length > 0 && (
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6, fontWeight: 500 }}>
                        Căn cứ quy chế công ty áp dụng:
                      </Text>
                      <Space wrap>
                        {request.policyReferences.map((ref) => (
                          <Tag
                            key={ref}
                            color="cyan"
                            icon={<BookOutlined />}
                            style={{ borderRadius: 6, padding: '3px 8px', fontSize: 12 }}
                          >
                            {formatPolicyName(ref)}
                          </Tag>
                        ))}
                      </Space>
                    </div>
                  )}
                </div>
              ),
            },

            // ==========================================
            // PHẦN 3: DÒNG THỜI GIAN LỊCH SỬ (TIMELINE)
            // ==========================================
            {
              key: 'timeline',
              label: (
                <Space>
                  <HistoryOutlined />
                  <span style={{ fontWeight: 500 }}>3. Tiến trình phê duyệt</span>
                </Space>
              ),
              children: (
                <div style={{ padding: '16px 12px' }}>
                  <Timeline
                    items={(
                      request.timeline || [
                        {
                          title: 'Tạo yêu cầu',
                          actor: request.employeeName,
                          actorType: 'HUMAN',
                          timestamp: new Date(request.createdAt).toLocaleString('vi-VN'),
                          description: 'Đơn được khởi tạo và nộp lên hệ thống quản lý',
                          status: 'finish',
                        },
                        {
                          title: 'Trợ lý AI thẩm định',
                          actor: 'Trợ lý HR AI',
                          actorType: 'AI',
                          timestamp: new Date(request.createdAt).toLocaleString('vi-VN'),
                          description: 'Đối soát 9 quy chế nội bộ & kiểm tra mức độ an toàn',
                          status: 'finish',
                        },
                        {
                          title: 'Xét duyệt cấp quản lý',
                          actor: request.approverName || 'Cán bộ Quản lý',
                          actorType: 'HUMAN',
                          timestamp: request.updatedAt
                            ? new Date(request.updatedAt).toLocaleString('vi-VN')
                            : 'Đang chờ xử lý',
                          description:
                            request.status === RequestStatus.Approved
                              ? 'Đã chấp thuận phê duyệt'
                              : request.status === RequestStatus.Rejected
                              ? 'Đã từ chối yêu cầu'
                              : 'Đang trong danh sách chờ quản lý xem xét',
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
                          ? '#dc2626'
                          : t.status === 'process'
                          ? '#2563eb'
                          : '#059669',
                      children: (
                        <div key={i} style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Text strong style={{ color: '#0f172a', fontSize: 14 }}>
                              {t.title}
                            </Text>
                            <Tag
                              color={t.actorType === 'AI' ? 'emerald' : 'default'}
                              style={{
                                fontSize: 11,
                                borderRadius: 6,
                                background: t.actorType === 'AI' ? '#ecfdf5' : undefined,
                                color: t.actorType === 'AI' ? '#065f46' : undefined,
                                borderColor: t.actorType === 'AI' ? '#a7f3d0' : undefined,
                              }}
                            >
                              {t.actor}
                            </Tag>
                          </div>
                          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
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
                    Chuyển cấp thẩm định HR
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
                    Phê duyệt yêu cầu
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
            Vui lòng nhập lý do cụ thể để gửi thông báo cho nhân viên:
          </Text>
          <Input.TextArea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Ví dụ: Dự án đang trong giai đoạn nước rút, đề nghị sắp xếp lại lịch nghỉ sau ngày 15..."
          />
        </div>
      </Modal>
    </>
  );
};

export default RequestDetailModal;
