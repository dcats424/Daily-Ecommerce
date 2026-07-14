import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class OtpService {
  private readonly codeLength: number;
  private readonly expiryMinutes: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.codeLength = config.get<number>('OTP_CODE_LENGTH', 6);
    this.expiryMinutes = config.get<number>('OTP_EXPIRY_MINUTES', 5);
    this.maxAttempts = config.get<number>('OTP_MAX_ATTEMPTS', 5);
  }

  async generateOtp(phone: string): Promise<string> {
    const code = Array.from({ length: this.codeLength }, () =>
      crypto.randomInt(0, 10).toString(),
    ).join('');

    const expiresAt = new Date(Date.now() + this.expiryMinutes * 60 * 1000);

    await this.prisma.otpCode.create({
      data: { phone, code, expiresAt },
    });

    return code;
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, code, usedAt: null, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      return false;
    }

    if (otp.attempts >= this.maxAttempts) {
      return false;
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { usedAt: new Date() },
    });

    return true;
  }

  async incrementAttempts(phone: string): Promise<void> {
    const latest = await this.prisma.otpCode.findFirst({
      where: { phone, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (latest) {
      await this.prisma.otpCode.update({
        where: { id: latest.id },
        data: { attempts: { increment: 1 } },
      });
    }
  }
}
