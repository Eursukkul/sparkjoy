import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Same message for unknown email and wrong password — no user enumeration.
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordOk = await compare(password, user.passwordHash);
    if (!passwordOk) throw new UnauthorizedException('Invalid credentials');

    const token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      name: user.name,
    });
    return { token, user: { id: user.id, email: user.email, name: user.name } };
  }
}
