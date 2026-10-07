import React from 'react';
import { Card, Typography, Table, Tag, Space, Descriptions } from 'antd';
import { RobotOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export const AgentTracePage: React.FC = () => {
  const traces = [
    {
      id: 'trace-101',
      user: 'Nguyễn Văn An',
      intent: 'LEAVE_REQUEST',
      toolsCalled: ['get_employee', 'get_leave_balance', 'check_request', 'create_request'],
      riskScore: 0.1,
      status: 'SUCCESS',
      createdAt: '2026-10-07 14:15:20',
    },
    {
      id: 'trace-102',
      user: 'Trần Thị Bích',
      intent: 'POLICY_QA',
      toolsCalled: ['policy_retriever'],
      riskScore: 0.0,
      status: 'SUCCESS',
      createdAt: '2026-10-07 11:20:05',
    },
  ];

  const columns = [
    { title: 'Mã Trace', dataIndex: 'id', key: 'id', render: (id: string) => <Text code>{id}</Text> },
    { title: 'Người thực hiện', dataIndex: 'user', key: 'user' },
    { title: 'Ý định nhận diện', dataIndex: 'intent', key: 'intent', render: (t: string) => <Tag color="blue">{t}</Tag> },
    {
      title: 'Tools đã gọi',
      dataIndex: 'toolsCalled',
      key: 'tools',
      render: (tools: string[]) => (
        <Space wrap>
          {tools.map((tool) => (
            <Tag key={tool} color="purple">
              {tool}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: () => <Tag color="success">Thành công</Tag>,
    },
    { title: 'Thời gian', dataIndex: 'createdAt', key: 'createdAt' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: 0 }}>
          Nhật ký Suy luận AI (Agent Traces)
        </Title>
        <Text type="secondary">
          Theo dõi minh bạch các lượt gọi tool, quy trình suy luận (LangGraph) và kiểm duyệt quy chuẩn của Trợ lý AI.
        </Text>
      </div>

      <Card>
        <Table dataSource={traces} columns={columns} rowKey="id" pagination={false} />
      </Card>
    </div>
  );
};

export default AgentTracePage;
