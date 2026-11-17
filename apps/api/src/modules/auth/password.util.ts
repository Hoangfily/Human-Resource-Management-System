import { randomInt } from 'crypto';
import { compare, hash } from 'bcryptjs';

// bcrypt chỉ dùng 72 byte đầu của mật khẩu: giới hạn độ dài để không có phần "bị bỏ qua" âm thầm
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 72;
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/; // Có ít nhất 1 chữ cái và 1 chữ số
export const PASSWORD_RULE_MESSAGE = `Mật khẩu dài ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} ký tự, gồm cả chữ và số`;

export const MAX_FAILED_LOGINS = 5; // Sai liên tiếp từng này lần thì khóa tạm
export const LOCK_MINUTES = 15;

const BCRYPT_COST = 12;

// Hash của một chuỗi ngẫu nhiên, chỉ để so sánh giả khi không có tài khoản thật:
// thời gian phản hồi của "email không tồn tại" và "sai mật khẩu" phải giống nhau.
const DUMMY_HASH = '$2b$12$J3n3UKVzrfRF9w8e6L9/uOnYxQBYu8T0cTJnNWT0Hum0qMVJTSpKC';

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_COST);
}

/** So khớp mật khẩu. `passwordHash` null (không có tài khoản/hash) vẫn tốn thời gian như thật và luôn trả false. */
export async function verifyPassword(plain: string, passwordHash: string | null): Promise<boolean> {
  const ok = await compare(plain, passwordHash ?? DUMMY_HASH);
  return passwordHash !== null && ok;
}

// Bỏ các ký tự dễ nhầm (0/O, 1/l/I) vì mật khẩu tạm thường được đọc hoặc gõ lại bằng tay
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGIT = '23456789';

/** Mật khẩu tạm 14 ký tự có chữ hoa, chữ thường và chữ số; dùng nguồn ngẫu nhiên của hệ điều hành. */
export function generateTemporaryPassword(): string {
  const all = UPPER + LOWER + DIGIT;
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT)];
  while (chars.length < 14) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); // Xáo trộn (Fisher–Yates) để 3 ký tự đảm bảo không luôn đứng đầu
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
