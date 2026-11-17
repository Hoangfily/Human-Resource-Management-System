import { PUBLIC_EXAMPLES as JWT_EXAMPLES } from '../modules/auth/jwt-secrets';

/**
 * Kiểm tra cấu hình bí mật khi NODE_ENV=production: API không khởi động nếu còn dùng giá trị mẫu có trong repo,
 * giá trị quá ngắn, hoặc hai bí mật khác mục đích bị đặt trùng nhau. Máy phát triển không bị ràng buộc.
 */

const AI_TOKEN_EXAMPLES = new Set(['ai-service-secret-token-hr-2026', 'ai-inbound-secret-token-hr-2026']);
const DATABASE_PASSWORD_EXAMPLES = new Set(['change-me-local']);
const MIN_LENGTH = 32;

type Env = Record<string, string | undefined>;

function checkSecret(env: Env, name: string, examples: Set<string>): string | null {
  const value = env[name]?.trim();
  if (!value) return `${name} chưa được đặt`;
  if (examples.has(value)) return `${name} đang là giá trị mẫu công khai trong repo`;
  if (value.length < MIN_LENGTH) return `${name} ngắn hơn ${MIN_LENGTH} ký tự`;
  return null;
}

/** Danh sách vấn đề (rỗng là ổn). Hàm thuần, không đọc process.env, để kiểm tra được từng trường hợp. */
export function productionConfigProblems(env: Env): string[] {
  const problems: string[] = [];

  const secrets: [string, Set<string>][] = [
    ['JWT_ACCESS_SECRET', JWT_EXAMPLES],
    ['JWT_REFRESH_SECRET', JWT_EXAMPLES],
    ['AI_SERVICE_TOKEN', AI_TOKEN_EXAMPLES],
    ['AI_INBOUND_TOKEN', AI_TOKEN_EXAMPLES],
  ];
  for (const [name, examples] of secrets) {
    const problem = checkSecret(env, name, examples);
    if (problem) problems.push(problem);
  }

  // Mỗi cặp phục vụ một việc khác nhau: lộ một bên không được kéo theo bên kia
  const same = (a: string, b: string) => env[a]?.trim() && env[a]?.trim() === env[b]?.trim();
  if (same('JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET')) {
    problems.push('JWT_ACCESS_SECRET và JWT_REFRESH_SECRET phải khác nhau');
  }
  if (same('AI_SERVICE_TOKEN', 'AI_INBOUND_TOKEN')) {
    problems.push('AI_SERVICE_TOKEN và AI_INBOUND_TOKEN phải khác nhau');
  }

  try {
    const password = decodeURIComponent(new URL(env.DATABASE_URL ?? '').password);
    if (!password || DATABASE_PASSWORD_EXAMPLES.has(password)) {
      problems.push('Mật khẩu trong DATABASE_URL đang trống hoặc là giá trị mẫu (POSTGRES_PASSWORD)');
    }
  } catch {
    problems.push('DATABASE_URL chưa được đặt hoặc không hợp lệ');
  }

  return problems;
}

export function assertProductionConfig(env: Env = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  const problems = productionConfigProblems(env);
  if (problems.length > 0) {
    throw new Error(
      `Cấu hình production chưa an toàn, API không khởi động:\n- ${problems.join('\n- ')}\n` +
        'Tạo giá trị ngẫu nhiên bằng: npm run secrets:generate',
    );
  }
}
