import {
  Body, Controller, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { RefreshGuard } from './guards/refresh.guard';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { StaffLoginDto } from './dto/staff-login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { OtpResponseDto } from './dto/otp-response.dto';
import { VerifyOtpResponseDto } from './dto/verify-otp-response.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ── Customer: Send OTP ──
  @Post('customer/send-otp')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiCreatedResponse({ type: OtpResponseDto })
  async sendOtp(@Body() body: SendOtpDto) {
    return this.auth.sendOtp(body.phone);
  }

  // ── Customer: Verify OTP ──
  @Post('customer/verify-otp')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiCreatedResponse({ type: VerifyOtpResponseDto })
  async verifyOtp(
    @Body() body: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.verifyOtp(body.phone, body.code);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, isNew: result.isNew, user: result.user };
  }

  // ── Staff: Login ──
  @Post('staff/login')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiCreatedResponse({ type: LoginResponseDto })
  async staffLogin(
    @Body() body: StaffLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.staffLogin(body.email, body.password);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  // ── Token Refresh ──
  @Post('refresh')
  @Public()
  @UseGuards(RefreshGuard)
  @ApiOkResponse({ schema: { properties: { accessToken: { type: 'string', nullable: true } } } })
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.refresh_token;
    if (!token) {
      return { accessToken: null };
    }
    const result = await this.auth.refreshTokens(token);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  // ── Logout ──
  @Post('logout')
  @ApiBearerAuth()
  @ApiOkResponse({ schema: { properties: { message: { type: 'string' } } } })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.refresh_token;
    if (token) {
      await this.auth.logout(token);
    }
    res.clearCookie('refresh_token', { path: '/auth/refresh' });
    return { message: 'Logged out' };
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 14 * 24 * 60 * 60 * 1000,
    });
  }
}
