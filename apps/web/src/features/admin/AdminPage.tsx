import React from 'react';
import { Card, Typography, Tabs, Table, Tag, Button, Space } from 'antd';
import { PlusOutlined, UserOutlined } from '@ant-design/icons';
import { MOCK_USERS } from '../../lib/mock-data';
import { RoleTag } from '../../components/common';

const { Title, Text } = Typography;

export const AdminPage: React.FC = () => {
  const usersList = Object.values(MOCK_USERS);

  const columns = [
    { title: 'Họ tên', dataIndex: 'fullName', key: 'fullName', render: (t: string) => <Text strong>{t}</Text> },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Vai trò', dataIndex: 'role', key: 'role', render: (r: string) => <RoleTag role={r} /> },
    { title: 'Phòng ban', dataIndex: 'departmentName', key: 'departmentName' },
    { title: 'Chức danh', dataIndex: 'positionName', key: 'positionName' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0 }}>
          Quản trị Hệ thống & Nhân sự (HR Admin)
        </Title>
        <Text type="secondary">Cấu hình danh mục phòng ban, tài khoản nhân viên và các quy chế phê duyệt.</Text>
      </div>

      <Card>
        <Tabs
          defaultActiveKey="employees"
          items={[
            {
              key: 'employees',
              label: 'Danh sách nhân sự',
              children: (
                <div>
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button type="primary" icon={<PlusOutlined />}>
                      Thêm nhân viên mới
                    </Button>
                  </div>
                  <Table dataSource={usersList} columns={columns} rowKey="id" pagination={false} />
                </div>
              ),
            },
            {
              key: 'policies',
              label: 'Quy định & Chính sách HR',
              children: (
                <div>
                  <Text>Cấu hình số ngày phép năm, thời gian tối thiểu nộp đơn trước ngày nghỉ (theo <code>docs/03-policy.md</code>).</Text>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default AdminPage;
