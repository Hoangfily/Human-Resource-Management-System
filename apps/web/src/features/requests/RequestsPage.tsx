import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Tag,
  Modal,
  Form,
  Select,
  DatePicker,
  TimePicker,
  Input,
  Row,
  Col,
  Badge,
  App as AntdApp,
  Segmented,
  Tooltip,
  Upload,
  Alert,
  Divider,
} from 'antd';
import type { UploadFile } from 'antd';
import {
  PlusOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SafetyCertificateOutlined,
  FileDoneOutlined,
  EyeOutlined,
  StopOutlined,
  SearchOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
  SwapOutlined,
  UploadOutlined,
  PaperClipOutlined,
  InfoCircleOutlined,
  CalendarOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { RequestStatus, RequestType } from '@hr-agent/shared';
import { MOCK_REQUESTS, MOCK_LEAVE_BALANCE } from '../../lib/mock-data';
import { StatusTag, RiskBadge, RequestTypeTag, EmptyState } from '../../components/common';
import { RequestItem, LeaveBalanceResponse } from '../../types';
import { RequestDetailModal } from '../../components/requests';
import { useAuth } from '../auth/AuthContext';
import apiClient from '../../lib/api-client';

const { Text } = Typography;

export const RequestsPage: React.FC = () => {
  const { message } = AntdApp.useApp();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [requests, setRequests] = useState<RequestItem[]>(MOCK_REQUESTS);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const isAdminOrHr = (() => {
    const r = String(user?.role || '').toUpperCase();
    return r === 'ADMIN' || r === 'HR' || r === 'HR_ADMIN';
  })();
  const [employees, setEmployees] = useState<Array<{ id: string; fullName: string; department?: { name: string }; departmentName?: string }>>([]);

  // Tải danh sách ca mẫu và đồng nghiệp phục vụ đổi ca
  const [shiftTemplates, setShiftTemplates] = useState<Array<{ id: string; name: string; code: string; startTime: string; endTime: string; durationHours?: number }>>([]);
  const [colleagues, setColleagues] = useState<Array<{ id: string; fullName: string; employeeCode?: string }>>([]);

  // Danh sách ca của bản thân (phục vụ chọn ca cần đổi)
  const [mySchedules, setMySchedules] = useState<Array<{ id: string; shiftTemplate: string; shiftStart: string; shiftEnd: string; date: string }>>([]);

  // Sự kiện chấm công trong ngày của nhân sự (phục vụ đơn giải trình sai giờ WRONG_TIME)
  const [dailyAttendanceEvents, setDailyAttendanceEvents] = useState<Array<{ id: string; type: string; timestamp: string }>>([]);
  const [loadingEvents, setLoadingEvents] = useState<boolean>(false);

  // Danh sách tệp đính kèm (Attachments)
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  // Tải danh sách nhân viên cho Admin / HR
  useEffect(() => {
    if (isAdminOrHr) {
      apiClient
        .get<any[]>('/employees')
        .then((res: any) => {
          if (Array.isArray(res)) {
            setEmployees(res);
          }
        })
        .catch(() => {});
    }
  }, [isAdminOrHr]);

  // Tải mẫu ca, lịch ca cá nhân và danh sách đồng nghiệp
  useEffect(() => {
    apiClient
      .get<any[]>('/shifts/templates')
      .then((res: any) => {
        if (Array.isArray(res)) {
          setShiftTemplates(res);
        }
      })
      .catch(() => {});

    apiClient
      .get<any[]>('/shifts/colleagues')
      .then((res: any) => {
        if (Array.isArray(res)) {
          setColleagues(res);
        }
      })
      .catch(() => {});

    apiClient
      .get<any>('/shifts/my-schedule')
      .then((res: any) => {
        if (Array.isArray(res)) {
          setMySchedules(res);
        } else if (res?.schedules && Array.isArray(res.schedules)) {
          setMySchedules(res.schedules);
        } else if (res?.weekShifts && Array.isArray(res.weekShifts)) {
          setMySchedules(
            res.weekShifts
              .filter((s: any) => s.shift !== 'NGHI_CA')
              .map((s: any) => ({
                id: s.id || s.key,
                shiftTemplate: s.shiftName || s.shift,
                shiftStart: s.time?.split(' - ')[0] || '08:30',
                shiftEnd: s.time?.split(' - ')[1] || '17:30',
                date: s.date,
              })),
          );
        }
      })
      .catch(() => {});
  }, []);

  // Bộ lọc & tìm kiếm
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Modal xem chi tiết
  const [selectedDetailRequest, setSelectedDetailRequest] = useState<RequestItem | null>(null);

  // Form states cho tạo đơn mới
  const [form] = Form.useForm();
  const [selectedType, setSelectedType] = useState<RequestType>(RequestType.Leave);
  const [selectedLeaveType, setSelectedLeaveType] = useState<string>('ANNUAL');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>([
    dayjs().add(5, 'day'),
    dayjs().add(6, 'day'),
  ]);
  const [singleDate, setSingleDate] = useState<Dayjs | null>(dayjs().add(1, 'day'));
  const [daysCount, setDaysCount] = useState<number>(2);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceResponse>(MOCK_LEAVE_BALANCE);

  // Dynamic Form States cho 3 Forms mới
  const [otStartTime, setOtStartTime] = useState<Dayjs>(dayjs('18:00', 'HH:mm'));
  const [otEndTime, setOtEndTime] = useState<Dayjs>(dayjs('20:00', 'HH:mm'));
  const [attendanceIssue, setAttendanceIssue] = useState<string>('MISSING_CLOCK_IN');

  // Tính số giờ làm thêm OT động
  const otHours = useMemo(() => {
    if (!otStartTime || !otEndTime) return 0;
    const diff = otEndTime.diff(otStartTime, 'minute');
    return diff > 0 ? parseFloat((diff / 60).toFixed(1)) : 0;
  }, [otStartTime, otEndTime]);

  const isOtTimeInvalid = useMemo(() => {
    if (!otStartTime || !otEndTime) return false;
    return otEndTime.isBefore(otStartTime) || otEndTime.isSame(otStartTime);
  }, [otStartTime, otEndTime]);

  const isOtOverDailyLimit = otHours > 4;

  const isWeekendOt = useMemo(() => {
    if (!singleDate) return false;
    const day = singleDate.day();
    return day === 0 || day === 6;
  }, [singleDate]);

  // Kiểm tra thời hạn 3 ngày làm việc đối với đơn giải trình chấm công
  const isExplanationOverdue = useMemo(() => {
    if (!singleDate) return false;
    const diff = dayjs().diff(singleDate, 'day');
    return diff > 4; // Trên 3 ngày làm việc
  }, [singleDate]);

  // Tải sự kiện quẹt thẻ khi nhân sự chọn ngày giải trình chấm công (đặc biệt khi WRONG_TIME)
  useEffect(() => {
    if (selectedType === RequestType.AttendanceExplanation && singleDate) {
      setLoadingEvents(true);
      const dateStr = singleDate.format('YYYY-MM-DD');
      apiClient
        .get<any[]>('/attendance/events', {
          params: {
            employeeId: user?.id,
            from: dateStr,
            to: dateStr,
          },
        })
        .then((res: any) => {
          if (Array.isArray(res)) {
            setDailyAttendanceEvents(res);
          }
        })
        .catch(() => {
          setDailyAttendanceEvents([]);
        })
        .finally(() => {
          setLoadingEvents(false);
        });
    }
  }, [selectedType, singleDate, user?.id]);

  // Tải danh sách đơn từ API
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<RequestItem[]>('/requests');
      const data = res as unknown as RequestItem[];
      if (Array.isArray(data)) {
        setRequests(data);
      }
    } catch {
      // Giữ mock data nếu offline hoặc lỗi kết nối
    } finally {
      setLoading(false);
    }
  }, []);

  // Tải số dư quỹ phép từ API
  const fetchLeaveBalance = useCallback(async () => {
    try {
      const res = await apiClient.get<LeaveBalanceResponse>('/leave/balance');
      const data = res as unknown as LeaveBalanceResponse;
      if (data && data.balances && data.balances.length > 0) {
        setLeaveBalance(data);
      }
    } catch {
      // Giữ mock data nếu offline
    }
  }, []);

  useEffect(() => {
    fetchRequests();
    fetchLeaveBalance();
  }, [fetchRequests, fetchLeaveBalance]);

  // Cập nhật số ngày tính toán khi đổi dải ngày
  const handleRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange([dates[0], dates[1]]);
      const diff = dates[1].diff(dates[0], 'day') + 1;
      setDaysCount(Math.max(1, diff));
    } else {
      setDateRange(null);
      setDaysCount(1);
    }
  };

  // Quỹ phép tương ứng với loại phép đang chọn
  const currentLeaveBalanceItem = leaveBalance.balances.find(
    (b: any) =>
      b.leaveType === selectedLeaveType ||
      b.leaveTypeCode === selectedLeaveType ||
      (selectedLeaveType === 'ANNUAL' && (b.leaveType === 'ANNUAL' || b.leaveTypeCode === 'ANNUAL')),
  );
  const availableDays = currentLeaveBalanceItem?.availableDays ?? 10;
  const isOverLimit = selectedType === RequestType.Leave && daysCount > availableDays;

  // Xử lý gửi tạo đơn mới lên API
  const handleCreateSubmit = async (values: any) => {
    if (selectedType === RequestType.Leave && !dateRange) {
      message.error('Vui lòng chọn khoảng thời gian nghỉ phép!');
      return;
    }

    if (selectedType === RequestType.Overtime && isOtTimeInvalid) {
      message.error('Giờ kết thúc làm thêm phải sau giờ bắt đầu!');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        reason: values.reason,
      };

      // Đính kèm tệp đính kèm (Attachments)
      const attachmentNames = fileList.map((f) => f.name || 'minh-chung-dinh-kem.pdf');

      if (selectedType === RequestType.Leave) {
        payload.leaveType = selectedLeaveType;
        payload.daysCount = daysCount;
        if (dateRange && dateRange[0] && dateRange[1]) {
          payload.startDate = dateRange[0].format('YYYY-MM-DD');
          payload.endDate = dateRange[1].format('YYYY-MM-DD');
        }
      } else if (selectedType === RequestType.Overtime) {
        payload.date = singleDate?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD');
        const st = values.otStartTime || otStartTime;
        const et = values.otEndTime || otEndTime;
        payload.startTime = typeof st === 'string' ? st : st.format('HH:mm');
        payload.endTime = typeof et === 'string' ? et : et.format('HH:mm');
        payload.estimatedHours = otHours;
        payload.otType = isWeekendOt ? 'WEEKEND' : 'NORMAL';
      } else if (selectedType === RequestType.AttendanceExplanation) {
        payload.date = singleDate?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD');
        payload.issue = values.attendanceIssue || attendanceIssue;
        const rt = values.requestedTime;
        // Form bắt buộc nhập: không tự gán giờ mặc định
        payload.requestedTime = typeof rt === 'string' ? rt : rt?.format('HH:mm');
        payload.explanation = values.reason;
        if (values.attendanceEventId) {
          payload.attendanceEventId = values.attendanceEventId;
        }
      } else if (selectedType === RequestType.ShiftChange) {
        payload.scheduleId = values.scheduleId || mySchedules[0]?.id || 'default-schedule';
        payload.newDate = singleDate?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD');
        payload.shiftDate = payload.newDate;
        // Form bắt buộc chọn ca thật từ /shifts/templates: không gửi id ca giả
        payload.newShiftTemplateId = values.newShiftTemplateId;
        payload.targetShiftId = payload.newShiftTemplateId;
        const targetTemplate = shiftTemplates.find((t) => t.id === payload.newShiftTemplateId);
        if (targetTemplate) {
          payload.newShiftTemplateName = targetTemplate.name;
        }
        if (values.swapWithEmployeeId) {
          payload.swapWithEmployeeId = values.swapWithEmployeeId;
          const swapEmp = colleagues.find((c) => c.id === values.swapWithEmployeeId);
          if (swapEmp) {
            payload.swapWithEmployeeName = swapEmp.fullName;
          }
        }
      }

      const res = await apiClient.post<RequestItem>('/requests', {
        type: selectedType,
        employeeId: values.employeeId && values.employeeId !== user?.id ? values.employeeId : undefined,
        payload,
        attachments: attachmentNames.length > 0 ? attachmentNames : undefined,
      });

      const newCreated = res as unknown as RequestItem;
      message.success('Đã gửi yêu cầu phê duyệt thành công!');

      // Làm mới danh sách và số dư phép
      if (newCreated && newCreated.id) {
        setRequests((prev) => [newCreated, ...prev]);
      } else {
        await fetchRequests();
      }
      await fetchLeaveBalance();

      form.resetFields();
      setFileList([]);
      setActiveTab('list');
    } catch (err: any) {
      const errMsg = err.response?.data?.message;
      const displayMsg = Array.isArray(errMsg) ? errMsg.join(', ') : errMsg || 'Không thể tạo yêu cầu';
      message.error(displayMsg);
    } finally {
      setSubmitting(false);
    }
  };

  // Hủy yêu cầu qua API
  const handleCancelRequest = (id: string) => {
    Modal.confirm({
      title: 'Xác nhận hủy yêu cầu',
      content: `Bạn có chắc chắn muốn hủy yêu cầu #${id}? Thao tác này sẽ hoàn lại số ngày phép hoặc ca trực chờ duyệt.`,
      okText: 'Hủy yêu cầu',
      okType: 'danger',
      cancelText: 'Quay lại',
      onOk: async () => {
        try {
          const res = await apiClient.post<RequestItem>(`/requests/${id}/cancel`);
          const updated = res as unknown as RequestItem;
          message.success(`Đã hủy yêu cầu #${id} thành công.`);

          setRequests((prev) =>
            prev.map((r) => (r.id === id ? { ...r, status: RequestStatus.Cancelled } : r)),
          );

          if (selectedDetailRequest && selectedDetailRequest.id === id) {
            setSelectedDetailRequest((prev) =>
              prev ? { ...prev, ...(updated || {}), status: RequestStatus.Cancelled } : null,
            );
          }

          // Cập nhật lại số dư phép sau khi hoàn hủy
          await fetchLeaveBalance();
        } catch (err: any) {
          const errMsg = err.response?.data?.message || 'Không thể hủy yêu cầu';
          message.error(errMsg);
        }
      },
    });
  };

  // Lọc danh sách đơn theo tab và ô tìm kiếm
  const filteredRequests = requests.filter((item) => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) {
      return false;
    }
    if (searchKeyword.trim()) {
      const q = searchKeyword.toLowerCase();
      const reason = String((item.payload as Record<string, string>)?.reason || '').toLowerCase();
      const empName = String(item.employeeName || '').toLowerCase();
      return item.id.toLowerCase().includes(q) || reason.includes(q) || empName.includes(q);
    }
    return true;
  });

  const formatShiftName = (shiftVal: string) => {
    if (!shiftVal) return '';
    if (shiftVal === 'CA_SANG') return 'Ca Sáng (08:30 - 17:30)';
    if (shiftVal === 'CA_CHIEU') return 'Ca Chiều (13:00 - 21:00)';
    if (shiftVal === 'CA_DEM') return 'Ca Đêm (21:00 - 05:00)';
    return shiftVal;
  };

  const columns = [
    {
      title: 'Mã đơn',
      dataIndex: 'id',
      key: 'id',
      width: 120,
      render: (id: string) => (
        <span
          style={{
            fontFamily: 'monospace',
            fontWeight: 600,
            color: '#0f766e',
            background: '#f0fdfa',
            padding: '3px 8px',
            borderRadius: 6,
            border: '1px solid #ccfbf1',
            whiteSpace: 'nowrap',
            display: 'inline-block',
            fontSize: 12,
          }}
        >
          #{id.length > 8 ? id.slice(0, 8) : id}
        </span>
      ),
    },
    {
      title: 'Nhân viên',
      dataIndex: 'employeeName',
      key: 'employeeName',
      width: 190,
      render: (name: string, record: RequestItem) => (
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <div style={{ fontWeight: 600, color: '#111827', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name || 'Nhân viên'}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {record.departmentName || 'Phòng ban'}
          </div>
        </div>
      ),
    },
    {
      title: 'Loại yêu cầu',
      dataIndex: 'type',
      key: 'type',
      width: 180,
      render: (type: RequestType) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <RequestTypeTag type={type} />
        </div>
      ),
    },
    {
      title: 'Chi tiết / Lý do',
      key: 'reason',
      width: 290,
      render: (_: unknown, record: RequestItem) => {
        const payload = record.payload as Record<string, any>;
        const days = (record as any).computed?.daysRequested || payload?.daysCount;
        return (
          <div style={{ maxWidth: 290 }}>
            <div
              style={{
                color: '#374151',
                fontSize: 13,
                lineHeight: 1.4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={payload?.reason}
            >
              {payload?.reason || '—'}
            </div>
            {days && record.type === RequestType.Leave && (
              <div
                style={{
                  fontSize: 11.5,
                  color: '#059669',
                  fontWeight: 600,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Thời lượng: {days} ngày làm việc
              </div>
            )}
            {record.type === RequestType.Overtime && payload?.startTime && payload?.endTime && (
              <div
                style={{
                  fontSize: 11.5,
                  color: '#d97706',
                  fontWeight: 600,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Khung giờ OT: {payload.startTime} - {payload.endTime} {payload.estimatedHours ? `(${payload.estimatedHours}h)` : ''}
              </div>
            )}
            {record.type === RequestType.AttendanceExplanation && payload?.issue && (
              <div
                style={{
                  fontSize: 11.5,
                  color: '#7c3aed',
                  fontWeight: 600,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {payload.issue === 'MISSING_CLOCK_IN' ? 'Quên chấm công vào' :
                 payload.issue === 'MISSING_CLOCK_OUT' ? 'Quên chấm công ra' :
                 payload.issue === 'LATE' ? 'Đi làm muộn' :
                 payload.issue === 'EARLY_LEAVE' ? 'Về sớm' : 'Sai giờ chấm công'}
                {payload.requestedTime && ` (Giờ: ${payload.requestedTime})`}
              </div>
            )}
            {record.type === RequestType.ShiftChange && (payload?.newShiftTemplateName || payload?.newShiftTemplateId || payload?.targetShiftId) && (
              <div
                style={{
                  fontSize: 11.5,
                  color: '#2563eb',
                  fontWeight: 600,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={`Ca mới: ${payload.newShiftTemplateName || formatShiftName(payload.newShiftTemplateId || payload.targetShiftId)}${payload.swapWithEmployeeName ? ` (Đổi với: ${payload.swapWithEmployeeName})` : ''}`}
              >
                Ca mới: {payload.newShiftTemplateName || formatShiftName(payload.newShiftTemplateId || payload.targetShiftId)}
                {payload.swapWithEmployeeName && ` (Đổi với: ${payload.swapWithEmployeeName})`}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Đánh giá AI',
      key: 'aiRisk',
      width: 170,
      render: (_: unknown, record: RequestItem) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <RiskBadge
            riskLevel={record.riskLevel}
            confidence={record.aiConfidence}
            riskScore={record.aiRiskScore}
          />
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 220,
      render: (status: RequestStatus) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <StatusTag status={status} />
        </div>
      ),
    },
    {
      title: 'Người duyệt',
      dataIndex: 'approverName',
      key: 'approverName',
      width: 170,
      render: (name?: string) => (
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13, color: name ? '#111827' : '#9ca3af' }}>
          {name || 'Chờ chỉ định'}
        </div>
      ),
    },
    {
      title: 'Ngày gửi',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 125,
      render: (d: string) => (
        <div style={{ whiteSpace: 'nowrap', fontSize: 12.5, color: '#4b5563' }}>
          {new Date(d).toLocaleDateString('vi-VN')}
        </div>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 100,
      fixed: 'right' as const,
      render: (_: unknown, record: RequestItem) => (
        <Space size={6} onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
          <Tooltip title="Xem chi tiết & phân tích của AI">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setSelectedDetailRequest(record)}
              style={{ borderRadius: 6, fontSize: 12 }}
            >
              Chi tiết
            </Button>
          </Tooltip>
          {(record.status === RequestStatus.Pending || record.status === RequestStatus.Draft) && (
            <Tooltip title="Hủy yêu cầu">
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={() => handleCancelRequest(record.id)}
                style={{ borderRadius: 6 }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <style>{`
        .ant-table-wrapper .ant-table-thead > tr > th {
          background: #faf9f5 !important;
          color: #4b5563 !important;
          font-weight: 600 !important;
          font-size: 13px !important;
          white-space: nowrap !important;
          border-bottom: 1px solid #eeebe3 !important;
        }
        .ant-table-wrapper .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f3f1ea !important;
          padding: 14px 16px !important;
        }
        .ant-table-wrapper .ant-table-tbody > tr:hover > td {
          background: #fbfbfa !important;
        }
      `}</style>

      {/* Tiêu đề & Nút chuyển đổi */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Newsreader', serif",
              fontSize: '28px',
              fontWeight: 700,
              color: '#161615',
              letterSpacing: '-0.3px',
              lineHeight: 1.2,
            }}
          >
            Quản lý Đơn từ & Yêu cầu
          </div>
          <div style={{ fontSize: '13.5px', color: '#6b7280', marginTop: 4 }}>
            Khởi tạo đơn nghỉ phép, làm thêm giờ, giải trình công, hoán đổi ca và đối soát quy chế tự động từ AI Agent.
          </div>
        </div>
        <Space size={10}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => { fetchRequests(); fetchLeaveBalance(); }}
            style={{
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: '#ffffff',
              color: '#374151',
              fontWeight: 500,
              height: 38,
            }}
          >
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setActiveTab(activeTab === 'list' ? 'create' : 'list')}
            style={{
              background: '#0f4c3a',
              borderColor: '#0f4c3a',
              color: '#ffffff',
              borderRadius: 8,
              fontWeight: 600,
              height: 38,
            }}
          >
            {activeTab === 'list' ? 'Tạo đơn mới' : 'Xem danh sách đơn'}
          </Button>
        </Space>
      </div>

      {activeTab === 'list' ? (
        <Card
          style={{
            borderRadius: 14,
            border: '1px solid #eeebe3',
            background: '#ffffff',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
          }}
          bodyStyle={{ padding: '20px 24px' }}
        >
          {/* Thanh công cụ tìm kiếm & bộ lọc */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <Segmented
              value={statusFilter}
              onChange={(val) => setStatusFilter(val as string)}
              options={[
                { label: `Tất cả (${requests.length})`, value: 'ALL' },
                {
                  label: `Chờ duyệt (${requests.filter((r) => r.status === RequestStatus.Pending).length})`,
                  value: RequestStatus.Pending,
                },
                {
                  label: `Đã duyệt (${requests.filter((r) => r.status === RequestStatus.Approved).length})`,
                  value: RequestStatus.Approved,
                },
                {
                  label: `Từ chối (${requests.filter((r) => r.status === RequestStatus.Rejected).length})`,
                  value: RequestStatus.Rejected,
                },
                {
                  label: `Đã hủy (${requests.filter((r) => r.status === RequestStatus.Cancelled).length})`,
                  value: RequestStatus.Cancelled,
                },
              ]}
              style={{ background: '#f5f4f0', padding: 3, borderRadius: 8 }}
            />

            <Input
              placeholder="Tìm theo mã đơn, nhân viên hoặc lý do..."
              prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ width: 320, borderRadius: 8, height: 38, border: '1px solid #e5e7eb' }}
              allowClear
            />
          </div>

          {filteredRequests.length === 0 && !loading ? (
            <EmptyState
              title={
                searchKeyword || statusFilter !== 'ALL'
                  ? 'Không tìm thấy yêu cầu phù hợp'
                  : 'Bạn chưa có yêu cầu nào'
              }
              description={
                searchKeyword || statusFilter !== 'ALL'
                  ? 'Thử điều chỉnh lại từ khóa tìm kiếm hoặc chọn bộ lọc trạng thái khác.'
                  : 'Khởi tạo đơn xin nghỉ phép, làm thêm giờ, giải trình chấm công hoặc đề xuất đổi ca làm việc ngay.'
              }
              actionText="Tạo đơn mới ngay"
              onAction={() => setActiveTab('create')}
            />
          ) : (
            <Table
              dataSource={filteredRequests}
              columns={columns}
              rowKey="id"
              loading={loading}
              tableLayout="fixed"
              pagination={{
                pageSize: 8,
                showSizeChanger: false,
                style: { marginTop: 16, marginBottom: 0 },
              }}
              scroll={{ x: 1560 }}
              onRow={(record) => ({
                onClick: () => setSelectedDetailRequest(record),
                style: { cursor: 'pointer' },
              })}
            />
          )}
        </Card>
      ) : (
        /* GIAO DIỆN TẠO ĐƠN 2 CỘT DOANH NGHIỆP */
        <Row gutter={[24, 24]}>
          {/* Cột trái: Form nhập thông tin đơn chuyên sâu */}
          <Col xs={24} lg={15}>
            <Card
              title={
                <Space>
                  <FileDoneOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 600 }}>Thông tin yêu cầu</span>
                </Space>
              }
              style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
            >
              <Form
                form={form}
                layout="vertical"
                onFinish={handleCreateSubmit}
                initialValues={{
                  attendanceIssue: 'MISSING_CLOCK_IN',
                  otStartTime: dayjs('18:00', 'HH:mm'),
                  otEndTime: dayjs('20:00', 'HH:mm'),
                  // Không điền sẵn requestedTime: nhân viên phải tự nhập giờ thật, AI chấm theo giờ này
                }}
              >
                {isAdminOrHr && (
                  <Row gutter={16}>
                    <Col xs={24}>
                      <Form.Item
                        label="Nhân sự yêu cầu (Tạo đơn cho)"
                        name="employeeId"
                        initialValue={user?.id}
                        tooltip="Quản trị viên và Trưởng phòng HR có thể tạo đơn cho bất kỳ nhân sự nào trong công ty"
                      >
                        <Select
                          showSearch
                          placeholder="Chọn nhân sự..."
                          optionFilterProp="label"
                          options={[
                            {
                              value: user?.id,
                              label: `👤 Chính tôi (${user?.fullName} - ${user?.role === 'ADMIN' ? 'Quản trị viên' : 'Trưởng phòng HR'})`,
                            },
                            ...employees
                              .filter((e) => e.id !== user?.id)
                              .map((e) => ({
                                value: e.id,
                                label: `${e.fullName} (${e.department?.name || e.departmentName || 'Phòng ban'})`,
                              })),
                          ]}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                )}

                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item label="Loại yêu cầu" required>
                      <Select
                        value={selectedType}
                        onChange={(val) => {
                          setSelectedType(val);
                          form.setFieldsValue({ attendanceIssue: 'MISSING_CLOCK_IN' });
                        }}
                        options={[
                          { value: RequestType.Leave, label: '🌴 Nghỉ phép (Leave)' },
                          { value: RequestType.Overtime, label: '⏱️ Làm thêm giờ (Overtime - OT)' },
                          { value: RequestType.AttendanceExplanation, label: '📝 Giải trình chấm công (Attendance)' },
                          { value: RequestType.ShiftChange, label: '🔄 Đổi ca làm việc (Shift Change)' },
                        ]}
                      />
                    </Form.Item>
                  </Col>

                  {/* Phụ trợ loại đơn LEAVE */}
                  {selectedType === RequestType.Leave && (
                    <Col xs={24} sm={12}>
                      <Form.Item label="Loại nghỉ phép" required>
                        <Select
                          value={selectedLeaveType}
                          onChange={(val) => setSelectedLeaveType(val)}
                          options={[
                            { value: 'ANNUAL', label: 'Nghỉ phép năm (Có lương)' },
                            { value: 'SICK', label: 'Nghỉ ốm (Hưởng BHXH)' },
                            { value: 'PERSONAL', label: 'Nghỉ việc riêng (Không lương)' },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                  )}

                  {/* Phụ trợ loại đơn ATTENDANCE_EXPLANATION */}
                  {selectedType === RequestType.AttendanceExplanation && (
                    <Col xs={24} sm={12}>
                      <Form.Item
                        label="Vấn đề cần giải trình"
                        name="attendanceIssue"
                        rules={[{ required: true, message: 'Vui lòng chọn vấn đề cần giải trình' }]}
                      >
                        <Select
                          value={attendanceIssue}
                          onChange={(val) => setAttendanceIssue(val)}
                          options={[
                            { value: 'MISSING_CLOCK_IN', label: 'Quên quẹt thẻ vào ca (Đầu giờ)' },
                            { value: 'MISSING_CLOCK_OUT', label: 'Quên quẹt thẻ ra ca (Cuối giờ)' },
                            { value: 'LATE', label: 'Giải trình đi làm muộn' },
                            { value: 'EARLY_LEAVE', label: 'Giải trình về sớm' },
                            { value: 'WRONG_TIME', label: 'Sai lệch thông tin giờ quẹt thẻ' },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                  )}
                </Row>

                {/* ===================== FORM 1: NGHỈ PHÉP (LEAVE) ===================== */}
                {selectedType === RequestType.Leave && (
                  <Row gutter={16}>
                    <Col xs={24} sm={16}>
                      <Form.Item label="Khoảng thời gian nghỉ (Từ ngày - Đến ngày)" required>
                        <DatePicker.RangePicker
                          style={{ width: '100%' }}
                          value={dateRange}
                          onChange={(dates) => handleRangeChange(dates as any)}
                          format="DD/MM/YYYY"
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item label="Số ngày làm việc tính toán">
                        <Input
                          value={`${daysCount} ngày`}
                          readOnly
                          style={{
                            background: '#f8fafc',
                            fontWeight: 600,
                            color: isOverLimit ? '#dc2626' : '#065f46',
                          }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                )}

                {/* ===================== FORM 2: LÀM THÊM GIỜ (OVERTIME - OT) ===================== */}
                {selectedType === RequestType.Overtime && (
                  <>
                    <Row gutter={16}>
                      <Col xs={24} sm={10}>
                        <Form.Item label="Ngày làm thêm (OT)" required>
                          <DatePicker
                            style={{ width: '100%' }}
                            value={singleDate}
                            onChange={(d) => setSingleDate(d)}
                            format="DD/MM/YYYY"
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={7}>
                        <Form.Item
                          label="Giờ bắt đầu OT"
                          name="otStartTime"
                          rules={[{ required: true, message: 'Chọn giờ bắt đầu' }]}
                        >
                          <TimePicker
                            format="HH:mm"
                            minuteStep={15}
                            style={{ width: '100%' }}
                            value={otStartTime}
                            onChange={(t) => t && setOtStartTime(t)}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={7}>
                        <Form.Item
                          label="Giờ kết thúc OT"
                          name="otEndTime"
                          rules={[{ required: true, message: 'Chọn giờ kết thúc' }]}
                        >
                          <TimePicker
                            format="HH:mm"
                            minuteStep={15}
                            style={{ width: '100%' }}
                            value={otEndTime}
                            onChange={(t) => t && setOtEndTime(t)}
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    {/* Thẻ hiển thị tính toán thời lượng OT và loại ngày */}
                    <div
                      style={{
                        background: '#fcfbf7',
                        border: '1px solid #eee8d5',
                        borderRadius: 8,
                        padding: '12px 16px',
                        marginBottom: 16,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Space size={12}>
                        <ClockCircleOutlined style={{ fontSize: 18, color: '#d97706' }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                            Thời lượng làm thêm dự kiến: {otHours} giờ
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                            {isWeekendOt
                              ? 'Ngày nghỉ hàng tuần: Áp dụng hệ số phụ cấp 200% lương theo Bộ luật Lao động'
                              : 'Ngày làm việc thường: Áp dụng hệ số phụ cấp 150% lương'}
                          </div>
                        </div>
                      </Space>
                      <Tag color={isWeekendOt ? 'purple' : 'orange'} style={{ fontWeight: 600, padding: '4px 10px' }}>
                        {isWeekendOt ? 'Cuối tuần (x2.0)' : 'Ngày thường (x1.5)'}
                      </Tag>
                    </div>

                    {isOtTimeInvalid && (
                      <Alert
                        type="error"
                        showIcon
                        message="Lỗi khung giờ"
                        description="Giờ kết thúc làm thêm phải sau giờ bắt đầu làm thêm."
                        style={{ marginBottom: 16, borderRadius: 8 }}
                      />
                    )}

                    {isOtOverDailyLimit && (
                      <Alert
                        type="warning"
                        showIcon
                        icon={<WarningOutlined />}
                        message="Vượt ngưỡng làm thêm thông thường"
                        description="Thời lượng làm thêm vượt quá 4 giờ/ngày. Đơn sẽ được chuyển cấp Trưởng bộ phận xem xét phê duyệt ngoại lệ."
                        style={{ marginBottom: 16, borderRadius: 8 }}
                      />
                    )}
                  </>
                )}

                {/* ===================== FORM 3: GIẢI TRÌNH CHẤM CÔNG (ATTENDANCE EXPLANATION) ===================== */}
                {selectedType === RequestType.AttendanceExplanation && (
                  <>
                    <Row gutter={16}>
                      <Col xs={24} sm={12}>
                        <Form.Item label="Ngày phát sinh sự vụ chấm công" required>
                          <DatePicker
                            style={{ width: '100%' }}
                            value={singleDate}
                            onChange={(d) => setSingleDate(d)}
                            format="DD/MM/YYYY"
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item
                          label="Giờ thực tế đề xuất ghi nhận"
                          name="requestedTime"
                          tooltip="Thời điểm thực tế bạn có mặt hoặc rời đi muốn hệ thống cập nhật vào bảng công"
                          rules={[{ required: true, message: 'Vui lòng chọn giờ muốn ghi nhận' }]}
                        >
                          <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>

                    {/* Nếu chọn sự vụ WRONG_TIME (Sai giờ), cho phép chọn bản ghi quẹt thẻ lỗi */}
                    {attendanceIssue === 'WRONG_TIME' && (
                      <Row gutter={16}>
                        <Col xs={24}>
                          <Form.Item
                            label="Bản ghi chấm công cần điều chỉnh"
                            name="attendanceEventId"
                            tooltip="Chọn đúng sự kiện quẹt thẻ bị sai giờ từ máy chấm công để hệ thống điều chỉnh"
                            rules={[{ required: true, message: 'Vui lòng chọn sự kiện chấm công cần điều chỉnh' }]}
                          >
                            {/* Chỉ cho chọn bản ghi thật: ngày không có lần quẹt thẻ nào thì là quên chấm công, không phải sai giờ */}
                            <Select
                              loading={loadingEvents}
                              placeholder="Chọn lần quẹt thẻ trong ngày..."
                              notFoundContent="Ngày này không có lần quẹt thẻ nào. Hãy chọn vấn đề Quên chấm công vào/ra."
                              options={dailyAttendanceEvents.map((evt, idx) => ({
                                value: evt.id,
                                label: `Lần ${idx + 1}: ${evt.type === 'CLOCK_IN' ? 'Vào ca (IN)' : 'Ra ca (OUT)'} lúc ${new Date(evt.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
                              }))}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    )}

                    {/* Cảnh báo nếu giải trình quá hạn 3 ngày làm việc */}
                    {isExplanationOverdue && (
                      <Alert
                        type="warning"
                        showIcon
                        message="Giải trình quá hạn quy định"
                        description="Ngày phát sinh sự vụ đã vượt quá 3 ngày làm việc (Quy chế công ty). Đơn sẽ không thể tự động duyệt mà bắt buộc chuyển cấp Trưởng phòng xem xét."
                        style={{ marginBottom: 16, borderRadius: 8 }}
                      />
                    )}

                    {/* Khung tải tệp / tài liệu minh chứng (Attachments) */}
                    <Form.Item
                      label="Tài liệu / Ảnh chụp minh chứng đính kèm"
                      tooltip="Đính kèm ảnh chụp màn hình camera, tin nhắn báo quản lý, giấy xác nhận công tác hoặc y tế (hỗ trợ .png, .jpg, .pdf)"
                    >
                      <Upload
                        fileList={fileList}
                        beforeUpload={(file) => {
                          setFileList((prev) => [...prev, file]);
                          return false; // Chặn tự upload lên máy chủ ngoài
                        }}
                        onRemove={(file) => {
                          setFileList((prev) => prev.filter((item) => item.uid !== file.uid));
                        }}
                      >
                        <Button icon={<UploadOutlined />} style={{ borderRadius: 6 }}>
                          Đính kèm tài liệu minh chứng
                        </Button>
                      </Upload>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                        * Nếu thời gian đề xuất lệch quá 30 phút so với giờ quy định, tài liệu minh chứng là bắt buộc để hỗ trợ phê duyệt.
                      </div>
                    </Form.Item>
                  </>
                )}

                {/* ===================== FORM 4: ĐỔI CA LÀM VIỆC (SHIFT CHANGE) ===================== */}
                {selectedType === RequestType.ShiftChange && (
                  <>
                    <Row gutter={16}>
                      <Col xs={24} sm={8}>
                        <Form.Item label="Ngày áp dụng đổi ca" required>
                          <DatePicker
                            style={{ width: '100%' }}
                            value={singleDate}
                            onChange={(d) => setSingleDate(d)}
                            format="DD/MM/YYYY"
                          />
                        </Form.Item>
                      </Col>

                      <Col xs={24} sm={8}>
                        <Form.Item
                          label="Ca làm việc hiện tại của bạn"
                          name="scheduleId"
                          rules={[{ required: true, message: 'Vui lòng chọn ca hiện tại' }]}
                          initialValue={mySchedules[0]?.id || 'default-schedule'}
                        >
                          <Select
                            placeholder="Chọn ca hiện tại..."
                            options={
                              mySchedules.length > 0
                                ? mySchedules.map((s) => ({
                                    value: s.id,
                                    label: `${s.shiftTemplate || 'Ca hành chính'} (${s.shiftStart || '08:30'} - ${s.shiftEnd || '17:30'})`,
                                  }))
                                : [
                                    {
                                      value: 'default-schedule',
                                      label: 'Ca tiêu chuẩn cá nhân (08:30 - 17:30)',
                                    },
                                  ]
                            }
                          />
                        </Form.Item>
                      </Col>

                      <Col xs={24} sm={8}>
                        <Form.Item
                          label="Ca làm việc chuyển đến"
                          name="newShiftTemplateId"
                          rules={[{ required: true, message: 'Chọn ca chuyển đến' }]}
                          initialValue={shiftTemplates[0]?.id}
                        >
                          <Select
                            placeholder="Chọn ca làm việc mới..."
                            options={shiftTemplates.map((tpl) => ({
                              value: tpl.id,
                              label: `${tpl.name} (${tpl.startTime} - ${tpl.endTime})`,
                            }))}
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={16}>
                      <Col xs={24}>
                        <Form.Item
                          label="Hoán đổi ca với đồng nghiệp (Tùy chọn)"
                          name="swapWithEmployeeId"
                          tooltip="Chọn đồng nghiệp trong cùng bộ phận nếu bạn và đồng nghiệp đồng thuận hoán đổi ca trực cho nhau"
                        >
                          <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            placeholder="Chọn đồng nghiệp cùng bộ phận (Không bắt buộc)..."
                            options={colleagues
                              .filter((c) => c.id !== user?.id)
                              .map((c) => ({
                                value: c.id,
                                label: `🔄 ${c.fullName} (${c.employeeCode || 'NV'})`,
                              }))}
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    {/* Thẻ ghi chú quy chuẩn khoảng nghỉ 12 tiếng */}
                    <div
                      style={{
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: 8,
                        padding: '12px 16px',
                        marginBottom: 16,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <SwapOutlined style={{ fontSize: 18, color: '#2563eb' }} />
                      <div style={{ fontSize: 12.5, color: '#1e40af', lineHeight: 1.5 }}>
                        Quy chuẩn an toàn lao động: Thời gian nghỉ giữa 2 ca làm việc liên tiếp phải đạt tối thiểu <strong>12 giờ</strong>. Hệ thống AI sẽ tự động kiểm tra định biên nhân sự phòng ban (tối thiểu 2 nhân sự/ca).
                      </div>
                    </div>
                  </>
                )}

                <Form.Item
                  label="Lý do chi tiết"
                  name="reason"
                  rules={[{ required: true, message: 'Vui lòng nhập lý do cụ thể!' }]}
                >
                  <Input.TextArea
                    rows={4}
                    placeholder="Nhập lý do cụ thể gửi cấp quản lý phê duyệt..."
                  />
                </Form.Item>

                <Space size={12}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    size="large"
                    loading={submitting}
                    disabled={isOverLimit || (selectedType === RequestType.Overtime && isOtTimeInvalid)}
                    style={{ background: '#0f4c3a', borderColor: '#0f4c3a', borderRadius: 8, fontWeight: 600 }}
                  >
                    Xác nhận gửi duyệt
                  </Button>
                  <Button size="large" onClick={() => setActiveTab('list')} style={{ borderRadius: 8 }}>
                    Hủy bỏ
                  </Button>
                </Space>
              </Form>
            </Card>
          </Col>

          {/* Cột phải: Bảng kiểm tra điều kiện quy chế HR (Policy Compliance Check) */}
          <Col xs={24} lg={9}>
            <Card
              title={
                <Space>
                  <SafetyCertificateOutlined style={{ color: '#059669' }} />
                  <span style={{ fontWeight: 600 }}>Kiểm tra tuân thủ chính sách</span>
                </Space>
              }
              style={{ borderRadius: 12, border: '1px solid #e2e8f0', height: '100%' }}
            >
              {isOverLimit ? (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: '#991b1b',
                      fontWeight: 600,
                      marginBottom: 8,
                    }}
                  >
                    <ExclamationCircleOutlined style={{ fontSize: 16 }} />
                    Không đủ số dư ngày phép
                  </div>
                  <div style={{ fontSize: 13, color: '#7f1d1d', lineHeight: 1.6 }}>
                    Số ngày yêu cầu ({daysCount} ngày) vượt quá số dư phép khả dụng ({availableDays}{' '}
                    ngày). Vui lòng điều chỉnh lại khoảng thời gian.
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: '#166534',
                      fontWeight: 600,
                      marginBottom: 8,
                    }}
                  >
                    <CheckCircleOutlined style={{ fontSize: 16 }} />
                    Đủ điều kiện gửi phê duyệt
                  </div>
                  <div style={{ fontSize: 13, color: '#14532d', lineHeight: 1.6 }}>
                    Hệ thống AI sẽ tự động đối soát với Quy chế Lao động & Nội quy Nhân sự.
                  </div>
                </div>
              )}

              {/* Chi tiết quỹ phép đối với đơn LEAVE */}
              {selectedType === RequestType.Leave && (
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '14px',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <Text type="secondary">Quỹ phép ({currentLeaveBalanceItem?.leaveTypeName || 'Phép năm'}):</Text>
                    <Text strong>{availableDays} ngày khả dụng</Text>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <Text type="secondary">Số ngày yêu cầu:</Text>
                    <Text strong style={{ color: isOverLimit ? '#dc2626' : '#059669' }}>
                      - {daysCount} ngày
                    </Text>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      paddingTop: 8,
                      borderTop: '1px dashed #cbd5e1',
                    }}
                  >
                    <Text strong>Số dư dự kiến sau duyệt:</Text>
                    <Text
                      strong
                      style={{ color: isOverLimit ? '#dc2626' : '#065f46' }}
                    >
                      {availableDays - daysCount} ngày
                    </Text>
                  </div>
                </div>
              )}

              {/* Thông tin đối soát theo từng loại đơn */}
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {selectedType === RequestType.Leave && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge status="success" />
                      <Text style={{ fontSize: 13 }}>
                        Báo trước: <strong>≥ 3 ngày làm việc</strong> (Nghỉ 1-2 ngày)
                      </Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge status="success" />
                      <Text style={{ fontSize: 13 }}>Không trùng lịch công tác hoặc sự kiện công ty</Text>
                    </div>
                  </>
                )}

                {selectedType === RequestType.Overtime && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge status="success" />
                      <Text style={{ fontSize: 13 }}>
                        Giới hạn OT: <strong>Tối đa 40 giờ/tháng</strong> (Bộ luật Lao động 2019)
                      </Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge status={isOtOverDailyLimit ? 'warning' : 'success'} />
                      <Text style={{ fontSize: 13 }}>
                        Định mức ca: <strong>Không quá 4 giờ/ngày làm việc</strong>
                      </Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge status="success" />
                      <Text style={{ fontSize: 13 }}>
                        Chế độ phụ cấp: <strong>{isWeekendOt ? 'Hệ số 200% (Cuối tuần)' : 'Hệ số 150% (Ngày thường)'}</strong>
                      </Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge status="success" />
                      <Text style={{ fontSize: 13 }}>Thời điểm đăng ký trước khi bắt đầu làm OT</Text>
                    </div>
                  </>
                )}

                {selectedType === RequestType.AttendanceExplanation && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge status={isExplanationOverdue ? 'warning' : 'success'} />
                      <Text style={{ fontSize: 13 }}>
                        Hạn giải trình: <strong>Trong vòng 3 ngày làm việc</strong>
                      </Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge status="success" />
                      <Text style={{ fontSize: 13 }}>Dung sai giờ: ±30 phút so với giờ ca quy định</Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge status={fileList.length > 0 ? 'success' : 'default'} />
                      <Text style={{ fontSize: 13 }}>
                        Minh chứng: <strong>{fileList.length > 0 ? `Đã đính kèm ${fileList.length} tệp` : 'Chưa có tệp đính kèm'}</strong>
                      </Text>
                    </div>
                  </>
                )}

                {selectedType === RequestType.ShiftChange && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge status="success" />
                      <Text style={{ fontSize: 13 }}>
                        Khoảng nghỉ giữa 2 ca: <strong>Tối thiểu 12 giờ</strong>
                      </Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge status="success" />
                      <Text style={{ fontSize: 13 }}>
                        Định biên ca cũ: <strong>Còn tối thiểu 2 nhân sự trực</strong>
                      </Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge status="success" />
                      <Text style={{ fontSize: 13 }}>Xác nhận hai chiều nếu hoán đổi với đồng nghiệp</Text>
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge status="processing" />
                  <Text style={{ fontSize: 13 }}>
                    Cơ chế phê duyệt: <strong>AI tự động duyệt hoặc chuyển cấp duyệt</strong>
                  </Text>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>
      )}

      {/* MODAL XEM CHI TIẾT ĐƠN & THẨM ĐỊNH AI */}
      <RequestDetailModal
        open={Boolean(selectedDetailRequest)}
        onClose={() => setSelectedDetailRequest(null)}
        request={selectedDetailRequest}
        onCancelRequest={(id) => handleCancelRequest(id)}
      />
    </div>
  );
};

export default RequestsPage;
