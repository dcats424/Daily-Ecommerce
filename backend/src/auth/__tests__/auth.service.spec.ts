import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomersService } from '../../customers/customers.service';
import { OtpService } from '../../customers/otp.service';
import { StaffService } from '../../staff/staff.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwt: any;

  const mockPrisma = {
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue('mock-token'),
    verify: jest.fn(),
  };

  const mockConfig = {
    getOrThrow: jest.fn((key: string) => {
      const map: Record<string, string> = {
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_REFRESH_EXPIRES_IN: '14d',
      };
      return map[key];
    }),
  };

  const mockCustomers = {
    findOrCreate: jest.fn(),
    findById: jest.fn(),
  };

  const mockOtp = {
    generateOtp: jest.fn(),
    verifyOtp: jest.fn(),
    incrementAttempts: jest.fn(),
  };

  const mockStaff = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: CustomersService, useValue: mockCustomers },
        { provide: OtpService, useValue: mockOtp },
        { provide: StaffService, useValue: mockStaff },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('refreshTokens - reuse detection', () => {
    it('should revoke entire family when a used token is presented again', async () => {
      const token = 'used-refresh-token';
      const familyId = 'family-uuid';

      mockJwt.verify.mockReturnValue({ sub: 'user1', type: 'customer', familyId });
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'token-id',
        tokenHash: 'hash',
        familyId,
        revokedAt: new Date(),
      });

      await expect(service.refreshTokens(token)).rejects.toMatchObject({
        response: { code: 'TOKEN_REUSED' },
      });
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should issue new tokens when refresh token is valid', async () => {
      const token = 'valid-refresh-token';
      const familyId = 'family-uuid';

      mockJwt.verify.mockReturnValue({ sub: 'user1', type: 'customer', familyId });
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'token-id',
        tokenHash: 'hash',
        familyId,
        revokedAt: null,
        userId: 'user1',
        userType: 'CUSTOMER',
      });
      mockCustomers.findById.mockResolvedValue({ id: 'user1', phone: '+251911111111' });

      const result = await service.refreshTokens(token);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'token-id' } }),
      );
      expect(mockPrisma.refreshToken.create).toHaveBeenCalled();
    });
  });

  describe('staffLogin', () => {
    it('should throw on invalid email', async () => {
      mockStaff.findByEmail.mockResolvedValue(null);

      await expect(service.staffLogin('nonexist@test.com', 'pass123')).rejects
        .toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    });

    it('should throw on deactivated account', async () => {
      mockStaff.findByEmail.mockResolvedValue({
        email: 'deactivated@test.com',
        isActive: false,
        password: '$2b$10$test',
        role: { id: 'role-1', name: 'Staff' },
      });

      await expect(service.staffLogin('deactivated@test.com', 'pass123')).rejects
        .toMatchObject({ response: { code: 'ACCOUNT_INACTIVE' } });
    });
  });

  describe('verifyOtp', () => {
    it('should throw on invalid OTP', async () => {
      mockOtp.verifyOtp.mockResolvedValue(false);

      await expect(service.verifyOtp('+251911111111', '000000')).rejects
        .toMatchObject({ response: { code: 'OTP_INVALID' } });
    });

    it('should create customer on first login', async () => {
      mockOtp.verifyOtp.mockResolvedValue(true);
      mockCustomers.findOrCreate.mockResolvedValue({ id: 'new-customer', isNew: true });

      const result = await service.verifyOtp('+251911111111', '123456');

      expect(result.isNew).toBe(true);
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });
  });
});
