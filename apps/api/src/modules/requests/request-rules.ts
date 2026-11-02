import { BadRequestException } from '@nestjs/common';
import { Prisma, RequestStatus, RequestType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { addDays, atCompanyTime, todayInCompany, weekday } from '../../common/utils/company-date';

/**
 * Luật cứng lớp Validation (docs/05-business-spec.md §3.4, §4.4, §5.4, §6.4): vi phạm thì không cho submit,
 * đơn giữ DRAFT và API trả danh sách lỗi. Các luật dẫn tới REJECTED/ESCALATED do AI kiểm tra trong code
 * (lớp thứ hai, docs/06) và chưa có ở đây.
 */

// docs/03-policy.md: LEAVE.SICK_BACKDATE_DAYS = 2 ngày làm việc (bảng CompanyPolicy chưa có cột giá trị số)
const SICK_BACKDATE_WORKING_DAYS = 2;

// Đơn đang có hiệu lực (bản nháp, đơn bị từ chối hoặc đã hủy không chặn đơn mới)
const LIVE: RequestStatus[] = [RequestStatus.PENDING, RequestStatus.ESCALATED, RequestStatus.APPROVED];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type Payload = Record<string, any>;
type Db = PrismaService | Prisma.TransactionClient;

/** Số ngày Thứ Hai–Thứ Sáu trong khoảng (from, to]. */
function workingDaysAfter(from: string, to: string): number {
  let count = 0;
  for (let day = addDays(from, 1); day <= to; day = addDays(day, 1)) {
    const dow = weekday(day);
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function overlaps(start: Date, end: Date, otherStart: Date, otherEnd: Date): boolean {
  return start < otherEnd && end > otherStart;
}

/** Lịch ca của nhân viên từ ngày trước tới ngày sau `date` (để bắt cả ca qua đêm). */
function schedulesAround(db: Db, employeeId: string, date: string) {
  return db.schedule.findMany({
    where: {
      employeeId,
      date: { gte: new Date(`${addDays(date, -1)}T00:00:00.000Z`), lte: new Date(`${addDays(date, 1)}T00:00:00.000Z`) },
    },
    select: { id: true, date: true, shiftStart: true, shiftEnd: true },
  });
}

/**
 * Ném 400 kèm danh sách lỗi nếu đơn vi phạm luật cứng lớp Validation.
 * `excludeRequestId`: đơn đang submit, không tính là trùng với chính nó.
 */
export async function assertHardRules(
  db: Db,
  type: RequestType,
  employeeId: string,
  payload: Payload,
  excludeRequestId?: string,
): Promise<void> {
  const check = {
    [RequestType.LEAVE]: leaveErrors,
    [RequestType.OVERTIME]: overtimeErrors,
    [RequestType.ATTENDANCE_EXPLANATION]: attendanceErrors,
    [RequestType.SHIFT_CHANGE]: shiftErrors,
  }[type];
  const errors = check ? await check(db, employeeId, payload, excludeRequestId) : [];
  if (errors.length > 0) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', message: errors.join('; '), errors });
  }
}

async function leaveErrors(db: Db, employeeId: string, p: Payload, excludeId?: string): Promise<string[]> {
  const errors: string[] = [];
  const { startDate, endDate } = p;
  if (!DATE.test(startDate ?? '') || !DATE.test(endDate ?? '')) {
    return ['Ngày bắt đầu và ngày kết thúc phải có dạng YYYY-MM-DD'];
  }
  if (endDate < startDate) errors.push('Ngày kết thúc không được trước ngày bắt đầu');
  if (p.halfDay && startDate !== endDate) errors.push('Nghỉ nửa ngày chỉ áp dụng khi ngày bắt đầu trùng ngày kết thúc');

  const leaveType = p.leaveTypeId
    ? await db.leaveType.findUnique({ where: { id: p.leaveTypeId }, select: { code: true } })
    : null;
  if (!leaveType) errors.push('Loại nghỉ không hợp lệ');

  const today = todayInCompany();
  if (startDate < today) {
    const sickInWindow =
      leaveType?.code === 'SICK' && workingDaysAfter(startDate, today) <= SICK_BACKDATE_WORKING_DAYS;
    if (!sickInWindow) {
      errors.push(
        `Không thể xin nghỉ cho ngày đã qua (nghỉ ốm được nộp bù trong ${SICK_BACKDATE_WORKING_DAYS} ngày làm việc)`,
      );
    }
  }

  const others = await db.request.findMany({
    where: { employeeId, type: RequestType.LEAVE, status: { in: LIVE }, id: excludeId ? { not: excludeId } : undefined },
    select: { payload: true },
  });
  const clash = others.some(({ payload }) => {
    const o = payload as Payload;
    return DATE.test(o?.startDate ?? '') && DATE.test(o?.endDate ?? '') && o.startDate <= endDate && o.endDate >= startDate;
  });
  if (clash) errors.push('Trùng ngày với một đơn nghỉ khác đang chờ duyệt hoặc đã duyệt');

  return errors;
}

async function overtimeErrors(db: Db, employeeId: string, p: Payload): Promise<string[]> {
  const { date, startTime, endTime } = p;
  if (!DATE.test(date ?? '') || !TIME.test(startTime ?? '') || !TIME.test(endTime ?? '')) {
    return ['Ngày (YYYY-MM-DD), giờ bắt đầu và giờ kết thúc (HH:mm) là bắt buộc'];
  }
  if (endTime <= startTime) return ['Giờ kết thúc làm thêm phải sau giờ bắt đầu'];

  const start = atCompanyTime(date, startTime);
  const end = atCompanyTime(date, endTime);
  const shifts = await schedulesAround(db, employeeId, date);
  if (shifts.some((s) => overlaps(start, end, s.shiftStart, s.shiftEnd))) {
    return ['Giờ làm thêm trùng với ca làm việc đã được phân'];
  }
  return [];
}

async function attendanceErrors(db: Db, employeeId: string, p: Payload, excludeId?: string): Promise<string[]> {
  const errors: string[] = [];
  const { date, issue } = p;
  if (!DATE.test(date ?? '')) errors.push('Ngày giải trình phải có dạng YYYY-MM-DD');
  if (!issue) errors.push('Vấn đề cần giải trình là bắt buộc');
  if (['MISSING_CLOCK_IN', 'MISSING_CLOCK_OUT', 'WRONG_TIME'].includes(issue) && !p.requestedTime) {
    errors.push('Giờ cần ghi nhận là bắt buộc với vấn đề này');
  }
  if (issue === 'WRONG_TIME') {
    // Phải là bản ghi chấm công thật của chính nhân viên này (web từng gửi id giả "manual-event")
    const event = p.attendanceEventId
      ? await db.attendanceEvent.findUnique({ where: { id: String(p.attendanceEventId) }, select: { employeeId: true } })
      : null;
    if (!event || event.employeeId !== employeeId) errors.push('Cần chọn một bản ghi chấm công có thật cần sửa');
  }
  if (errors.length > 0) return errors;

  const others = await db.request.findMany({
    where: {
      employeeId,
      type: RequestType.ATTENDANCE_EXPLANATION,
      status: { in: LIVE },
      id: excludeId ? { not: excludeId } : undefined,
    },
    select: { payload: true },
  });
  if (others.some(({ payload }) => (payload as Payload)?.date === date && (payload as Payload)?.issue === issue)) {
    errors.push('Đã có đơn giải trình khác cho cùng ngày và cùng vấn đề');
  }
  return errors;
}

async function shiftErrors(db: Db, employeeId: string, p: Payload): Promise<string[]> {
  const newDate = p.newDate ?? p.shiftDate;
  const templateId = p.newShiftTemplateId ?? p.targetShiftId;
  if (!DATE.test(newDate ?? '') || !templateId) return ['Ngày đổi ca (YYYY-MM-DD) và ca mới là bắt buộc'];

  const template = await db.shiftTemplate.findUnique({ where: { id: String(templateId) } });
  if (!template || !TIME.test(template.startTime) || !TIME.test(template.endTime)) return ['Ca làm việc mới không tồn tại'];

  const start = atCompanyTime(newDate, template.startTime);
  const end = atCompanyTime(template.endTime <= template.startTime ? addDays(newDate, 1) : newDate, template.endTime); // Ca qua đêm
  // Không tính là trùng: ca đang xin đổi, và ca của chính ngày đổi (đổi ca trong ngày là thay thế ca đó;
  // web có thể gửi scheduleId mặc định không trùng ca của ngày này). Trùng khác ngày do AI kiểm tra tiếp.
  const others = (await schedulesAround(db, employeeId, newDate)).filter(
    (s) => s.id !== p.scheduleId && s.date.toISOString().slice(0, 10) !== newDate,
  );
  if (others.some((s) => overlaps(start, end, s.shiftStart, s.shiftEnd))) {
    return ['Ca mới trùng với một ca khác đã được phân'];
  }
  return [];
}
