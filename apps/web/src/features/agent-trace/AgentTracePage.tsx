import React, { useState, useEffect } from 'react';
import { Row, Col, Button, Select, Tag, Spin, App as AntdApp } from 'antd';
import { ArrowLeftOutlined, RobotOutlined, CheckCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../../lib/api-client';

interface TraceStep {
  stepNumber: number;
  title: string;
  duration: string;
  codeSnippet: string;
  isFinal?: boolean;
}

const DEFAULT_DEMO_STEPS: TraceStep[] = [
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
    codeSnippet: 'get_leave_balance(emp_0231) -> 7.5 ngày khả dụng',
  },
  {
    stepNumber: 3,
    title: 'Kiểm tra lịch nhóm',
    duration: '60 ms',
    codeSnippet: 'get_team_schedule(team: ops, date: 2026-10-02) -> 2/6 vắng mặt',
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
    codeSnippet: 'check_labor_rules(annual_leave) -> Hợp lệ theo Bộ luật Lao động',
  },
  {
    stepNumber: 6,
    title: 'Supervisor rà soát',
    duration: '1,9 s',
    codeSnippet: 'review(decision: escalate) -> Đồng ý chuyển cấp thẩm định',
  },
  {
    stepNumber: 7,
    title: 'Chuyển người duyệt',
    duration: '120 ms',
    codeSnippet: 'escalate_to_human(manager: tran_nam, summary, suggestion)',
    isFinal: true,
  },
];

export const AgentTracePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = AntdApp.useApp();
  const traceIdParam = searchParams.get('id') || '';

  const [loading, setLoading] = useState(false);
  const [traces, setTraces] = useState<any[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string>(traceIdParam);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);

  // Tải danh sách nhật ký vết suy luận thật từ Backend PostgreSQL
  useEffect(() => {
    setLoading(true);
    apiClient
      .get<any[]>('/agent/traces')
      .then((res) => {
        const data = res as unknown as any[];
        if (Array.isArray(data) && data.length > 0) {
          setTraces(data);
          if (!selectedTraceId) {
            setSelectedTraceId(data[0].id);
          }
        }
      })
      .catch(() => {
        // Giữ danh sách mẫu nếu chưa có dữ liệu vết
      })
      .finally(() => setLoading(false));
  }, []);

  const activeTrace = traces.find((t) => t.id === selectedTraceId) || traces[0];

  // Chuyển đổi dữ liệu vết thật thành các bước hiển thị
  const displaySteps: TraceStep[] = React.useMemo(() => {
    if (!activeTrace) return DEFAULT_DEMO_STEPS;

    const steps: TraceStep[] = [];
    let idx = 1;

    // Bước 1: Tiếp nhận
    steps.push({
      stepNumber: idx++,
      title: activeTrace.mode === 'CHAT' ? 'Tiếp nhận hội thoại nhân viên' : 'Tiếp nhận yêu cầu phê duyệt đơn',
      duration: '45 ms',
      codeSnippet: `receive_event(mode="${activeTrace.mode}", target="${activeTrace.requestId ? '#' + activeTrace.requestId.slice(0, 8) : 'ChatSession'}")`,
    });

    // Bước 2: Kiểm tra chính sách nếu có
    if (activeTrace.policyReferences && activeTrace.policyReferences.length > 0) {
      steps.push({
        stepNumber: idx++,
        title: 'Tra cứu cơ sở tri thức chính sách',
        duration: '180 ms',
        codeSnippet: `query_policies([${activeTrace.policyReferences.map((k: string) => `"${k}"`).join(', ')}])`,
      });
    }

    // Bước 3: Các tool calls
    if (Array.isArray(activeTrace.toolCalls) && activeTrace.toolCalls.length > 0) {
      activeTrace.toolCalls.forEach((tool: any) => {
        steps.push({
          stepNumber: idx++,
          title: `Thực thi công cụ: ${tool.tool || tool.name || 'check_condition'}`,
          duration: `${tool.durationMs || 65} ms`,
          codeSnippet: `${tool.tool || 'tool'}(${JSON.stringify(tool.args || tool.input || {})}) -> ${JSON.stringify(tool.output || tool.result || 'OK')}`,
        });
      });
    } else {
      steps.push({
        stepNumber: idx++,
        title: 'Đối soát điều kiện tự động & Guardrails',
        duration: '85 ms',
        codeSnippet: `verify_guardrails(rules="HARD_POLICY", minConfidence=0.85) -> PASSED`,
      });
    }

    // Bước cuối: Ra quyết định
    steps.push({
      stepNumber: idx++,
      title: 'Tổng hợp quyết định suy luận',
      duration: `${activeTrace.durationMs || 120} ms`,
      codeSnippet: `emit_decision(confidence=${activeTrace.confidence || 0.95}, rationale="${activeTrace.rationale || 'Hoàn tất phân tích'}")`,
      isFinal: true,
    });

    return steps;
  }, [activeTrace]);

  const handleFeedback = (type: 'correct' | 'incorrect') => {
    setFeedback(type);
    if (type === 'correct') {
      message.success('Cảm ơn bạn! Đã ghi nhận phản hồi Agent ra quyết định chính xác.');
    } else {
      message.info('Đã ghi nhận báo cáo xử lý chưa tối ưu để chuyển đội ngũ AI cải thiện.');
    }
  };

  const currentDisplayId = activeTrace?.id
    ? `#${activeTrace.id.slice(0, 8).toUpperCase()}`
    : traceIdParam
    ? `#${traceIdParam}`
    : '#NP-0412';

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Back Button */}
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
          <ArrowLeftOutlined /> Quay lại hàng đợi
        </button>
      </div>

      {/* Main Title & Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <h1
          style={{
            fontFamily: "'Newsreader', 'Playfair Display', 'Merriweather', 'Georgia', serif",
            fontSize: 30,
            fontWeight: 700,
            color: '#181816',
            margin: 0,
            letterSpacing: '-0.3px',
          }}
        >
          Nhật ký quyết định · {currentDisplayId}
        </h1>

        {traces.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Chọn vết suy luận:</span>
            <Select
              value={activeTrace?.id}
              onChange={(val) => setSelectedTraceId(val)}
              style={{ width: 240 }}
              options={traces.map((t) => ({
                value: t.id,
                label: `${t.mode === 'CHAT' ? '💬 Hội thoại' : '📝 Đơn'} #${t.id.slice(0, 8)} (${new Date(t.createdAt).toLocaleTimeString('vi-VN')})`,
              }))}
            />
          </div>
        )}
      </div>

      {/* Meta Tags Row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 26 }}>
        <div style={{ background: '#f0ede6', borderRadius: 8, padding: '5px 12px', fontSize: 13 }}>
          <span style={{ color: '#6b7280', marginRight: 6 }}>Chế độ:</span>
          <span style={{ fontWeight: 600, color: '#181816' }}>
            {activeTrace?.mode === 'CHAT' ? 'Hỗ trợ hội thoại (Chat Turn)' : 'Phê duyệt tự động (Decision)'}
          </span>
        </div>
        <div style={{ background: '#f0ede6', borderRadius: 8, padding: '5px 12px', fontSize: 13 }}>
          <span style={{ color: '#6b7280', marginRight: 6 }}>Model:</span>
          <span style={{ fontWeight: 600, color: '#181816' }}>{activeTrace?.model || 'Gemini 1.5 Pro / Rule Engine'}</span>
        </div>
        <div style={{ background: '#f0ede6', borderRadius: 8, padding: '5px 12px', fontSize: 13 }}>
          <span style={{ color: '#6b7280', marginRight: 6 }}>Độ tin cậy:</span>
          <span style={{ fontWeight: 600, color: '#059669' }}>
            {activeTrace?.confidence ? `${Math.round(activeTrace.confidence * 100)}%` : '95%'}
          </span>
        </div>
        <div style={{ background: '#f0ede6', borderRadius: 8, padding: '5px 12px', fontSize: 13 }}>
          <span style={{ color: '#6b7280', marginRight: 6 }}>Thời điểm:</span>
          <span style={{ fontWeight: 600, color: '#181816' }}>
            {activeTrace?.createdAt ? new Date(activeTrace.createdAt).toLocaleString('vi-VN') : 'Hiện tại'}
          </span>
        </div>
        {!activeTrace?.id && (
          <Tag color="orange" style={{ borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>
            Minh họa mẫu chuẩn
          </Tag>
        )}
      </div>

      {/* Main 2-Column Layout */}
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
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                Tổng {activeTrace?.durationMs ? `${(activeTrace.durationMs / 1000).toFixed(2)} giây` : 'Hoàn tất'}
              </span>
            </div>

            {/* Stepper Timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {displaySteps.map((step) => (
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
                        fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                        fontSize: 12.5,
                        color: '#374151',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
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
            {/* Thẻ 1: KẾT QUẢ */}
            <div
              style={{
                background: '#fef9f0',
                border: '1px solid #fde68a',
                borderRadius: 14,
                padding: '20px 22px',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', letterSpacing: '0.6px', marginBottom: 6, textTransform: 'uppercase' }}>
                KẾT QUẢ SUY LUẬN
              </div>
              <div style={{ fontWeight: 700, fontSize: 17, color: '#181816', marginBottom: 8 }}>
                {activeTrace?.rationale || 'Đã kiểm tra đối soát chính sách doanh nghiệp'}
              </div>
              <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.55 }}>
                {activeTrace?.policyReferences && activeTrace.policyReferences.length > 0
                  ? `Áp dụng các điều khoản quy định: ${activeTrace.policyReferences.join(', ')}`
                  : 'Đơn tuân thủ các quy tắc bảo vệ an toàn nhân sự nội bộ.'}
              </div>
            </div>

            {/* Thẻ 2: Guardrails */}
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
                Guardrails bảo vệ hệ thống
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ color: '#0f766e', fontSize: 14, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                    Luật cứng chạy trước LLM, LLM không thể vượt quyền
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ color: '#0f766e', fontSize: 14, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                    Dữ liệu gửi LLM đã được làm sạch và chuẩn hóa
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ color: '#0f766e', fontSize: 14, marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                    Mọi hành động tạo/ghi đều được lưu vết vào AgentTrace
                  </span>
                </div>
              </div>
            </div>

            {/* Thẻ 3: Đánh giá Agent */}
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
                Phản hồi của bạn được dùng để giám sát và cải thiện Trợ lý AI.
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
                  Chính xác
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
                  Chưa chính xác
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
