import { Body, Controller, Get, Header, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LOGIN_LIMIT, THROTTLE_WINDOW_MS } from '../../common/guards/app-throttler.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: LOGIN_LIMIT, ttl: THROTTLE_WINDOW_MS } }) // Theo IP: chặn dò mật khẩu hàng loạt
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  // Đổi mật khẩu: kể cả khi tài khoản đang bị buộc đổi (JwtAuthGuard cho phép riêng route này)
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  @Post('change-password')
  async changePassword(
    @CurrentUser('id') employeeId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(employeeId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @CurrentUser('id') employeeId: string,
    @Body('refreshToken') refreshToken?: string,
  ) {
    return this.authService.logout(employeeId, refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@CurrentUser('id') employeeId: string) {
    const profile = await this.authService.getProfile(employeeId);
    return {
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        departmentId: profile.departmentId,
        departmentName: profile.departmentName,
        positionId: profile.positionId,
        positionName: profile.positionName,
        avatarUrl: profile.avatarUrl,
        mustChangePassword: profile.mustChangePassword,
      },
      profile,
    };
  }
}
