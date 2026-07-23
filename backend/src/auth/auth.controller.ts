import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';

const ACCESS_TOKEN_COOKIE = 'access_token';
const COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // matches JWT_EXPIRES_IN=1d

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // Stricter than the global limit: 5 attempts/min per IP against brute force.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login and receive an httpOnly session cookie' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.authService.login(dto.email, dto.password);
    res.cookie(ACCESS_TOKEN_COOKIE, token, {
      httpOnly: true, // JS cannot read it → XSS cannot steal the token
      sameSite: 'lax', // not sent on cross-site POSTs → CSRF mitigation
      secure: process.env.COOKIE_SECURE === 'true', // enable behind HTTPS
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/',
    });
    return { user };
  }

  @Post('logout')
  @HttpCode(200)
  // Public: clearing a cookie needs no valid token. If logout required auth,
  // an expired/invalid cookie could never be cleared → /login redirect loop.
  @Public()
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    return { success: true };
  }

  @Get('me')
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Current authenticated user (from JWT)' })
  me(@Req() req: Request) {
    const { sub, email, name } = req.user!;
    return { user: { id: sub, email, name } };
  }
}
