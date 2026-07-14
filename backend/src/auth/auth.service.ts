import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { OtpService } from '../customers/otp.service';
import { StaffService } from '../staff/staff.service';
import { JwtPayload } from './decorators/current-user.decorator';
import ApiError from '../common/errors/api.error';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly otp: OtpService,
    private readonly staff: StaffService,
  ) {}

  // ── Customer: Send OTP ──
  async sendOtp(phone: string): Promise<{ message: string; debugCode?: string }> {
    const code = await this.otp.generateOtp(phone);
    // TODO: Integrate real SMS provider here
    // For development, return the code so it can be tested
    return { message: 'OTP sent successfully', debugCode: code };
  }

  // ── Customer: Verify OTP ──
  async verifyOtp(phone: string, code: string) {
    const valid = await this.otp.verifyOtp(phone, code);
    if (!valid) {
      await this.otp.incrementAttempts(phone);
      throw ApiError.Unauthorized('Invalid or expired OTP', 'OTP_INVALID');
    }

    const { id, isNew } = await this.customers.findOrCreate(phone);

    const payload: JwtPayload = { sub: id, type: 'customer', phone };
    const tokens = await this.issueTokens(payload, 'customer', id);

    return { ...tokens, isNew, user: { id, phone } };
  }

  // ── Staff: Login ──
  async staffLogin(email: string, password: string) {
    const staff = await this.staff.findByEmail(email);
    if (!staff) {
      throw ApiError.Unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (!staff.isActive) {
      throw ApiError.Forbidden('Account is deactivated', 'ACCOUNT_INACTIVE');
    }

    const valid = await bcrypt.compare(password, staff.password);
    if (!valid) {
      throw ApiError.Unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const payload: JwtPayload = {
      sub: staff.id,
      type: 'staff',
      email: staff.email,
      roleId: staff.roleId,
    };
    const tokens = await this.issueTokens(payload, 'staff', staff.id);

    return {
      ...tokens,
      user: { id: staff.id, email: staff.email, name: staff.name, role: staff.role },
    };
  }

  // ── Token Issuance ──
  async issueTokens(payload: JwtPayload, userType: 'customer' | 'staff', userId: string) {
    const familyId = crypto.randomUUID();

    const accessToken = this.jwt.sign(payload as object, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN') as any,
    });

    const refreshTokenValue = this.jwt.sign(
      { sub: userId, type: userType, familyId } as object,
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN') as any,
      },
    );

    // Store hashed refresh token
    await this.prisma.refreshToken.create({
      data: {
        tokenHash: hashToken(refreshTokenValue),
        familyId,
        userId,
        userType: userType.toUpperCase() as any,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken: refreshTokenValue };
  }

  // ── Refresh Token Rotation ──
  async refreshTokens(refreshTokenValue: string) {
    let payload: { sub: string; type: string; familyId: string };
    try {
      payload = this.jwt.verify(refreshTokenValue, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      }) as any;
    } catch {
      throw ApiError.Unauthorized('Invalid refresh token', 'TOKEN_INVALID');
    }

    const tokenHash = hashToken(refreshTokenValue);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) {
      throw ApiError.Unauthorized('Refresh token not found', 'TOKEN_NOT_FOUND');
    }

    if (stored.revokedAt) {
      // Token reuse detected — revoke entire family
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw ApiError.Unauthorized('Token reuse detected, family revoked', 'TOKEN_REUSED');
    }

    // Revoke current token
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    // Issue new tokens
    const userType = stored.userType.toLowerCase() as 'customer' | 'staff';
    let newPayload: JwtPayload;

    if (userType === 'customer') {
      const customer = await this.customers.findById(stored.userId);
      if (!customer) throw ApiError.Unauthorized('User not found', 'USER_NOT_FOUND');
      newPayload = { sub: customer.id, type: 'customer', phone: customer.phone };
    } else {
      const staff = await this.staff.findById(stored.userId);
      if (!staff) throw ApiError.Unauthorized('User not found', 'USER_NOT_FOUND');
      newPayload = { sub: staff.id, type: 'staff', email: staff.email, roleId: staff.roleId };
    }

    return this.issueTokens(newPayload, userType, stored.userId);
  }

  // ── Logout ──
  async logout(refreshTokenValue: string): Promise<void> {
    const tokenHash = hashToken(refreshTokenValue);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
