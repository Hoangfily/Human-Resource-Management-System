import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import * as crypto from 'crypto';

// Tài khoản đang bị buộc đổi mật khẩu (mật khẩu do HR/Admin cấp) chỉ được gọi các route này
const PASSWORD_CHANGE_ALLOWED = ['/auth/change-password', '/auth/me', '/auth/logout'];

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    // Xác thực AI Service qua AI_SERVICE_TOKEN (theo docs/06-ai-integration.md)
    const aiServiceToken = process.env.AI_SERVICE_TOKEN;
    if (aiServiceToken && authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const tokenBuf = Buffer.from(token);
      const expectedBuf = Buffer.from(aiServiceToken);

      if (tokenBuf.length === expectedBuf.length && crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
        request.user = { id: 'ai-service', role: 'AI' };
        return true;
      }
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext, status?: any) {
    const authenticated = super.handleRequest(err, user, info, context, status);
    if (authenticated?.mustChangePassword) {
      const path: string = context.switchToHttp().getRequest().path ?? '';
      if (!PASSWORD_CHANGE_ALLOWED.some((allowed) => path.endsWith(allowed))) {
        throw new ForbiddenException({
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'Bạn cần đổi mật khẩu trước khi tiếp tục sử dụng hệ thống',
        });
      }
    }
    return authenticated;
  }
}
