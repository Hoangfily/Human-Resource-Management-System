import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Typography,
  Table,
  Tag,
  Button,
  Space,
  Row,
  Col,
  Modal,
  Form,
  Select,
  DatePicker,
  Input,
  Alert,
  App as AntdApp,
  Spin,
} from 'antd';
import {
  SwapOutlined,
  ClockCircleOutlined,
  UserOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../lib/api-client';
import { RequestType } from '@hr-agent/shared';

const { Title, Text, Paragraph } = Typography;

export const ShiftsPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState<boolean>(false);
  const [submittingSwap, setSubmittingSwap] = useState<boolean>(false);
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [colleagues, setColleagues] = useState<any[]>([]);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [selectedShiftForSwap, setSelectedShiftForSwap] = useState<any>(null);
  const [swapForm] = Form.useForm();

  // Tải lịch làm việc và danh sách đồng nghiệp từ PostgreSQL
  const fetchShiftsData = useCallback(async () => {
    setLoading(true);
    try {
      const [scheduleRes, colleaguesRes] = await Promise.all([
        apiClient.get('/shifts/my-schedule'),
        apiClient.get<any[]>('/shifts/colleagues'),
      ]);
      setScheduleData(scheduleRes);
      setColleagues((colleaguesRes as unknown as any[]) || []);
    } catch {
      // Giữ giao diện nếu lỗi
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShiftsData();
  }, [fetchShiftsData]);

  // Xử lý nộp đơn hoán đổi ca làm việc thật vào CSDL
  const handleSwapSubmit = async (values: any) => {
    setSubmittingSwap(true);
    try {
      await apiClient.post('/requests', {
        type: RequestType.ShiftChange,
        payload: {
          scheduleId: selectedShiftForSwap?.key || 'SCH-01',
          shiftDate: values.date ? values.date.format('YYYY-MM-DD') : selectedShiftForSwap?.date,
          newDate: values.date ? values.date.format('YYYY-MM-DD') : selectedShiftForSwap?.date,
          newShiftTemplateId: values.targetShift,
          targetEmployeeId: values.colleagueId,
          reason: values.reason,
        },
      });

      message.success('Đã gửi đề xuất hoán đổi ca làm việc thành công! Đơn đã chuyển đến Quản lý.');
      setIsSwapModalOpen(false);
      swapForm.resetFields();
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Không thể tạo yêu cầu đổi ca. Vui lòng thử lại.';
      message.error(errMsg);
    } finally {
      setSubmittingSwap(false);
    }
  };

  const renderShiftBadge = (shift: string, time: string) => {
    if (shift === 'CA_SANG') {
      return (
        <Tag
          style={{
            backgroundColor: '#ecfdf5',
            borderColor: '#a7f3d0',
            color: '#059669',
            fontWeight: 600,
            borderRadius: 6,
            padding: '2px 10px',
          }}
        >
          Ca Sáng ({time})
        </Tag>
      );
    }
    if (shift === 'CA_CHIEU') {
      return (
        <Tag
          style={{
            backgroundColor: '#fff7ed',
            borderColor: '#fed7aa',
            color: '#ea580c',
            fontWeight: 600,
            borderRadius: 6,
            padding: '2px 10px',
          }}
        >
          Ca Chiều ({time})
        </Tag>
      );
    }
    if (shift === 'CA_DEM') {
      return (
        <Tag
          style={{
            backgroundColor: '#f5f3ff',
            borderColor: '#ddd6fe',
            color: '#7c3aed',
            fontWeight: 600,
            borderRadius: 6,
            padding: '2px 10px',
          }}
        >
          Ca Đêm ({time})
        </Tag>
      );
    }
    return (
      <Tag
        style={{
          backgroundColor: '#f1f5f9',
          borderColor: '#e2e8f0',
          color: '#64748b',
          borderRadius: 6,
          padding: '2px 10px',
        }}
      >
        Nghỉ theo lịch tuần
      </Tag>
    );
  };

  const columns = [
    {
      title: 'Ngày làm việc',
      dataIndex: 'day',
      key: 'day',
      render: (t: string) => <Text strong>{t}</Text>,
    },
    {
      title: 'Ca phân công',
      key: 'shift',
      render: (_: unknown, record: any) => renderShiftBadge(record.shift, record.time),
    },
    {
      title: 'Địa điểm làm việc',
      dataIndex: 'room',
      key: 'room',
      render: (r: string) => (
        <Space size={6}>
          {r !== '—' && <EnvironmentOutlined style={{ color: '#059669' }} />}
          <span>{r}</span>
        </Space>
      ),
    },
    {
      title: 'Đồng nghiệp cùng ca',
      dataIndex: 'colleagues',
      key: 'colleagues',
      render: (t: string) => <Text type="secondary">{t}</Text>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: unknown, record: any) =>
        record.shift !== 'NGHI_CA' ? (
          <Button
            size="small"
            icon={<SwapOutlined />}
            onClick={() => {
              setSelectedShiftForSwap(record);
              setIsSwapModalOpen(true);
            }}
          >
            Đổi ca
          </Button>
        ) : null,
    },
  ];

  const todayShift = scheduleData?.todayShift || {
    name: 'Ca Sáng',
    time: '08:30 - 17:30',
    location: 'Văn phòng chính (Tầng 4)',
    manager: 'Nguyễn Tiến Dũng',
  };

  const weekShifts = scheduleData?.weekShifts || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Lịch phân ca làm việc & Trực ban
          </Title>
          <Text type="secondary">
            Theo dõi lịch trực cá nhân từ hệ thống, xem nhân sự cùng ca và tạo đề xuất hoán đổi ca làm việc.
          </Text>
        </div>
        <Button
          type="primary"
          icon={<SwapOutlined />}
          style={{ background: '#059669', borderColor: '#059669' }}
          onClick={() => {
            setSelectedShiftForSwap(weekShifts[0] || null);
            setIsSwapModalOpen(true);
          }}
        >
          Đề xuất đổi ca làm
        </Button>
      </div>

      <Row gutter={[20, 20]}>
        {/* Cột trái: Lịch làm việc tuần */}
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined style={{ color: '#059669' }} />
                <span style={{ fontWeight: 600 }}>Lịch làm việc tuần này (Cập nhật từ CSDL)</span>
              </Space>
            }
            style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Spin />
              </div>
            ) : (
              <Table
                dataSource={weekShifts}
                columns={columns}
                pagination={false}
                size="middle"
                rowKey="key"
              />
            )}
          </Card>
        </Col>

        {/* Cột phải: Card Ca hôm nay & Thông tin đồng nghiệp */}
        <Col xs={24} lg={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card
              title={<span style={{ fontWeight: 600 }}>Ca trực hôm nay</span>}
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  padding: 16,
                  borderRadius: 10,
                  marginBottom: 14,
                }}
              >
                <Tag
                  style={{
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    fontWeight: 700,
                    borderRadius: 4,
                  }}
                >
                  {todayShift.name?.toUpperCase() || 'CA SÁNG'}
                </Tag>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#065f46', margin: '8px 0 2px' }}>
                  {todayShift.time}
                </div>
                <div style={{ fontSize: 13, color: '#14532d', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <EnvironmentOutlined />
                  <span>{todayShift.location}</span>
                </div>
              </div>

              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.8 }}>
                <div>
                  • Quản lý trực tiếp: <strong>Nguyễn Tiến Dũng</strong>
                </div>
                <div>• Chế độ: Nghỉ giữa ca 60 phút (12:00 - 13:00)</div>
                <div>• Tiêu chuẩn: Quẹt thẻ đúng giờ trong phạm vi ±15 phút</div>
              </div>
            </Card>

            <Card
              title={
                <Space>
                  <TeamOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 600 }}>Nhân sự cùng phòng ban</span>
                </Space>
              }
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={10}>
                {colleagues.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      background: '#f8fafc',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div>
                      <Text strong style={{ fontSize: 13, display: 'block' }}>
                        {c.fullName}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {c.position?.title || 'Chuyên viên'} • {c.email}
                      </Text>
                    </div>
                    <Button
                      size="small"
                      type="link"
                      onClick={() => {
                        setSelectedShiftForSwap(weekShifts[0]);
                        setIsSwapModalOpen(true);
                      }}
                      style={{ color: '#059669', padding: 0 }}
                    >
                      Đổi ca →
                    </Button>
                  </div>
                ))}
              </Space>
            </Card>
          </Space>
        </Col>
      </Row>

      {/* Modal Đề xuất đổi ca làm */}
      <Modal
        title="Đề xuất hoán đổi ca làm việc"
        open={isSwapModalOpen}
        onCancel={() => setIsSwapModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsSwapModalOpen(false)}>
            Hủy bỏ
          </Button>,
          <Button
            key="ok"
            type="primary"
            loading={submittingSwap}
            style={{ background: '#059669', borderColor: '#059669' }}
            onClick={() => swapForm.submit()}
          >
            Nộp yêu cầu đổi ca
          </Button>,
        ]}
      >
        <Alert
          type="info"
          showIcon
          message="Quy định đổi ca làm việc"
          description="Đơn hoán đổi ca cần sự đồng thuận của đồng nghiệp và phải được Quản lý duyệt trước khi có hiệu lực."
          style={{ marginBottom: 16 }}
        />

        <Form form={swapForm} layout="vertical" onFinish={handleSwapSubmit}>
          <Form.Item
            name="date"
            label="Ngày làm việc muốn đổi ca"
            rules={[{ required: true, message: 'Vui lòng chọn ngày muốn đổi' }]}
            initialValue={selectedShiftForSwap?.date ? dayjs(selectedShiftForSwap.date) : dayjs()}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>

          <Form.Item
            name="colleagueId"
            label="Đồng nghiệp hoán đổi"
            rules={[{ required: true, message: 'Vui lòng chọn đồng nghiệp muốn đổi ca' }]}
          >
            <Select placeholder="Chọn đồng nghiệp đổi ca">
              {colleagues.map((c) => (
                <Select.Option key={c.id} value={c.id}>
                  {c.fullName} ({c.position?.title || 'Phòng CNTT'})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="targetShift"
            label="Ca làm việc chuyển đổi"
            rules={[{ required: true, message: 'Vui lòng chọn ca làm muốn đổi sang' }]}
            initialValue="CA_CHIEU"
          >
            <Select>
              <Select.Option value="CA_SANG">Ca Sáng (08:30 - 17:30)</Select.Option>
              <Select.Option value="CA_CHIEU">Ca Chiều (13:00 - 21:00)</Select.Option>
              <Select.Option value="CA_DEM">Ca Đêm (21:00 - 05:00)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="reason"
            label="Lý do đề xuất đổi ca"
            rules={[{ required: true, message: 'Vui lòng nêu rõ lý do đổi ca' }]}
          >
            <Input.TextArea rows={3} placeholder="Ví dụ: Cần đổi ca do có lịch khám bệnh định kỳ vào buổi sáng..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ShiftsPage;
