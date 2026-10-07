import React, { useState } from 'react';
import { Card, Typography, Switch, Radio, Slider, Space, Divider, Row, Col, Alert, Tag, Button, App as AntdApp } from 'antd';
import { SlidersOutlined, RobotOutlined, SafetyCertificateOutlined, SaveOutlined } from '@ant-design/icons';
import { AutonomyLevel } from '@hr-agent/shared';

const { Title, Text, Paragraph } = Typography;

export const AgentSettingsPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>(AutonomyLevel.AutoApproveLowRisk);
  const [autoApproveLowRisk, setAutoApproveLowRisk] = useState<boolean>(false);
  const [riskThreshold, setRiskThreshold] = useState<number>(10);
  const [piiFilter, setPiiFilter] = useState<boolean>(true);
  const [ragPolicyCheck, setRagPolicyCheck] = useState<boolean>(true);

  const handleSave = () => {
    message.success('Đã lưu cấu hình hoạt động của AI Agent thành công!');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Cấu hình Trợ lý AI (Agent Settings)
          </Title>
          <Text type="secondary">
            Thiết lập mức độ tự chủ (Autonomy Level), phân quyền gọi Tool và quy tắc can thiệp của con người (Human-in-the-loop).
          </Text>
        </div>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} style={{ background: '#059669', borderColor: '#059669' }}>
          Lưu cấu hình
        </Button>
      </div>

      <Row gutter={[20, 20]}>
        {/* Cột trái: Cấu hình mức độ tự chủ & Ngưỡng rủi ro */}
        <Col xs={24} lg={15}>
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {/* Cấp độ tự chủ (Autonomy Level) */}
            <Card
              title={
                <Space>
                  <RobotOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 600 }}>Cấp độ tự chủ của Agent (Autonomy Level)</span>
                </Space>
              }
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              <Radio.Group
                value={autonomyLevel}
                onChange={(e) => setAutonomyLevel(e.target.value)}
                style={{ width: '100%' }}
              >
                <Space direction="vertical" size={14} style={{ width: '100%' }}>
                  <Radio value={AutonomyLevel.SuggestOnly}>
                    <div>
                      <Text strong>1. Chỉ đề xuất (Suggest Only - Chỉ đọc)</Text>
                      <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
                        AI chỉ tra cứu quy chế, giải thích chính sách và trả lời câu hỏi. Mọi đề xuất quyết định đều ESCALATED cho con người duyệt.
                      </div>
                    </div>
                  </Radio>
                  <Divider style={{ margin: '6px 0' }} />
                  <Radio value={AutonomyLevel.AutoApproveLowRisk}>
                    <div>
                      <Text strong>2. Tự động duyệt rủi ro thấp (Auto Approve Low Risk - Khuyên dùng)</Text>
                      <Tag color="green" style={{ marginLeft: 8 }}>Mặc định hệ thống</Tag>
                      <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
                        AI được phép tự động phê duyệt (APPROVE) các yêu cầu rủi ro thấp. Mọi trường hợp đề xuất từ chối hoặc rủi ro trung bình/cao đều chuyển con người duyệt.
                      </div>
                    </div>
                  </Radio>
                  <Divider style={{ margin: '6px 0' }} />
                  <Radio value={AutonomyLevel.AutoDecideLowRisk}>
                    <div>
                      <Text strong>3. Toàn quyền xử lý rủi ro thấp (Auto Decide Low Risk)</Text>
                      <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
                        AI được phép tự động ra quyết định phê duyệt (APPROVE) và từ chối (REJECT) các đơn rủi ro thấp nếu độ tin cậy đạt ngưỡng.
                      </div>
                    </div>
                  </Radio>
                </Space>
              </Radio.Group>
            </Card>

            {/* Ngưỡng rủi ro tự động */}
            <Card
              title={
                <Space>
                  <SlidersOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 600 }}>Ngưỡng đánh giá rủi ro (Risk Threshold)</span>
                </Space>
              }
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text>Tự động phê duyệt đơn có điểm rủi ro AI dưới:</Text>
                  <Text strong style={{ color: '#059669' }}>{riskThreshold}%</Text>
                </div>
                <Slider
                  min={1}
                  max={30}
                  value={riskThreshold}
                  onChange={(val) => setRiskThreshold(val)}
                  disabled={autonomyLevel !== AutonomyLevel.AutoApproveLowRisk}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                <div>
                  <div style={{ fontWeight: 500 }}>Bật tự động duyệt đơn nghỉ phép ≤ 1 ngày</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Áp dụng khi nhân viên còn trên 5 ngày phép và gửi trước 3 ngày.</Text>
                </div>
                <Switch
                  checked={autoApproveLowRisk}
                  onChange={(c) => setAutoApproveLowRisk(c)}
                  disabled={autonomyLevel !== AutonomyLevel.AutoApproveLowRisk}
                />
              </div>
            </Card>
          </Space>
        </Col>

        {/* Cột phải: Guardrails & Tool Access */}
        <Col xs={24} lg={9}>
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {/* An toàn & Bảo mật (Guardrails) */}
            <Card
              title={
                <Space>
                  <SafetyCertificateOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 600 }}>Cơ chế An toàn (Guardrails)</span>
                </Space>
              }
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>Bộ lọc dữ liệu nhạy cảm (PII Filter)</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>Tự động che giấu số CCCD, lương, tài khoản.</Text>
                  </div>
                  <Switch checked={piiFilter} onChange={setPiiFilter} />
                </div>

                <Divider style={{ margin: '4px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>Kiểm tra quy chế cứng (RAG Guard)</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>Ngăn chặn AI tự sáng tác luật (Hallucination).</Text>
                  </div>
                  <Switch checked={ragPolicyCheck} onChange={setRagPolicyCheck} />
                </div>
              </Space>
            </Card>

            {/* Thông tin mô hình AI */}
            <Card
              title={<span style={{ fontWeight: 600 }}>Thông tin Agent Runtime</span>}
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.8 }}>
                <div>• Service: <strong>FastAPI (apps/ai:8000)</strong></div>
                <div>• Kiến trúc: <strong>LangGraph Multi-Agent Router</strong></div>
                <div>• RAG Knowledge: <strong>Chính sách HR v1.2 (docs/03-policy.md)</strong></div>
                <div>• Quyền truy cập: <strong>Chỉ gọi API, không trực tiếp DB</strong></div>
              </div>
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
};

export default AgentSettingsPage;
