import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const email = loginDto.email.trim().toLowerCase();

    const employee = await this.prisma.employee.findUnique({
      where: { email },
      include: {
        department: true,
        position: true,
      },
    });

    if (!employee) {
      throw new UnauthorizedException('Không tìm thấy tài khoản với email này');
    }

    if (employee.status === 'RESIGNED') {
      throw new UnauthorizedException('Tài khoản đã nghỉ việc / bị vô hiệu hóa');
    }

    const payload = {
      sub: employee.id,
      email: employee.email,
      role: employee.role,
    };

    const accessTokenSecret =
      process.env.JWT_ACCESS_SECRET || 'hr_agent_super_secret_jwt_access_token_key_2026';
    const refreshTokenSecret =
      process.env.JWT_REFRESH_SECRET || 'hr_agent_super_secret_jwt_refresh_token_key_2026';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessTokenSecret,
        expiresIn: '24h',
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshTokenSecret,
        expiresIn: '7d',
      }),
    ]);

    // Lưu phiên refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshSession.create({
      data: {
        token: refreshToken,
        employeeId: employee.id,
        expiresAt,
      },
    });

    return {
      user: {
        id: employee.id,
        email: employee.email,
        fullName: employee.fullName,
        role: employee.role,
        departmentId: employee.departmentId ?? undefined,
        departmentName: employee.department?.name,
        positionId: employee.positionId ?? undefined,
        positionName: employee.position?.title,
        avatarUrl: employee.avatarUrl ?? undefined,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 86400,
      },
    };
  }

  async refresh(refreshToken: string) {
    const refreshTokenSecret =
      process.env.JWT_REFRESH_SECRET || 'hr_agent_super_secret_jwt_refresh_token_key_2026';
    const accessTokenSecret =
      process.env.JWT_ACCESS_SECRET || 'hr_agent_super_secret_jwt_access_token_key_2026';

    let payload: { sub: string; email: string; role: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: refreshTokenSecret,
      });
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }

    const session = await this.prisma.refreshSession.findFirst({
      where: {
        token: refreshToken,
        employeeId: payload.sub,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Phiên đăng nhập không tồn tại hoặc đã hết hiệu lực');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.sub },
    });

    if (!employee || employee.status === 'RESIGNED') {
      throw new UnauthorizedException('Tài khoản không hợp lệ');
    }

    const newPayload = {
      sub: employee.id,
      email: employee.email,
      role: employee.role,
    };

    const [newAccessToken, newRefreshToken] = await Promise.all([
      this.jwtService.signAsync(newPayload, {
        secret: accessTokenSecret,
        expiresIn: '24h',
      }),
      this.jwtService.signAsync(newPayload, {
        secret: refreshTokenSecret,
        expiresIn: '7d',
      }),
    ]);

    // Xoá session cũ và tạo session mới
    await this.prisma.refreshSession.delete({
      where: { id: session.id },
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshSession.create({
      data: {
        token: newRefreshToken,
        employeeId: employee.id,
        expiresAt,
      },
    });

    return {
      tokens: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 86400,
      },
    };
  }

  async logout(employeeId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshSession.deleteMany({
        where: { token: refreshToken, employeeId },
      });
    } else {
      await this.prisma.refreshSession.deleteMany({
        where: { employeeId },
      });
    }

    return { success: true, message: 'Đăng xuất thành công' };
  }

  async getProfile(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        department: true,
        position: true,
        manager: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!employee) {
      throw new UnauthorizedException('Không tìm thấy thông tin nhân viên');
    }

    return {
      id: employee.id,
      email: employee.email,
      fullName: employee.fullName,
      role: employee.role,
      status: employee.status,
      departmentId: employee.departmentId,
      departmentName: employee.department?.name,
      positionId: employee.positionId,
      positionName: employee.position?.title,
      managerId: employee.managerId,
      managerName: employee.manager?.fullName,
      avatarUrl: employee.avatarUrl,
      phone: employee.phone,
      joinDate: employee.joinDate,
    };
  }
}
