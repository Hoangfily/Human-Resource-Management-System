import * as crypto from 'crypto';

/**
 * Header `Authorization: Bearer <AI_SERVICE_TOKEN>` có phải của AI Service (docs/06-ai-integration.md) không.
 * Dùng chung cho JwtAuthGuard (xác thực) và guard giới hạn số lần gọi (AI không bị giới hạn như người dùng).
 */
export function isAiServiceToken(authHeader: unknown): boolean {
  const expected = process.env.AI_SERVICE_TOKEN;
  if (!expected || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const given = Buffer.from(authHeader.substring(7).trim());
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}
