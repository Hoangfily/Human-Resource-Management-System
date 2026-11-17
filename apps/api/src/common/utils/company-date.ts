/**
 * Ngày giờ theo múi giờ công ty (COMPANY.TIMEZONE = Asia/Ho_Chi_Minh), không phụ thuộc múi giờ của server.
 * Các field ngày dạng "YYYY-MM-DD" được hiểu theo giờ công ty (docs/05-business-spec.md §2).
 */
export const COMPANY_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const COMPANY_UTC_OFFSET = '+07:00';

/** Hôm nay theo giờ công ty, dạng YYYY-MM-DD. */
export function todayInCompany(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: COMPANY_TIMEZONE }).format(new Date());
}

/** Năm hiện tại theo giờ công ty (đêm 31/12 giờ UTC đã là năm mới ở Việt Nam). */
export function currentYear(): number {
  return Number(todayInCompany().slice(0, 4));
}

/** Tháng hiện tại (1–12) theo giờ công ty. */
export function currentMonth(): number {
  return Number(todayInCompany().slice(5, 7));
}

/** Cộng `days` ngày vào ngày "YYYY-MM-DD". */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Thứ trong tuần của ngày "YYYY-MM-DD": 0 = Chủ Nhật … 6 = Thứ Bảy. */
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/** Thời điểm "HH:mm" của ngày "YYYY-MM-DD" theo giờ công ty. */
export function atCompanyTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${COMPANY_UTC_OFFSET}`);
}
