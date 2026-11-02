import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../database/prisma.service';
import { jwtSecret } from '../jwt-secrets';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.sub },
      include: {
        department: true,
        position: true,
      },
    });

    if (!employee || employee.status === 'RESIGNED') {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị vô hiệu hóa');
    }

    return {
      id: employee.id,
      email: employee.email,
      fullName: employee.fullName,
      role: employee.role,
      departmentId: employee.departmentId,
      departmentName: employee.department?.name,
      positionId: employee.positionId,
      positionName: employee.position?.title,
      managerId: employee.managerId,
      avatarUrl: employee.avatarUrl,
      status: employee.status,
    };
  }
}
