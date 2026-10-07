import React, { useState } from 'react';
import { Card, Typography, Table, Tag, Button, Space, Row, Col, Modal, Form, Select, DatePicker, Input, Alert, App as AntdApp } from 'antd';
import { SwapOutlined, ClockCircleOutlined, UserOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export const ShiftsPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);

  const weekShifts = [
    { key: '1', day: 'Thứ Hai (12/10)', shift: 'CA_SANG', time: '08:30 - 17:30', room: 'Phòng Lab 402', colleagues: 'An Nguyễn, Hà Lê, Bảo Phạm' },
    { key: '2', day: 'Thứ Ba (13/10)', shift: 'CA_SANG', time: '08:30 - 17:30', room: 'Phòng Lab 402', colleagues: 'An Nguyễn, Bích Trần, Nam Hoàng' },
    { key: '3', day: 'Thứ Tư (14/10)', shift: 'CA_CHIEU', time: '13:00 - 21:00', room: 'Phòng Dev 405', colleagues: 'An Nguyễn, Trọng Vũ' },
    { key: '4', day: 'Thứ Năm (15/10)', shift: 'CA_SANG', time: '08:30 - 17:30', room: 'Phòng Lab 402', colleagues: 'An Nguyễn, Bích Trần' },
    { key: '5', day: 'Thứ Sáu (16/10)', shift: 'NGHI_CA', time: '—', room: '—', colleagues: '—' },
    { key: '6', day: 'Thứ Bảy (17/10)', shift: 'NGHI_CA', time: '—', room: '—', colleagues: '—' },
    { key: '7', day: 'Chủ Nhật (18/10)', shift: 'NGHI_CA', time: '—', room: '—', colleagues: '—' },
  ];

  const renderShiftBadge = (shift: string, time: string) => {
    if (shift === 'CA_SANG') {
      return <Tag color="green" style={{ padding: '3px 8px', borderRadius: 6 }}>Ca Sáng ({time})</Tag>;
    }
    if (shift === 'CA_CHIEU') {
      return <Tag color="orange" style={{ padding: '3px 8px', borderRadius: 6 }}>Ca Chiều ({time})</Tag>;
    }
    if (shift === 'CA_DEM') {
      return <Tag color="purple" style={{ padding: '3px 8px', borderRadius: 6 }}>Ca Đêm ({time})</Tag>;
    }
    return <Tag color="default" style={{ padding: '3px 8px', borderRadius: 6 }}>Nghỉ ca tuần</Tag>;
  };

  const columns = [
    { title: 'Ngày làm việc', dataIndex: 'day', key: 'day', render: (t: string) => <Text strong>{t}</Text> },
    {
      title: 'Ca phân công',
      key: 'shift',
      render: (_: unknown, record: typeof weekShifts[0]) => renderShiftBadge(record.shift, record.time),
    },
    { title: 'Vị trí làm việc', dataIndex: 'room', key: 'room' },
    { title: 'Đồng nghiệp cùng ca', dataIndex: 'colleagues', key: 'colleagues', render: (t: string) => <Text type="secondary">{t}</Text> },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: unknown, record: typeof weekShifts[0]) =>
        record.shift !== 'NGHI_CA' ? (
          <Button size="small" icon={<SwapOutlined />} onClick={() => setIsSwapModalOpen(true)}>
            Đổi ca
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Lịch phân ca làm việc (Shifts)
          </Title>
          <Text type="secondary">Theo dõi lịch trực, nhân sự cùng ca và tạo đề xuất hoán đổi ca làm việc.</Text>
        </div>
        <Button type="primary" icon={<SwapOutlined />} onClick={() => setIsSwapModalOpen(true)} style={{ background: '#059669', borderColor: '#059669' }}>
          Đề xuất đổi ca
        </Button>
      </div>

      {/* 2-Column Shift Layout (Screen 5 trong thiết kế) */}
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined style={{ color: '#059669' }} />
                <span style={{ fontWeight: 600 }}>Lịch làm việc tuần này (12/10 - 18/10/2026)</span>
              </Space>
            }
            style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
          >
            <Table dataSource={weekShifts} columns={columns} pagination={false} size="middle" />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* Card Ca hôm nay */}
            <Card
              title={<span style={{ fontWeight: 600 }}>Ca trực hôm nay</span>}
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: 14, borderRadius: 8, marginBottom: 14 }}>
                <Tag color="success" style={{ fontWeight: 600 }}>CA SÁNG</Tag>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#065f46', margin: '6px 0 2px' }}>
                  08:30 - 17:30
                </div>
                <div style={{ fontSize: 13, color: '#14532d' }}>Văn phòng chính (Tầng 4)</div>
              </div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                <div>• Trưởng ca: <strong>Trần Thị Bích</strong></div>
                <div>• Quân số ca trực: <strong>3/3 nhân sự</strong></div>
              </div>
            </Card>

            {/* Quy tắc đổi ca */}
            <Card
              title={<span style={{ fontWeight: 600 }}>Quy tắc đổi ca trực</span>}
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              <ul style={{ margin: 0, paddingLeft: 18, color: '#64748b', fontSize: 13, lineHeight: 1.7 }}>
                <li>Yêu cầu đổi ca cần gửi trước tối thiểu <strong>24 giờ</strong>.</li>
                <li>Phải có sự đồng thuận từ nhân sự hoán đổi cùng ca.</li>
                <li>AI Agent sẽ tự động kiểm tra số giờ làm việc tối đa không vượt quá 12h/ngày.</li>
              </ul>
            </Card>
          </Space>
        </Col>
      </Row>

      {/* Modal Đề xuất đổi ca */}
      <Modal
        title="Đề xuất hoán đổi ca làm việc"
        open={isSwapModalOpen}
        onCancel={() => setIsSwapModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsSwapModalOpen(false)}>Hủy</Button>,
          <Button
            key="submit"
            type="primary"
            onClick={() => {
              message.success('Đã gửi đề xuất đổi ca cho đồng nghiệp và quản lý!');
              setIsSwapModalOpen(false);
            }}
            style={{ background: '#059669', borderColor: '#059669' }}
          >
            Gửi yêu cầu
          </Button>
        ]}
      >
        <Form layout="vertical">
          <Form.Item label="Ca làm việc của bạn muốn đổi" required>
            <Select
              defaultValue="1"
              options={[
                { value: '1', label: 'Thứ Tư (14/10) - Ca Chiều (13:00 - 21:00)' },
                { value: '2', label: 'Thứ Năm (15/10) - Ca Sáng (08:30 - 17:30)' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Đồng nghiệp muốn đổi cùng" required>
            <Select
              defaultValue="vu_trong"
              options={[
                { value: 'vu_trong', label: 'Vũ Đình Trọng (Đang trực Ca Sáng 14/10)' },
                { value: 'pham_bao', label: 'Phạm Quốc Bảo (Đang trực Ca Sáng 14/10)' },
              ]}
            />
          </Form.Item>
          <Form.Item label="Lý do đổi ca" required>
            <Input.TextArea rows={3} placeholder="Ví dụ: Bận việc gia đình đột xuất buổi chiều..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ShiftsPage;
