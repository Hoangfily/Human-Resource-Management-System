import React, { useState, useEffect } from 'react';
import { Typography, Row, Col, Space, Button, App as AntdApp } from 'antd';
import { ArrowLeftOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../lib/api-client';

const { Text } = Typography;

interface TraceStep {
  stepNumber: number;
  title: string;
  duration: string;
  codeSnippet: string;
  isFinal?: boolean;
}

export const AgentTracePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = AntdApp.useApp();
  const traceIdParam = searchParams.get('id') || 'NP-0412';

  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);

  const steps: TraceStep[] = [
    {
      stepNumber: 1,
      title: 'Hiểu yêu cầu',
      duration: '820 ms',
      codeSnippet: 'parse_request("Thứ 6 tuần sau em xin nghỉ...") -> {type: annual, date: 2026-10-02, part...}',
    },
    {
      stepNumber: 2,
      title: 'Kiểm tra quỹ phép',
      duration: '45 ms',
      codeSnippet: 'get_leave_balance(emp_0231) -> 7.5 ngày',
    },
    {
      stepNumber: 3,
      title: 'Kiểm tra lịch nhóm',
      duration: '60 ms',
      codeSnippet: 'get_team_schedule(team: ops, date: 2026-10-02) -> 2/6 vắng',
    },
    {
      stepNumber: 4,
      title: 'Tra chính sách',
      duration: '310 ms',
      codeSnippet: 'search_policy("độ phủ nhân sự tối thiểu") -> Điều 4.2: ≥ 60%',
    },
    {
      stepNumber: 5,
      title: 'Kiểm tra luật lao động',
      duration: '30 ms',
      codeSnippet: 'check_labor_rules(annual_leave) -> hợp lệ',
    },
    {
      stepNumber: 6,
      title: 'Supervisor rà soát',
      duration: '1,9 s',
      codeSnippet: 'review(decision: escalate) -> đồng ý',
    },
    {
      stepNumber: 7,
      title: 'Chuyển người duyệt',
      duration: '120 ms',
      codeSnippet: 'escalate_to_human(manager: tran_nam, summary, suggestion)',
      isFinal: true,
    },
  ];

  const handleFeedback = (type: 'correct' | 'incorrect') => {
    setFeedback(type);
    if (type === 'correct') {
      message.success('Cảm ơn bạn! Đã ghi nhận phản hồi Agent ra quyết định chính xác.');
    } else {
      message.info('Đã ghi nhận báo cáo xử lý chưa tối ưu để chuyển đội ngũ AI fine-tuning.');
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Back Breadcrumb from Screenshot 2 */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => navigate('/approvals')}
          style={{
            background: 'transparent',
            border: 0,
            color: '#134e4a',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>&lt; Quay lại hàng đợi</span>
        </button>
      </div>

      {/* Main Title: Nhật ký quyết định · #NP-0412 */}
      <h1
        style={{
          fontFamily: "'Newsreader', 'Playfair Display', 'Merriweather', 'Georgia', serif",
          fontSize: 30,
          fontWeight: 700,
          color: '#181816',
          margin: '0 0 16px',
          letterSpacing: '-0.3px',
        }}
      >
        Nhật ký quyết định · #{traceIdParam}
      </h1>

      {/* Meta Tags Row from Screenshot 2 */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 26 }}>
        <div style={{ background: '#f0ede6', borderRadius: 8, padding: '5px 12px', fontSize: 13 }}>
          <span style={{ color: '#6b7280', marginRight: 6 }}>Agent</span>
          <span style={{ fontWeight: 600, color: '#181816' }}>Leave Agent</span>
        </div>
        <div style={{ background: '#f0ede6', borderRadius: 8, padding: '5px 12px', fontSize: 13 }}>
          <span style={{ color: '#6b7280', marginRight: 6 }}>Model</span>
          <span style={{ fontWeight: 600, color: '#181816' }}>Gemini 1.5 Pro</span>
        </div>
        <div style={{ background: '#f0ede6', borderRadius: 8, padding: '5px 12px', fontSize: 13 }}>
          <span style={{ color: '#6b7280', marginRight: 6 }}>Chính sách</span>
          <span style={{ fontWeight: 600, color: '#181816' }}>v2.3</span>
        </div>
        <div style={{ background: '#f0ede6', borderRadius: 8, padding: '5px 12px', fontSize: 13 }}>
          <span style={{ color: '#6b7280', marginRight: 6 }}>Thời điểm</span>
          <span style={{ fontWeight: 600, color: '#181816' }}>22/09/2026 09:14</span>
        </div>
      </div>

      {/* Main 2-Column Layout from Screenshot 2 */}
      <Row gutter={[24, 24]}>
        {/* CỘT TRÁI: CÁC BƯỚC SUY LUẬN VÀ CÔNG CỤ ĐÃ GỌI */}
        <Col xs={24} lg={16}>
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #eeebe3',
              borderRadius: 16,
              padding: '24px 28px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            }}
          >
            {/* Box Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#181816' }}>
                Các bước suy luận và công cụ đã gọi
              </span>
              <span style={{ fontSize: 13, color: '#6b7280' }}>Tổng 4,8 giây</span>
            </div>

            {/* Stepper Timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {steps.map((step) => (
                <div key={step.stepNumber} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  {/* Number Circle */}
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: step.isFinal ? '#134e4a' : '#e8f5e9',
                      color: step.isFinal ? '#ffffff' : '#1b4332',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 13,
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {step.stepNumber}
                  </div>

                  {/* Step Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#181816' }}>
                        {step.title}
                      </span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{step.duration}</span>
                    </div>

                    {/* Code Snippet Box */}
                    <div
                      style={{
                        background: '#f9f8f4',
                        border: '1px solid #f0ede6',
                        borderRadius: 8,
                        padding: '9px 14px',
                        fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                        fontSize: 12.5,
                        color: '#374151',
                        whiteSpace: 'nowrap',
                        overflowX: 'auto',
                      }}
                    >
                      {step.codeSnippet}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Col>

        {/* CỘT PHẢI: KẾT QUẢ & GUARDRAILS */}
        <Col xs={24} lg={8}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Thẻ 1: KẾT QUẢ (Warm Beige Tinted Card) */}
            <div
              style={{
                background: '#fef9f0',
                border: '1px solid #fde68a',
                borderRadius: 14,
                padding: '20px 22px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', letterSpacing: '0.6px', marginBottom: 6, textTransform: 'uppercase' }}>
                KẾT QUẢ
              </div>
              <div style={{ fontWeight: 700, fontSize: 18, color: '#181816', marginBottom: 8 }}>
                Chuyển trưởng nhóm duyệt
              </div>
              <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.55 }}>
                Luật cứng Điều 4.2 chặn tự duyệt. Supervisor Agent đồng ý với quyết định.
              </div>
            </div>

            {/* Thẻ 2: Guardrails đã áp dụng (White Card) */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #eeebe3',
                borderRadius: 14,
                padding: '20px 22px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: '#181816', marginBottom: 14 }}>
                Guardrails đã áp dụng
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ color: '#0f766e', fontSize: 14, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                    Luật cứng chạy trước LLM, LLM không vượt được
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ color: '#0f766e', fontSize: 14, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                    Dữ liệu gửi LLM đã ẩn danh (emp_0231)
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ color: '#0f766e', fontSize: 14, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                    Supervisor rà soát trước mọi hành động ghi
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ color: '#0f766e', fontSize: 14, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                    Toàn bộ bước được lưu vào audit log
                  </span>
                </div>
              </div>
            </div>

            {/* Thẻ 3: Agent xử lý đúng không? */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #eeebe3',
                borderRadius: 14,
                padding: '20px 22px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: '#181816', marginBottom: 4 }}>
                Agent xử lý đúng không?
              </div>
              <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 14 }}>
                Phản hồi của bạn được dùng để cải thiện Agent.
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => handleFeedback('correct')}
                  style={{
                    flex: 1,
                    background: feedback === 'correct' ? '#f0fdf4' : '#ffffff',
                    border: feedback === 'correct' ? '1.5px solid #16a34a' : '1px solid #d1d5db',
                    color: feedback === 'correct' ? '#15803d' : '#1f2937',
                    borderRadius: 8,
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Đúng
                </button>
                <button
                  onClick={() => handleFeedback('incorrect')}
                  style={{
                    flex: 1,
                    background: feedback === 'incorrect' ? '#fef2f2' : '#ffffff',
                    border: feedback === 'incorrect' ? '1.5px solid #dc2626' : '1px solid #fecaca',
                    color: '#dc2626',
                    borderRadius: 8,
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Báo xử lý sai
                </button>
              </div>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default AgentTracePage;
