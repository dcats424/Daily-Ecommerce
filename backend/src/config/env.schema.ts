import { z } from 'zod';

export const envSchema = z.object({
  HTTP_PORT: z.coerce.number().default(3001),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DATABASE: z.string(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('14d'),

  DATABASE_URL: z.string().url(),

  OTP_CODE_LENGTH: z.coerce.number().default(6),
  OTP_EXPIRY_MINUTES: z.coerce.number().default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),

  THROTTLE_TTL: z.coerce.number().default(60000),
  THROTTLE_LIMIT: z.coerce.number().default(60),
  AUTH_THROTTLE_TTL: z.coerce.number().default(60000),
  AUTH_THROTTLE_LIMIT: z.coerce.number().default(10),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
});
