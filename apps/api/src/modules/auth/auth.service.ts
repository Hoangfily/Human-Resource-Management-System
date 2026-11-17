import { randomUUID } from 'crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { jwtSecret } from './jwt-secrets';
import { LOCK_MINUTES, MAX_FAILED_LOGINS, hashPassword, verifyPassword } from './password.util';

// Một thông báo duy nhất cho email không tồn tại, sai mật khẩu, tài khoản nghỉ việc hoặc chưa có mật khẩu:
// không để người ngoài dò xem email nào có trong hệ thống.
const INVALID_CREDENTIALS = 'Email hoặc mật khẩu không đúng';

interface TokenOwner {
  id: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  // Đọc lúc khởi tạo: thiếu biến nào thì API dừng ngay khi khởi động, không đợi tới lần đăng nhập đầu tiên
  private readonly accessTokenSecret = jwtSecret('JWT_ACCESS_SECRET');
  private readonly refreshTokenSecret = jwtSecret('JWT_REFRESH_SECRET');

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

    if (!employee || employee.status === 'RESIGNED' || !employee.passwordHash) {
      await verifyPassword(loginDto.password, null); // Tốn thời gian như một lần kiểm tra thật
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    this.assertNotLocked(employee.lockedUntil);

    if (!(await verifyPassword(loginDto.password, employee.passwordHash))) {
      await this.registerFailure(employee.id, employee.email);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (employee.failedLoginCount > 0 || employee.lockedUntil) {
      await this.prisma.employee.update({
        where: { id: employee.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }

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
        mustChangePassword: employee.mustChangePassword,
      },
      tokens: await this.issueTokens(employee),
    };
  }

  /**
   * Nhân viên tự đổi mật khẩu. Mọi phiên đăng nhập cũ bị thu hồi và trả về token mới cho phiên hiện tại.
   * Sai mật khẩu hiện tại trả 400 (không phải 401): web coi 401 là "hết phiên" và đăng xuất người dùng.
   */
  async changePassword(employeeId: string, dto: ChangePasswordDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.status === 'RESIGNED' || !employee.passwordHash) {
      throw new UnauthorizedException('Tài khoản không hợp lệ');
    }

    this.assertNotLocked(employee.lockedUntil);

    if (!(await verifyPassword(dto.currentPassword, employee.passwordHash))) {
      await this.registerFailure(employee.id, employee.email); // Token bị đánh cắp cũng không dò được mật khẩu
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    }
    if (dto.newPassword.toLowerCase().includes(employee.email.split('@')[0].toLowerCase())) {
      throw new BadRequestException('Mật khẩu mới không được chứa phần tên của email');
    }

    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.employee.update({
        where: { id: employee.id },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.refreshSession.deleteMany({ where: { employeeId: employee.id } }),
      this.prisma.auditLog.create({
        data: {
          actorType: 'HUMAN',
          actorId: employee.id,
          action: 'CHANGE_PASSWORD',
          entityType: 'Employee',
          entityId: employee.id,
          payload: { email: employee.email }, // Không bao giờ ghi mật khẩu vào nhật ký
        },
      }),
    ]);

    return { success: true, tokens: await this.issueTokens(employee) };
  }

  async refresh(refreshToken: string) {
    let payload: { sub: string; email: string; role: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.refreshTokenSecret,
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

    // Xoá session cũ và tạo session mới
    await this.prisma.refreshSession.delete({
      where: { id: session.id },
    });

    return { tokens: await this.issueTokens(employee) };
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
      mustChangePassword: employee.mustChangePassword,
    };
  }

  /** Cặp token mới và lưu phiên refresh token (7 ngày). */
  private async issueTokens(employee: TokenOwner) {
    const payload = {
      sub: employee.id,
      email: employee.email,
      role: employee.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.accessTokenSecret,
        expiresIn: '24h',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.refreshTokenSecret,
        expiresIn: '7d',
        // jti ngẫu nhiên: 2 lần đăng nhập trong cùng 1 giây không sinh ra token trùng (token là unique trong DB)
        jwtid: randomUUID(),
      }),
    ]);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshSession.create({
      data: {
        token: refreshToken,
        employeeId: employee.id,
        expiresAt,
      },
    });

    return { accessToken, refreshToken, expiresIn: 86400 };
  }

  private assertNotLocked(lockedUntil: Date | null) {
    if (lockedUntil && lockedUntil > new Date()) {
      const minutes = Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000);
      throw new HttpException(
        {
          code: 'ACCOUNT_LOCKED',
          message: `Tài khoản tạm khóa do nhập sai mật khẩu nhiều lần. Vui lòng thử lại sau ${minutes} phút.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Cộng một lần sai (nguyên tử); đủ ngưỡng thì khóa tạm và ghi nhật ký. */
  private async registerFailure(employeeId: string, email: string) {
    const { failedLoginCount } = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (failedLoginCount < MAX_FAILED_LOGINS) return;

    await this.prisma.$transaction([
      this.prisma.employee.update({
        where: { id: employeeId },
        data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
      }),
      this.prisma.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          action: 'ACCOUNT_LOCKED',
          entityType: 'Employee',
          entityId: employeeId,
          payload: { email, minutes: LOCK_MINUTES, reason: `${MAX_FAILED_LOGINS} lần nhập sai mật khẩu liên tiếp` },
        },
      }),
    ]);
  }
}
