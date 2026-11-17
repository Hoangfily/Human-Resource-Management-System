import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { isAiServiceToken } from './ai-service-token';

/** Giới hạn đọc từ biến môi trường lúc gọi (không phải lúc import): .env được nạp sau khi các module được import. */
export const limitFromEnv = (name: string, fallback: number) => () => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const THROTTLE_WINDOW_MS = 60_000;
export const GLOBAL_LIMIT = limitFromEnv('THROTTLE_GLOBAL_PER_MIN', 120);
export const LOGIN_LIMIT = limitFromEnv('THROTTLE_LOGIN_PER_MIN', 5);
export const CHAT_LIMIT = limitFromEnv('THROTTLE_CHAT_PER_MIN', 20); // Mỗi lượt chat tốn tiền gọi LLM

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  /** AI Service gọi API liên tục khi chấm đơn: nếu bị giới hạn như người dùng thì đơn kẹt ở PENDING. */
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    return isAiServiceToken(request.headers?.authorization);
  }

  protected async throwThrottlingException(_context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    throw new HttpException(
      {
        code: 'RATE_LIMITED',
        message: `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${detail.timeToBlockExpire || detail.timeToExpire} giây.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
