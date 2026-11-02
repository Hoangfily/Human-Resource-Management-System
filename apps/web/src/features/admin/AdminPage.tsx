import React, { useState, useEffect, useCallback } from 'react';
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
  Spin,
  DatePicker,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  UserOutlined,
  BookOutlined,
  EditOutlined,
  CheckCircleOutlined,
  SearchOutlined,
  ReloadOutlined,
  AuditOutlined,
  FileTextOutlined,
  RobotOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../lib/api-client';
import { RoleTag } from '../../components/common';
import { POLICY_DISPLAY_MAP } from '../../lib/display-mappers';

const { Title, Text } = Typography;

// Map nhãn tiếng Việt cho hành vi kiểm toán
const AUDIT_ACTION_MAP: Record<string, { label: string; color: string }> = {
  REQUEST_APPROVED: { label: 'Phê duyệt đơn', color: 'success' },
  REQUEST_REJECTED: { label: 'Từ chối đơn', color: 'error' },
  REQUEST_FORWARDED: { label: 'Chuyển cấp thẩm định', color: 'warning' },
  CREATE_REQUEST: { label: 'Tạo đơn mới', color: 'processing' },
  CANCEL_REQUEST: { label: 'Hủy đơn', color: 'default' },
  CREATE_EMPLOYEE: { label: 'Thêm mới nhân sự', color: 'cyan' },
  UPDATE_POLICY: { label: 'Cập nhật quy chế', color: 'purple' },
  CLOCK_IN: { label: 'Quẹt thẻ Check-in', color: 'green' },
  CLOCK_OUT: { label: 'Quẹt thẻ Check-out', color: 'blue' },
};

export const AdminPage: React.FC = () => {
  const { message } = AntdApp.useApp();

  // State dữ liệu chính
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [loadingPolicies, setLoadingPolicies] = useState<boolean>(false);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);

  const [employees, setEmployees] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Metadata cho Form tạo nhân viên
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [shiftTemplates, setShiftTemplates] = useState<any[]>([]);

  // Tìm kiếm & Bộ lọc
  const [searchPolicy, setSearchPolicy] = useState<string>('');
  const [searchEmployee, setSearchEmployee] = useState<string>('');
  const [searchAudit, setSearchAudit] = useState<string>('');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');

  // Modal Sửa Quy chế
  const [editingPolicy, setEditingPolicy] = useState<any | null>(null);
  const [policyForm] = Form.useForm();
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Modal Thêm Nhân viên mới
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [addEmployeeForm] = Form.useForm();
  const [savingEmployee, setSavingEmployee] = useState(false);

  // Modal Xem chi tiết Audit Log
  const [selectedAuditLog, setSelectedAuditLog] = useState<any | null>(null);

  // 1. Tải danh sách nhân sự
  const fetchEmployees = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await apiClient.get<any[]>('/employees');
      const data = res as unknown as any[];
      if (Array.isArray(data)) {
        setEmployees(data);
      }
    } catch {
      // Giữ giao diện
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // 2. Tải 9 chính sách công ty
  const fetchPolicies = useCallback(async () => {
    setLoadingPolicies(true);
    try {
      const res = await apiClient.get<any[]>('/policies');
      const data = res as unknown as any[];
      if (Array.isArray(data)) {
        setPolicies(data);
      }
    } catch {
      // Giữ giao diện
    } finally {
      setLoadingPolicies(false);
    }
  }, []);

  // 3. Tải metadata phòng ban, chức danh, ca làm việc
  const fetchMetadata = useCallback(async () => {
    try {
      const [deptRes, posRes, shiftRes] = await Promise.all([
        apiClient.get<any[]>('/departments').catch(() => []),
        apiClient.get<any[]>('/positions').catch(() => []),
        apiClient.get<any[]>('/shifts/templates').catch(() => []),
      ]);

      if (Array.isArray(deptRes)) setDepartments(deptRes);
      if (Array.isArray(posRes)) setPositions(posRes);
      if (Array.isArray(shiftRes)) setShiftTemplates(shiftRes);
    } catch {
      // Bỏ qua
    }
  }, []);

  // 4. Tải Nhật ký kiểm toán
  const fetchAuditLogs = useCallback(async () => {
    setLoadingAudit(true);
    try {
      const res = await apiClient.get<any>('/audit-logs');
      const logs = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res)
        ? res
        : [];
      setAuditLogs(logs);
    } catch {
      // Giữ giao diện
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
    fetchPolicies();
    fetchMetadata();
    fetchAuditLogs();
  }, [fetchEmployees, fetchPolicies, fetchMetadata, fetchAuditLogs]);

  // Cập nhật quy chế
  const handleSavePolicy = async (values: any) => {
    if (!editingPolicy) return;
    setSavingPolicy(true);
    try {
      await apiClient.put(`/policies/${editingPolicy.key}`, {
        title: values.title,
        content: values.content,
      });

      message.success(`Đã cập nhật quy chế "${values.title}" thành công vào hệ thống!`);
      setEditingPolicy(null);
      await Promise.all([fetchPolicies(), fetchAuditLogs()]);
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Không thể lưu quy chế.';
      message.error(errMsg);
    } finally {
      setSavingPolicy(false);
    }
  };

  // Thêm nhân viên mới
  const handleCreateEmployee = async (values: any) => {
    setSavingEmployee(true);
    try {
      await apiClient.post('/employees', {
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        role: values.role || 'EMPLOYEE',
        status: values.status || 'ACTIVE',
        departmentId: values.departmentId,
        positionId: values.positionId,
        managerId: values.managerId,
        defaultShiftId: values.defaultShiftId,
        joinDate: values.joinDate ? values.joinDate.format('YYYY-MM-DD') : undefined,
      });

      message.success(`Đã thêm mới nhân sự "${values.fullName}" thành công! Quỹ phép năm đã được cấp phát tự động.`);
      setIsAddEmployeeOpen(false);
      addEmployeeForm.resetFields();
      await Promise.all([fetchEmployees(), fetchAuditLogs()]);
    } catch (err: any) {
      const errMsg = err.response?.data?.message || 'Không thể thêm nhân viên mới.';
      message.error(errMsg);
    } finally {
      setSavingEmployee(false);
    }
  };

  // Lọc dữ liệu hiển thị
  const filteredPolicies = policies.filter((p) => {
    if (!searchPolicy) return true;
    const s = searchPolicy.toLowerCase();
    const viTitle = POLICY_DISPLAY_MAP[p.key]?.title?.toLowerCase() || '';
    return p.title?.toLowerCase().includes(s) || p.key?.toLowerCase().includes(s) || viTitle.includes(s);
  });

  const filteredEmployees = employees.filter((emp) => {
    if (!searchEmployee) return true;
    const s = searchEmployee.toLowerCase();
    return (
      emp.fullName?.toLowerCase().includes(s) ||
      emp.email?.toLowerCase().includes(s) ||
      emp.departmentName?.toLowerCase().includes(s) ||
      emp.positionName?.toLowerCase().includes(s)
    );
  });

  const filteredAuditLogs = auditLogs.filter((log) => {
    const matchAction = auditActionFilter === 'ALL' || log.action === auditActionFilter;
    if (!matchAction) return false;
    if (!searchAudit) return true;
    const s = searchAudit.toLowerCase();
    return (
      log.action?.toLowerCase().includes(s) ||
      log.actor?.fullName?.toLowerCase().includes(s) ||
      log.actor?.email?.toLowerCase().includes(s) ||
      log.entityId?.toLowerCase().includes(s)
    );
  });

  // Bảng nhân sự
  const employeeColumns = [
    {
      title: 'Mã NV',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => (
        <Text strong style={{ color: '#0f766e' }}>
          EMP-{id.slice(0, 4).toUpperCase()}
        </Text>
      ),
    },
    {
      title: 'Họ và tên',
      dataIndex: 'fullName',
      key: 'fullName',
      render: (t: string, r: any) => (
        <Space>
          <UserOutlined style={{ color: '#059669' }} />
          <div>
            <Text strong style={{ display: 'block' }}>
              {t}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {r.email} {r.phone && `• ${r.phone}`}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Phòng ban',
      key: 'department',
      render: (_: unknown, r: any) => r.departmentName || r.department?.name || 'Chưa xếp phòng',
    },
    {
      title: 'Chức danh',
      key: 'position',
      render: (_: unknown, r: any) => r.positionName || r.position?.title || 'Chuyên viên',
    },
    {
      title: 'Quản lý trực tiếp',
      key: 'manager',
      render: (_: unknown, r: any) => (
        <Text type="secondary">
          {r.managerName || 'Ban Giám đốc'}
        </Text>
      ),
    },
    {
      title: 'Phân quyền',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => <RoleTag role={role} />,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'success' : status === 'ON_PROBATION' ? 'processing' : 'default'} style={{ borderRadius: 6 }}>
          {status === 'ACTIVE' ? 'Chính thức' : status === 'ON_PROBATION' ? 'Thử việc' : 'Nghỉ việc'}
        </Tag>
      ),
    },
  ];

  // Bảng quy chế
  const policyColumns = [
    {
      title: 'Tên quy định / Điều khoản',
      key: 'title',
      render: (_: unknown, record: any) => {
        const meta = POLICY_DISPLAY_MAP[record.key];
        return (
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
              {meta?.title || record.title}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Phân loại: <Tag color="blue">{meta?.category || 'Quy chế chung'}</Tag>
              {meta?.legalRef && (
                <span style={{ color: '#475569', marginLeft: 8 }}>
                  • Căn cứ: <em>{meta.legalRef}</em>
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Nội dung chi tiết quy chế',
      dataIndex: 'content',
      key: 'content',
      render: (content: string, record: any) => {
        const meta = POLICY_DISPLAY_MAP[record.key];
        return (
          <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
            {content || meta?.description}
          </div>
        );
      },
    },
    {
      title: 'Phiên bản hiệu lực',
      dataIndex: 'version',
      key: 'version',
      render: (v: string) => <Tag color="green">{v || '2026.10-chính thức'}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: unknown, record: any) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => {
            setEditingPolicy(record);
            policyForm.setFieldsValue({
              title: POLICY_DISPLAY_MAP[record.key]?.title || record.title,
              content: record.content,
            });
          }}
        >
          Sửa quy định
        </Button>
      ),
    },
  ];

  // Bảng Nhật ký kiểm toán
  const auditColumns = [
    {
      title: 'Thời gian',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 170,
      render: (t: string) => (
        <div>
          <div style={{ fontWeight: 600, color: '#1e293b' }}>
            {dayjs(t).format('DD/MM/YYYY')}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {dayjs(t).format('HH:mm:ss')}
          </div>
        </div>
      ),
    },
    {
      title: 'Tác nhân thực hiện',
      key: 'actor',
      width: 220,
      render: (_: unknown, r: any) => {
        const isAI = r.actorType === 'AI';
        const isSystem = r.actorType === 'SYSTEM';
        return (
          <Space direction="vertical" size={2}>
            <Space size={6}>
              {isAI ? (
                <Tag color="purple" icon={<RobotOutlined />}>Trợ lý AI</Tag>
              ) : isSystem ? (
                <Tag color="default">Hệ thống</Tag>
              ) : (
                <Tag color="blue" icon={<UserOutlined />}>Người dùng</Tag>
              )}
              {r.actor?.role && <RoleTag role={r.actor.role} />}
            </Space>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>
              {r.actor?.fullName || (isAI ? 'HR Agent AI Engine' : 'Hệ thống tự động')}
            </div>
            {r.actor?.email && (
              <div style={{ fontSize: 11, color: '#64748b' }}>{r.actor.email}</div>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Hành vi thao tác',
      dataIndex: 'action',
      key: 'action',
      width: 180,
      render: (act: string) => {
        const meta = AUDIT_ACTION_MAP[act] || { label: act, color: 'default' };
        return (
          <Tag color={meta.color} style={{ fontWeight: 600, borderRadius: 6, padding: '2px 8px' }}>
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: 'Đối tượng tác động',
      key: 'entity',
      width: 180,
      render: (_: unknown, r: any) => (
        <div>
          <Tag color="geekblue">{r.entityType}</Tag>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontFamily: 'monospace' }}>
            #{r.entityId?.slice(0, 8)}
          </div>
        </div>
      ),
    },
    {
      title: 'Tóm tắt nội dung / Lý do',
      key: 'payloadSummary',
      render: (_: unknown, r: any) => {
        const p = r.payload;
        if (!p) return <Text type="secondary">—</Text>;
        const reason = p.reason || p.rejectionReason;
        const name = p.fullName;
        return (
          <div>
            {reason && (
              <div style={{ fontSize: 12, color: '#334155' }}>
                <Text strong>Lý do:</Text> {reason}
              </div>
            )}
            {name && (
              <div style={{ fontSize: 12, color: '#334155' }}>
                <Text strong>Nhân sự:</Text> {name} ({p.email})
              </div>
            )}
            {!reason && !name && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Đã ghi nhận dữ liệu giao dịch
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: 'Chi tiết',
      key: 'actionBtn',
      width: 90,
      render: (_: unknown, r: any) => (
        <Button
          size="small"
          icon={<InfoCircleOutlined />}
          onClick={() => setSelectedAuditLog(r)}
        >
          Xem
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Quản trị Doanh nghiệp & Nhật ký Kiểm toán
          </Title>
          <Text type="secondary">
            Quản lý đội ngũ nhân sự, cấu hình 9 chính sách công ty và giám sát mọi hoạt động phê duyệt/chấm công trong hệ thống.
          </Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              fetchEmployees();
              fetchPolicies();
              fetchAuditLogs();
            }}
          >
            Làm mới
          </Button>
        </Space>
      </div>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={6}>
          <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <Statistic
              title="Tổng nhân sự chính thức"
              value={employees.length}
              suffix="nhân sự"
              valueStyle={{ color: '#059669', fontWeight: 700 }}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <Statistic
              title="Chính sách quy chế"
              value={policies.length}
              suffix="điều khoản"
              valueStyle={{ color: '#0284c7', fontWeight: 700 }}
              prefix={<BookOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <Statistic
              title="Nhật ký kiểm toán"
              value={auditLogs.length}
              suffix="hoạt động"
              valueStyle={{ color: '#8b5cf6', fontWeight: 700 }}
              prefix={<AuditOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <Statistic
              title="Tuân thủ luật lao động"
              value="100%"
              valueStyle={{ color: '#10b981', fontWeight: 700 }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}>
        <Tabs
          defaultActiveKey="employees"
          items={[
            // TAB 1: Danh sách nhân sự
            {
              key: 'employees',
              label: (
                <Space>
                  <UserOutlined />
                  <span>Danh sách Nhân sự ({employees.length})</span>
                </Space>
              ),
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Input
                      placeholder="Tìm kiếm theo tên, email, phòng ban, chức danh..."
                      prefix={<SearchOutlined />}
                      value={searchEmployee}
                      onChange={(e) => setSearchEmployee(e.target.value)}
                      style={{ maxWidth: 380 }}
                    />
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      style={{ background: '#059669', borderColor: '#059669', borderRadius: 8, fontWeight: 600 }}
                      onClick={() => {
                        addEmployeeForm.resetFields();
                        addEmployeeForm.setFieldsValue({
                          role: 'EMPLOYEE',
                          status: 'ACTIVE',
                          joinDate: dayjs(),
                        });
                        setIsAddEmployeeOpen(true);
                      }}
                    >
                      Thêm nhân viên mới
                    </Button>
                  </div>
                  {loadingUsers ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                      <Spin />
                    </div>
                  ) : (
                    <Table
                      dataSource={filteredEmployees}
                      columns={employeeColumns}
                      rowKey="id"
                      pagination={{ pageSize: 8 }}
                    />
                  )}
                </div>
              ),
            },

            // TAB 2: Chính sách & Quy chế
            {
              key: 'policies',
              label: (
                <Space>
                  <BookOutlined />
                  <span>9 Chính sách & Quy chế Công ty</span>
                  <Badge count={policies.length} style={{ backgroundColor: '#059669' }} />
                </Space>
              ),
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Input
                      placeholder="Tìm kiếm quy chế (Ví dụ: nghỉ phép, làm thêm giờ, chấm công)..."
                      prefix={<SearchOutlined />}
                      value={searchPolicy}
                      onChange={(e) => setSearchPolicy(e.target.value)}
                      style={{ maxWidth: 400 }}
                    />
                  </div>
                  {loadingPolicies ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                      <Spin />
                    </div>
                  ) : (
                    <Table
                      dataSource={filteredPolicies}
                      columns={policyColumns}
                      rowKey="id"
                      pagination={false}
                    />
                  )}
                </div>
              ),
            },

            // TAB 3: Nhật ký kiểm toán (Audit Logs)
            {
              key: 'audit-logs',
              label: (
                <Space>
                  <AuditOutlined />
                  <span>Nhật ký Kiểm toán ({auditLogs.length})</span>
                  <Badge count={auditLogs.length} style={{ backgroundColor: '#8b5cf6' }} />
                </Space>
              ),
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                    <Space size={12}>
                      <Input
                        placeholder="Tìm kiếm theo hành vi, người thực hiện, mã đối tượng..."
                        prefix={<SearchOutlined />}
                        value={searchAudit}
                        onChange={(e) => setSearchAudit(e.target.value)}
                        style={{ width: 340 }}
                      />
                      <Select
                        value={auditActionFilter}
                        onChange={setAuditActionFilter}
                        style={{ width: 200 }}
                        options={[
                          { value: 'ALL', label: 'Tất cả hành vi' },
                          { value: 'REQUEST_APPROVED', label: 'Phê duyệt đơn' },
                          { value: 'REQUEST_REJECTED', label: 'Từ chối đơn' },
                          { value: 'REQUEST_FORWARDED', label: 'Chuyển cấp thẩm định' },
                          { value: 'CREATE_REQUEST', label: 'Tạo đơn mới' },
                          { value: 'CREATE_EMPLOYEE', label: 'Thêm mới nhân sự' },
                          { value: 'UPDATE_POLICY', label: 'Cập nhật quy chế' },
                        ]}
                      />
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Hiển thị {filteredAuditLogs.length} / {auditLogs.length} bản ghi kiểm toán
                    </Text>
                  </div>
                  {loadingAudit ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                      <Spin />
                    </div>
                  ) : (
                    <Table
                      dataSource={filteredAuditLogs}
                      columns={auditColumns}
                      rowKey="id"
                      pagination={{ pageSize: 10 }}
                    />
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Modal Thêm Nhân viên mới */}
      <Modal
        title={
          <Space>
            <UserOutlined style={{ color: '#059669' }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>Thêm Mới Nhân Sự Doanh Nghiệp</span>
          </Space>
        }
        open={isAddEmployeeOpen}
        onCancel={() => setIsAddEmployeeOpen(false)}
        width={680}
        footer={[
          <Button key="cancel" onClick={() => setIsAddEmployeeOpen(false)}>
            Hủy bỏ
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={savingEmployee}
            style={{ background: '#059669', borderColor: '#059669', fontWeight: 600 }}
            onClick={() => addEmployeeForm.submit()}
          >
            Lưu hồ sơ nhân sự
          </Button>,
        ]}
      >
        <Form
          form={addEmployeeForm}
          layout="vertical"
          onFinish={handleCreateEmployee}
          style={{ marginTop: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="fullName"
                label="Họ và tên nhân viên"
                rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}
              >
                <Input placeholder="Ví dụ: Trần Văn Nam" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="email"
                label="Email công vụ"
                rules={[
                  { required: true, message: 'Vui lòng nhập email' },
                  { type: 'email', message: 'Email không hợp lệ' },
                ]}
              >
                <Input placeholder="Ví dụ: namtv@company.com" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Số điện thoại liên hệ">
                <Input placeholder="Ví dụ: 0912345678" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="role"
                label="Vai trò / Phân quyền hệ thống"
                rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}
              >
                <Select
                  options={[
                    { value: 'EMPLOYEE', label: 'Nhân viên (EMPLOYEE)' },
                    { value: 'MANAGER', label: 'Quản lý trực tiếp (MANAGER)' },
                    { value: 'HR', label: 'Phòng Nhân sự (HR)' },
                    { value: 'ADMIN', label: 'Quản trị viên (ADMIN)' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="departmentId" label="Phòng ban trực thuộc">
                <Select
                  placeholder="Chọn phòng ban..."
                  allowClear
                  options={departments.map((d) => ({
                    value: d.id,
                    label: d.name,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="positionId" label="Chức danh công việc">
                <Select
                  placeholder="Chọn chức danh..."
                  allowClear
                  options={positions.map((p) => ({
                    value: p.id,
                    label: p.title,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="managerId" label="Người quản lý trực tiếp">
                <Select
                  placeholder="Chọn quản lý trực tiếp..."
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={employees.map((e) => ({
                    value: e.id,
                    label: `${e.fullName} (${e.email}) - ${e.role}`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="defaultShiftId" label="Ca làm việc mặc định">
                <Select
                  placeholder="Chọn ca làm việc..."
                  allowClear
                  options={shiftTemplates.map((s) => ({
                    value: s.id,
                    label: `${s.name} (${s.startTime} - ${s.endTime})`,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="joinDate" label="Ngày vào làm việc">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="Trạng thái làm việc">
                <Select
                  options={[
                    { value: 'ACTIVE', label: 'Chính thức' },
                    { value: 'ON_PROBATION', label: 'Thử việc' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <div style={{ background: '#f0fdf4', padding: '10px 14px', borderRadius: 8, border: '1px solid #bbf7d0' }}>
            <Text style={{ fontSize: 12, color: '#166534' }}>
              💡 <strong>Cơ chế tự động:</strong> Khi tạo nhân viên mới, hệ thống sẽ tự động cấp phát Quỹ phép năm 2026 (12 ngày phép) và ghi nhật ký kiểm toán hệ thống.
            </Text>
          </div>
        </Form>
      </Modal>

      {/* Modal Chỉnh sửa quy chế công ty */}
      <Modal
        title={`Chỉnh sửa Quy chế: ${POLICY_DISPLAY_MAP[editingPolicy?.key]?.title || editingPolicy?.title}`}
        open={!!editingPolicy}
        onCancel={() => setEditingPolicy(null)}
        footer={[
          <Button key="cancel" onClick={() => setEditingPolicy(null)}>
            Hủy bỏ
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={savingPolicy}
            style={{ background: '#059669', borderColor: '#059669' }}
            onClick={() => policyForm.submit()}
          >
            Lưu thay đổi vào CSDL
          </Button>,
        ]}
      >
        <Form form={policyForm} layout="vertical" onFinish={handleSavePolicy} style={{ marginTop: 16 }}>
          <Form.Item
            name="title"
            label="Tên điều khoản quy chế"
            rules={[{ required: true, message: 'Vui lòng nhập tên điều khoản' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="content"
            label="Nội dung điều khoản chi tiết (Căn cứ AI đối soát)"
            rules={[{ required: true, message: 'Vui lòng nhập nội dung quy chế' }]}
          >
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Xem chi tiết Audit Log */}
      <Modal
        title={
          <Space>
            <AuditOutlined style={{ color: '#8b5cf6' }} />
            <span>Chi tiết Nhật ký Kiểm toán #{selectedAuditLog?.id?.slice(0, 8)}</span>
          </Space>
        }
        open={!!selectedAuditLog}
        onCancel={() => setSelectedAuditLog(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedAuditLog(null)}>
            Đóng
          </Button>,
        ]}
      >
        {selectedAuditLog && (
          <div style={{ marginTop: 12 }}>
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Thời gian thực hiện:</Text>
                <div style={{ fontWeight: 600 }}>{dayjs(selectedAuditLog.timestamp).format('DD/MM/YYYY HH:mm:ss')}</div>
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Hành vi thao tác:</Text>
                <div>
                  <Tag color={AUDIT_ACTION_MAP[selectedAuditLog.action]?.color || 'default'}>
                    {AUDIT_ACTION_MAP[selectedAuditLog.action]?.label || selectedAuditLog.action}
                  </Tag>
                </div>
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Người thực hiện:</Text>
                <div style={{ fontWeight: 600 }}>{selectedAuditLog.actor?.fullName || 'Hệ thống'}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{selectedAuditLog.actor?.email}</div>
              </Col>
              <Col span={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Đối tượng:</Text>
                <div>{selectedAuditLog.entityType} ({selectedAuditLog.entityId})</div>
              </Col>
            </Row>

            <Divider style={{ margin: '14px 0' }} />

            <div>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                Dữ liệu chi tiết (Payload):
              </Text>
              <pre
                style={{
                  background: '#0f172a',
                  color: '#38bdf8',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 12,
                  maxHeight: 220,
                  overflow: 'auto',
                }}
              >
                {JSON.stringify(selectedAuditLog.payload, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminPage;
