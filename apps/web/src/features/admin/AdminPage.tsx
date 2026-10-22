import React, { useState } from 'react';
import {
  Card,
  Typography,
  Tabs,
  Table,
  Tag,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  App as AntdApp,
  Badge,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  PlusOutlined,
  UserOutlined,
  BookOutlined,
  EditOutlined,
  CheckCircleOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Role } from '@hr-agent/shared';
import { MOCK_USERS } from '../../lib/mock-data';
import { RoleTag } from '../../components/common';
import { User } from '../../types';

const { Title, Text, Paragraph } = Typography;

interface PolicyItem {
  key: string;
  category: 'LEAVE' | 'OVERTIME' | 'ATTENDANCE' | 'GENERAL';
  title: string;
  value: string;
  unit: string;
  description: string;
  version: string;
}

const INITIAL_POLICIES: PolicyItem[] = [
  {
    key: 'LEAVE.ANNUAL_DAYS_PER_YEAR',
    category: 'LEAVE',
    title: 'Số ngày phép năm tiêu chuẩn',
    value: '12',
    unit: 'ngày/năm',
    description: 'Tiêu chuẩn phép năm hưởng nguyên lương theo Điều 113 Bộ luật Lao động 2019.',
    version: '2026.10-draft',
  },
  {
    key: 'LEAVE.NOTICE_DAYS',
    category: 'LEAVE',
    title: 'Thời hạn báo trước khi nghỉ phép',
    value: '3 ngày (đơn ≤ 2 ngày); 7 ngày (đơn > 2 ngày)',
    unit: 'ngày làm việc',
    description: 'Quy định thời gian nộp đơn trước ngày nghỉ để sắp xếp nhân sự thay thế.',
    version: '2026.10-draft',
  },
  {
    key: 'LEAVE.SICK_CERT_REQUIRED_AFTER_DAYS',
    category: 'LEAVE',
    title: 'Yêu cầu giấy khám bệnh khi nghỉ ốm',
    value: '2',
    unit: 'ngày',
    description: 'Nghỉ ốm trên 02 ngày liên tiếp bắt buộc đính kèm giấy xác nhận của cơ sở y tế.',
    version: '2026.10-draft',
  },
  {
    key: 'OT.MAX_HOURS_PER_MONTH',
    category: 'OVERTIME',
    title: 'Giờ làm thêm tối đa trong tháng',
    value: '40',
    unit: 'giờ/tháng',
    description: 'Trần thời gian OT theo Điều 107 Bộ luật Lao động 2019.',
    version: '2026.10-draft',
  },
  {
    key: 'OT.MAX_TOTAL_HOURS_PER_DAY',
    category: 'OVERTIME',
    title: 'Tổng giờ làm việc tối đa trong ngày',
    value: '12',
    unit: 'giờ/ngày',
    description: 'Tổng giờ làm việc bình thường + làm thêm không vượt quá 12h/ngày.',
    version: '2026.10-draft',
  },
  {
    key: 'ATTENDANCE.EXPLAIN_WITHIN_DAYS',
    category: 'ATTENDANCE',
    title: 'Thời hạn nộp giải trình chấm công',
    value: '3',
    unit: 'ngày làm việc',
    description: 'Thời hạn nhân viên gửi giải trình sau khi phát sinh sự cố quên quẹt thẻ / đi muộn.',
    version: '2026.10-draft',
  },
  {
    key: 'ATTENDANCE.MAX_AUTO_PER_MONTH',
    category: 'ATTENDANCE',
    title: 'Hạn mức giải trình tự động trong tháng',
    value: '3',
    unit: 'lần/tháng',
    description: 'Số lần quên chấm công tối đa được AI xem xét tự động trước khi phải escalate.',
    version: '2026.10-draft',
  },
  {
    key: 'ATTENDANCE.GRACE_PERIOD_MINUTES',
    category: 'ATTENDANCE',
    title: 'Thời gian ân hạn đi muộn',
    value: '15',
    unit: 'phút/ca',
    description: 'Số phút đến muộn tối đa không bị tính là vi phạm kỷ luật chấm công.',
    version: '2026.10-draft',
  },
];

export const AdminPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [usersList, setUsersList] = useState<User[]>(Object.values(MOCK_USERS));
  const [policies, setPolicies] = useState<PolicyItem[]>(INITIAL_POLICIES);

  // Modal thêm nhân viên
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [userForm] = Form.useForm();

  // Modal sửa quy chế
  const [editingPolicy, setEditingPolicy] = useState<PolicyItem | null>(null);
  const [policyForm] = Form.useForm();

  // Xử lý thêm nhân viên
  const handleAddUser = (values: any) => {
    const newUser: User = {
      id: `emp-00${usersList.length + 1}`,
      fullName: values.fullName,
      email: values.email,
      role: values.role,
      departmentName: values.departmentName,
      positionName: values.positionName,
    };
    setUsersList([...usersList, newUser]);
    message.success(`Đã thêm nhân viên ${values.fullName} thành công!`);
    setIsAddUserModalOpen(false);
    userForm.resetFields();
  };

  // Xử lý sửa chính sách
  const handleEditPolicy = (values: any) => {
    if (!editingPolicy) return;
    setPolicies((prev) =>
      prev.map((p) =>
        p.key === editingPolicy.key
          ? { ...p, value: values.value, description: values.description }
          : p
      )
    );
    message.success(`Đã cập nhật quy chế ${editingPolicy.key} thành công!`);
    setEditingPolicy(null);
  };

  const employeeColumns = [
    {
      title: 'Họ và tên',
      dataIndex: 'fullName',
      key: 'fullName',
      render: (t: string) => (
        <Space>
          <UserOutlined style={{ color: '#059669' }} />
          <Text strong>{t}</Text>
        </Space>
      ),
    },
    { title: 'Email liên hệ', dataIndex: 'email', key: 'email' },
    {
      title: 'Vai trò (Role)',
      dataIndex: 'role',
      key: 'role',
      render: (r: string) => <RoleTag role={r} />,
    },
    { title: 'Phòng ban', dataIndex: 'departmentName', key: 'departmentName' },
    { title: 'Chức danh', dataIndex: 'positionName', key: 'positionName' },
  ];

  const policyColumns = [
    {
      title: 'Mã quy chế (Policy Key)',
      dataIndex: 'key',
      key: 'key',
      render: (key: string) => (
        <Text code style={{ color: '#0f766e', fontWeight: 600 }}>
          {key}
        </Text>
      ),
    },
    {
      title: 'Tên quy định',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, record: PolicyItem) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0f172a' }}>{title}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{record.description}</div>
        </div>
      ),
    },
    {
      title: 'Giá trị áp dụng',
      dataIndex: 'value',
      key: 'value',
      render: (val: string, record: PolicyItem) => (
        <Tag color="green" style={{ fontSize: 13, padding: '2px 8px' }}>
          {val} {record.unit ? `(${record.unit})` : ''}
        </Tag>
      ),
    },
    {
      title: 'Phiên bản',
      dataIndex: 'version',
      key: 'version',
      render: (v: string) => <Tag color="default">{v}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: unknown, record: PolicyItem) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            setEditingPolicy(record);
            policyForm.setFieldsValue({
              value: record.value,
              description: record.description,
            });
          }}
        >
          Sửa
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0 }}>
          Quản trị Hệ thống & Quy chế Nhân sự (HR Admin)
        </Title>
        <Text type="secondary">
          Quản lý tài khoản nhân sự, phân quyền vai trò và cấu hình các thông số chính sách công ty (docs/03-policy.md).
        </Text>
      </div>

      <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <Tabs
          defaultActiveKey="policies"
          items={[
            // TAB 1: CẤU HÌNH QUY CHẾ HR (POLICY MANAGEMENT)
            {
              key: 'policies',
              label: (
                <Space>
                  <BookOutlined />
                  <span>Quy định & Chính sách HR ({policies.length})</span>
                </Space>
              ),
              children: (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 16,
                      background: '#f8fafc',
                      padding: 12,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div>
                      <Text strong style={{ color: '#0f172a' }}>
                        Phiên bản quy chế hoạt động:
                      </Text>{' '}
                      <Tag color="cyan">2026.10-draft</Tag>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                        Các thông số này được nạp vào Rule Engine và RAG của AI Copilot để thẩm định đơn từ.
                      </Text>
                    </div>
                    <Tag color="green" icon={<SafetyCertificateOutlined />}>
                      Đang hiệu lực
                    </Tag>
                  </div>
                  <Table
                    dataSource={policies}
                    columns={policyColumns}
                    rowKey="key"
                    pagination={false}
                  />
                </div>
              ),
            },

            // TAB 2: QUẢN LÝ DANH SÁCH NHÂN SỰ
            {
              key: 'employees',
              label: (
                <Space>
                  <UserOutlined />
                  <span>Danh sách nhân sự ({usersList.length})</span>
                </Space>
              ),
              children: (
                <div>
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => setIsAddUserModalOpen(true)}
                      style={{ background: '#059669', borderColor: '#059669' }}
                    >
                      Thêm nhân viên mới
                    </Button>
                  </div>
                  <Table
                    dataSource={usersList}
                    columns={employeeColumns}
                    rowKey="id"
                    pagination={false}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Modal Thêm nhân viên */}
      <Modal
        title="Thêm nhân viên mới"
        open={isAddUserModalOpen}
        onCancel={() => setIsAddUserModalOpen(false)}
        footer={null}
      >
        <Form form={userForm} layout="vertical" onFinish={handleAddUser}>
          <Form.Item
            name="fullName"
            label="Họ và tên"
            rules={[{ required: true, message: 'Vui lòng nhập họ tên!' }]}
          >
            <Input placeholder="Ví dụ: Lê Thị Hoa" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email công ty"
            rules={[{ required: true, type: 'email', message: 'Vui lòng nhập email hợp lệ!' }]}
          >
            <Input placeholder="hoa.le@company.com" />
          </Form.Item>
          <Form.Item
            name="role"
            label="Vai trò (Role)"
            initialValue={Role.Employee}
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: Role.Employee, label: 'Nhân viên (Employee)' },
                { value: Role.Manager, label: 'Quản lý (Manager)' },
                { value: Role.HR, label: 'Quản trị HR (HR)' },
                { value: Role.Admin, label: 'Quản trị viên (Admin)' },
              ]}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="departmentName"
                label="Phòng ban"
                initialValue="Phòng Công nghệ Thông tin"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="positionName"
                label="Chức danh"
                initialValue="Kỹ sư phần mềm"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setIsAddUserModalOpen(false)}>Hủy</Button>
            <Button
              type="primary"
              htmlType="submit"
              style={{ background: '#059669', borderColor: '#059669' }}
            >
              Lưu nhân viên
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal Sửa quy chế */}
      <Modal
        title={`Chỉnh sửa quy chế: ${editingPolicy?.key}`}
        open={Boolean(editingPolicy)}
        onCancel={() => setEditingPolicy(null)}
        footer={null}
      >
        <Form form={policyForm} layout="vertical" onFinish={handleEditPolicy}>
          <Form.Item
            name="value"
            label="Giá trị quy định áp dụng"
            rules={[{ required: true, message: 'Vui lòng nhập giá trị!' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="description"
            label="Mô tả chi tiết"
            rules={[{ required: true, message: 'Vui lòng nhập mô tả!' }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setEditingPolicy(null)}>Hủy</Button>
            <Button
              type="primary"
              htmlType="submit"
              style={{ background: '#059669', borderColor: '#059669' }}
            >
              Lưu thay đổi
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminPage;
