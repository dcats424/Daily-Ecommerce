# Phase 1: Foundation — Scaffolding, Auth, RBAC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational layer — NestJS + Prisma schema, phone OTP auth for customers, email+password auth for staff, JWT with refresh token rotation/reuse detection, RBAC module, and global security infrastructure (default-deny guard, validation, rate limiting).

**Architecture:** Flat modular structure under `src/` — each domain (auth, customers, staff, rbac) is a self-contained NestJS module. The existing boilerplate's infrastructure (PrismaModule, HttpExceptionFilter, Winston, throttler) is kept and adapted. Google OAuth is removed entirely.

**Tech Stack:** NestJS 11, TypeScript, Prisma ORM 6, PostgreSQL 16, Passport.js (JWT strategy), bcrypt, class-validator, Zod, @nestjs/throttler (Redis-backed), Winston, Helmet.

---

## File Structure

All files created/modified within `backend/` directory (root = `/home/time/Desktop/e-commerce/backend/`).

### Files to Create

```
prisma/
  schema.prisma              — Full domain schema (overwrite existing)
  seed.ts                    — Seed script for admin staff + roles

src/
  auth/
    auth.module.ts           — Auth module (imports JwtModule, PassportModule)
    auth.controller.ts       — /auth/* endpoints (customer + staff)
    auth.service.ts          — Auth business logic
    dto/
      send-otp.dto.ts        — { phone: string }
      verify-otp.dto.ts      — { phone: string, code: string }
      staff-login.dto.ts     — { email: string, password: string }
      create-staff.dto.ts    — { email, password, name, roleId }
      refresh-token.dto.ts   — (empty, cookie-driven)
    guards/
      access.guard.ts        — JWT access guard with @Public() support
      refresh.guard.ts       — JWT refresh guard (cookie-extracted)
      roles.guard.ts         — Resource-based RBAC guard
    strategies/
      access.strategy.ts     — Passport strategy for access tokens
      refresh.strategy.ts    — Passport strategy for refresh cookies
    decorators/
      roles.decorator.ts     — @RBAC(resource, action) decorator
      current-user.decorator.ts — @CurrentUser() param decorator
      public.decorator.ts    — @Public() route decorator

  customers/
    customers.module.ts
    customers.service.ts     — Customer CRUD (findByPhone, create, findById)
    otp.service.ts           — OTP generation, verification, expiry

  staff/
    staff.module.ts
    staff.service.ts         — Staff CRUD (create, findByEmail, findById, list)
    staff.controller.ts      — Admin-only staff management endpoints

  rbac/
    rbac.module.ts
    rbac.service.ts          — Permission checks, role management
    rbac.controller.ts       — Role/permission CRUD (admin only)

  common/
    filters/
      http-exception.filter.ts  — Consistent error JSON shape (keep existing)
    middleware/
      logger.middleware.ts   — Request logging (keep existing)

  config/
    env.schema.ts            — Zod env validation (overwrite, remove Google OAuth)
    env.ts                   — Parsed env export (keep existing)

  prisma/
    prisma.module.ts         — Global Prisma module (keep existing)
    prisma.service.ts        — Prisma client wrapper (keep existing)

  app.module.ts              — Root module (overwrite)
  main.ts                    — Bootstrap (overwrite)
```

### Files to Delete
```
src/api/                     — Entire old versioned API structure
src/libs/enum/               — Old role enum (replaced)
src/libs/errors/             — Keep api.error.ts, delete others if any
src/libs/pipe/               — Old pipes (replaced by class-validator)
src/libs/decorators/         — Old decorators (replaced)
src/libs/filters/            — Keep http-exception.filter.ts
src/libs/middleware/          — Keep logger.middleware.ts
src/libs/prisma/             — Keep (prisma.module.ts, prisma.service.ts, health/)
src/libs/config/             — Keep (env.schema.ts, env.ts)
```

### Files to Modify
```
.env                         — Remove Google OAuth vars, add OTP vars
docker-compose.yaml          — Update DB name if needed
package.json                 — Remove google-auth-library, add needed deps
```

---

### Task 1: Prisma Schema + Clean Boilerplate

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Modify: `.env`
- Delete: `src/api/` directory
- Delete: `src/libs/enum/`, `src/libs/errors/` (keep api.error.ts), `src/libs/pipe/`, `src/libs/decorators/`

- [ ] **Step 1: Write the Prisma schema**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserType {
  CUSTOMER
  STAFF
}

model Customer {
  id        String   @id @default(uuid()) @db.Uuid
  phone     String   @unique() @db.VarChar(20)
  name      String?  @db.VarChar(100)
  email     String?  @db.VarChar(100)
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  refreshTokens RefreshToken[]
  orders        Order[]

  @@map("customers")
}

model Staff {
  id        String   @id @default(uuid()) @db.Uuid
  email     String   @unique() @db.VarChar(100)
  password  String   @db.VarChar(255)
  name      String   @db.VarChar(100)
  isActive  Boolean  @default(true) @map("is_active")
  roleId    String   @map("role_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  role          Role           @relation(fields: [roleId], references: [id])
  refreshTokens RefreshToken[]

  @@map("staff")
}

model Role {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @unique() @db.VarChar(50)
  description String?  @db.VarChar(255)
  isSystem    Boolean  @default(false) @map("is_system")
  createdAt   DateTime @default(now()) @map("created_at")

  permissions RolePermission[]
  staff       Staff[]

  @@map("roles")
}

model Resource {
  id          String  @id @default(uuid()) @db.Uuid
  name        String  @unique() @db.VarChar(100)
  description String? @db.VarChar(255)

  permissions RolePermission[]

  @@map("resources")
}

model RolePermission {
  id         String @id @default(uuid()) @db.Uuid
  roleId     String @map("role_id") @db.Uuid
  resourceId String @map("resource_id") @db.Uuid
  canRead    Boolean @default(false) @map("can_read")
  canWrite   Boolean @default(false) @map("can_write")
  canDelete  Boolean @default(false) @map("can_delete")

  role     Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)
  resource Resource @relation(fields: [resourceId], references: [id], onDelete: Cascade)

  @@unique([roleId, resourceId])
  @@map("role_permissions")
}

model RefreshToken {
  id        String   @id @default(uuid()) @db.Uuid
  tokenHash String   @unique() @map("token_hash") @db.VarChar(255)
  familyId  String   @map("family_id") @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  userType  UserType @map("user_type") @db.VarChar(20)
  expiresAt DateTime @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId, userType])
  @@index([familyId])
  @@map("refresh_tokens")
}

model OtpCode {
  id        String   @id @default(uuid()) @db.Uuid
  phone     String   @db.VarChar(20)
  code      String   @db.VarChar(6)
  expiresAt DateTime @map("expires_at")
  usedAt    DateTime? @map("used_at")
  attempts  Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at")

  @@index([phone, code])
  @@map("otp_codes")
}

model Order {
  id              String   @id @default(uuid()) @db.Uuid
  customerId      String   @map("customer_id") @db.Uuid
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  customer Customer @relation(fields: [customerId], references: [id])

  @@map("orders")
}
```

- [ ] **Step 2: Run Prisma migration**

```bash
cd /home/time/Desktop/e-commerce/backend
npx prisma migrate dev --name init
```

Expected: Migration creates all tables in PostgreSQL.

- [ ] **Step 3: Write the seed script**

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Create default roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'Super Admin' },
    update: {},
    create: { name: 'Super Admin', description: 'Full system access', isSystem: true },
  });

  const managerRole = await prisma.role.upsert({
    where: { name: 'Manager' },
    update: {},
    create: { name: 'Manager', description: 'Order and product management', isSystem: false },
  });

  const staffRole = await prisma.role.upsert({
    where: { name: 'Staff' },
    update: {},
    create: { name: 'Staff', description: 'Order review only', isSystem: false },
  });

  // Create resources
  const resources = ['orders', 'catalog', 'customers', 'staff', 'roles', 'reports', 'gift_cards', 'sliders', 'faq'];
  for (const name of resources) {
    await prisma.resource.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} management` },
    });
  }

  // Grant Super Admin full access to all resources
  const allResources = await prisma.resource.findMany();
  for (const resource of allResources) {
    await prisma.rolePermission.upsert({
      where: { roleId_resourceId: { roleId: adminRole.id, resourceId: resource.id } },
      update: { canRead: true, canWrite: true, canDelete: true },
      create: {
        roleId: adminRole.id,
        resourceId: resource.id,
        canRead: true,
        canWrite: true,
        canDelete: true,
      },
    });
  }

  // Create admin staff
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await prisma.staff.upsert({
    where: { email: 'admin@dailymart.com' },
    update: {},
    create: {
      email: 'admin@dailymart.com',
      password: hashedPassword,
      name: 'Super Admin',
      roleId: adminRole.id,
    },
  });

  console.log('✅ Seed complete: admin@dailymart.com / admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 4: Run seed**

```bash
npx prisma db seed
```

Expected: Seeds admin role, resources, permissions, and admin@dailymart.com staff account.

- [ ] **Step 5: Clean up boilerplate files** (keep prisma, filters, middleware, config — they'll be moved in Task 7)

```bash
cd /home/time/Desktop/e-commerce/backend
rm -rf src/api
rm -rf src/libs/enum src/libs/errors src/libs/pipe src/libs/decorators src/libs/config
```

Expected: `src/libs/` still has prisma/, filters/, middleware/ which get moved in Task 7.

- [ ] **Step 6: Update .env**

```
HTTP_PORT=3001
POSTGRES_PORT=5432

POSTGRES_USER=admin
POSTGRES_PASSWORD=admin
POSTGRES_DATABASE=daily_commerce

JWT_ACCESS_SECRET=<generate-a-new-64-char-hex-secret>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=<generate-a-new-64-char-hex-secret>
JWT_REFRESH_EXPIRES_IN=14d

DATABASE_URL=postgresql://admin:admin@localhost:5432/daily_commerce?schema=public

# OTP
OTP_CODE_LENGTH=6
OTP_EXPIRY_MINUTES=5
OTP_MAX_ATTEMPTS=5

# Rate Limit
THROTTLE_TTL=60000
THROTTLE_LIMIT=60
AUTH_THROTTLE_TTL=60000
AUTH_THROTTLE_LIMIT=10

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

Generate new secrets:
```bash
openssl rand -hex 32
```

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts .env
git rm -r src/api
git rm -r src/libs/enum src/libs/errors src/libs/pipe src/libs/decorators src/libs/config
git commit -m "feat: prisma schema for auth + RBAC, clean boilerplate"
```

---

### Task 2: Config + Common Infrastructure

**Files:**
- Modify: `src/libs/config/env.schema.ts`
- Create: `src/config/env.schema.ts`
- Create: `src/common/filters/http-exception.filter.ts`

- [ ] **Step 1: Write the Zod env schema**

```typescript
// src/config/env.schema.ts
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
```

- [ ] **Step 2: Write the env export**

```typescript
// src/config/env.ts
import { envSchema } from './env.schema';

export const env = envSchema.parse(process.env);
export type Env = typeof env;
```

- [ ] **Step 3: Write the HTTP exception filter**

```typescript
// src/common/filters/http-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const res = exception.getResponse();

    const base = {
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (typeof res === 'string') {
      return response.status(status).json({
        statusCode: status,
        message: res,
        ...base,
      });
    }

    return response.status(status).json({
      ...res,
      ...base,
    });
  }
}
```

- [ ] **Step 4: Delete old env.schema.ts (replaced by new src/config/)**

```bash
rm -f src/libs/config/env.schema.ts src/libs/config/env.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/config/ src/common/filters/
git rm src/libs/config/env.schema.ts src/libs/config/env.ts
git commit -m "feat: config module with Zod validation, common infrastructure"
```

---

### Task 3: Core Auth — DTOs, Decorators, Strategies, Guards

**Files:**
- Create: `src/auth/dto/send-otp.dto.ts`
- Create: `src/auth/dto/verify-otp.dto.ts`
- Create: `src/auth/dto/staff-login.dto.ts`
- Create: `src/auth/dto/create-staff.dto.ts`
- Create: `src/auth/decorators/public.decorator.ts`
- Create: `src/auth/decorators/current-user.decorator.ts`
- Create: `src/auth/decorators/roles.decorator.ts`
- Create: `src/auth/strategies/access.strategy.ts`
- Create: `src/auth/strategies/refresh.strategy.ts`
- Create: `src/auth/guards/access.guard.ts`
- Create: `src/auth/guards/refresh.guard.ts`
- Create: `src/auth/guards/roles.guard.ts`

- [ ] **Step 1: Write DTOs**

```typescript
// src/auth/dto/send-otp.dto.ts
import { IsString, Matches } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, { message: 'Invalid phone number format' })
  phone: string;
}
```

```typescript
// src/auth/dto/verify-otp.dto.ts
import { IsString, Matches, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, { message: 'Invalid phone number format' })
  phone: string;

  @IsString()
  @Length(4, 8)
  code: string;
}
```

```typescript
// src/auth/dto/staff-login.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class StaffLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
```

```typescript
// src/auth/dto/create-staff.dto.ts
import { IsEmail, IsString, MinLength, IsUUID } from 'class-validator';

export class CreateStaffDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  name: string;

  @IsUUID()
  roleId: string;
}
```

- [ ] **Step 2: Write decorators**

```typescript
// src/auth/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

```typescript
// src/auth/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
  sub: string;
  type: 'customer' | 'staff';
  phone?: string;
  email?: string;
  roleId?: string;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): JwtPayload => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
```

```typescript
// src/auth/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const RBAC_KEY = 'rbac';
export interface RbacOptions {
  resource: string;
  action: 'read' | 'write' | 'delete';
}
export const RBAC = (resource: string, action: 'read' | 'write' | 'delete') =>
  SetMetadata(RBAC_KEY, { resource, action } as RbacOptions);
```

- [ ] **Step 3: Write Passport strategies**

```typescript
// src/auth/strategies/access.strategy.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../decorators/current-user.decorator';

@Injectable()
export class AccessStrategy extends PassportStrategy(Strategy, 'access') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    return payload;
  }
}
```

```typescript
// src/auth/strategies/refresh.strategy.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req.cookies?.refresh_token,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),
    });
  }

  async validate(payload: { sub: string; type: string; familyId: string }) {
    return { sub: payload.sub, type: payload.type, familyId: payload.familyId };
  }
}
```

- [ ] **Step 4: Write guards**

```typescript
// src/auth/guards/access.guard.ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AccessGuard extends AuthGuard('access') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

```typescript
// src/auth/guards/refresh.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class RefreshGuard extends AuthGuard('refresh') {}
```

```typescript
// src/auth/guards/roles.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RBAC_KEY, RbacOptions } from '../decorators/roles.decorator';
import { RbacService } from '../../rbac/rbac.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rbacOptions = this.reflector.getAllAndOverride<RbacOptions>(RBAC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!rbacOptions) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user || user.type !== 'staff') {
      return false;
    }

    return this.rbac.checkPermission(user.roleId, rbacOptions.resource, rbacOptions.action);
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/auth/dto/ src/auth/decorators/ src/auth/strategies/ src/auth/guards/
git commit -m "feat: auth DTOs, decorators, Passport strategies, guards"
```

---

### Task 4: OTP Service + Customers Module

**Files:**
- Create: `src/customers/otp.service.ts`
- Create: `src/customers/customers.service.ts`
- Create: `src/customers/customers.module.ts`

- [ ] **Step 1: Write OTP service**

```typescript
// src/customers/otp.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import crypto from 'crypto';

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
```

- [ ] **Step 2: Write customers service**

```typescript
// src/customers/customers.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByPhone(phone: string) {
    return this.prisma.customer.findUnique({ where: { phone } });
  }

  async findById(id: string) {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  async create(phone: string, name?: string, email?: string) {
    return this.prisma.customer.create({
      data: { phone, name, email },
    });
  }

  async findOrCreate(phone: string): Promise<{ id: string; isNew: boolean }> {
    const existing = await this.findByPhone(phone);
    if (existing) {
      return { id: existing.id, isNew: false };
    }
    const created = await this.create(phone);
    return { id: created.id, isNew: true };
  }
}
```

- [ ] **Step 3: Write customers module**

```typescript
// src/customers/customers.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomersService } from './customers.service';
import { OtpService } from './otp.service';

@Module({
  imports: [PrismaModule],
  providers: [CustomersService, OtpService],
  exports: [CustomersService, OtpService],
})
export class CustomersModule {}
```

- [ ] **Step 4: Commit**

```bash
git add src/customers/
git commit -m "feat: OTP service and customers module"
```

---

### Task 5: Staff Service + RBAC Service

**Files:**
- Create: `src/staff/staff.service.ts`
- Create: `src/staff/staff.module.ts`
- Create: `src/staff/staff.controller.ts`
- Create: `src/rbac/rbac.service.ts`
- Create: `src/rbac/rbac.module.ts`
- Create: `src/rbac/rbac.controller.ts`

- [ ] **Step 1: Write RBAC service**

```typescript
// src/rbac/rbac.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async checkPermission(
    roleId: string,
    resource: string,
    action: 'read' | 'write' | 'delete',
  ): Promise<boolean> {
    const permission = await this.prisma.rolePermission.findFirst({
      where: {
        roleId,
        resource: { name: resource },
      },
      include: { resource: true },
    });

    if (!permission) return false;

    switch (action) {
      case 'read':
        return permission.canRead;
      case 'write':
        return permission.canWrite;
      case 'delete':
        return permission.canDelete;
      default:
        return false;
    }
  }

  async getRoles() {
    return this.prisma.role.findMany({
      include: {
        permissions: {
          include: { resource: true },
        },
      },
    });
  }

  async getResources() {
    return this.prisma.resource.findMany();
  }

  async assignPermission(
    roleId: string,
    resourceId: string,
    data: { canRead?: boolean; canWrite?: boolean; canDelete?: boolean },
  ) {
    return this.prisma.rolePermission.upsert({
      where: { roleId_resourceId: { roleId, resourceId } },
      update: data,
      create: { roleId, resourceId, ...data },
    });
  }

  async createRole(name: string, description?: string) {
    return this.prisma.role.create({ data: { name, description } });
  }

  async createResource(name: string, description?: string) {
    return this.prisma.resource.create({ data: { name, description } });
  }
}
```

- [ ] **Step 2: Write RBAC controller**

```typescript
// src/rbac/rbac.controller.ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { AccessGuard } from '../auth/guards/access.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RBAC } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('rbac')
@UseGuards(AccessGuard, RolesGuard)
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('roles')
  @RBAC('roles', 'read')
  async getRoles() {
    return this.rbac.getRoles();
  }

  @Get('resources')
  @RBAC('roles', 'read')
  async getResources() {
    return this.rbac.getResources();
  }

  @Post('roles')
  @RBAC('roles', 'write')
  async createRole(@Body() body: { name: string; description?: string }) {
    return this.rbac.createRole(body.name, body.description);
  }

  @Post('permissions')
  @RBAC('roles', 'write')
  async assignPermission(
    @Body() body: { roleId: string; resourceId: string; canRead?: boolean; canWrite?: boolean; canDelete?: boolean },
  ) {
    return this.rbac.assignPermission(body.roleId, body.resourceId, {
      canRead: body.canRead,
      canWrite: body.canWrite,
      canDelete: body.canDelete,
    });
  }
}
```

- [ ] **Step 3: Write RBAC module**

```typescript
// src/rbac/rbac.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';

@Module({
  imports: [PrismaModule],
  providers: [RbacService],
  controllers: [RbacController],
  exports: [RbacService],
})
export class RbacModule {}
```

- [ ] **Step 4: Write staff service**

```typescript
// src/staff/staff.service.ts
import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.staff.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { role: true },
    });
  }

  async findById(id: string) {
    return this.prisma.staff.findUnique({
      where: { id },
      include: { role: true },
    });
  }

  async create(data: { email: string; password: string; name: string; roleId: string }) {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    return this.prisma.staff.create({
      data: {
        email: data.email.toLowerCase().trim(),
        password: hashedPassword,
        name: data.name.trim(),
        roleId: data.roleId,
      },
      include: { role: true },
    });
  }

  async findAll() {
    return this.prisma.staff.findMany({
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deactivate(id: string) {
    return this.prisma.staff.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
```

- [ ] **Step 5: Write staff controller**

```typescript
// src/staff/staff.controller.ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { StaffService } from './staff.service';
import { AccessGuard } from '../auth/guards/access.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RBAC } from '../auth/decorators/roles.decorator';
import { CreateStaffDto } from '../auth/dto/create-staff.dto';

@Controller('staff')
@UseGuards(AccessGuard, RolesGuard)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RBAC('staff', 'read')
  async list() {
    return this.staff.findAll();
  }

  @Post()
  @RBAC('staff', 'write')
  async create(@Body() body: CreateStaffDto) {
    return this.staff.create(body);
  }
}
```

- [ ] **Step 6: Write staff module**

```typescript
// src/staff/staff.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';

@Module({
  imports: [PrismaModule],
  providers: [StaffService],
  controllers: [StaffController],
  exports: [StaffService],
})
export class StaffModule {}
```

- [ ] **Step 7: Commit**

```bash
git add src/rbac/ src/staff/
git commit -m "feat: RBAC module and staff management"
```

---

### Task 6: Auth Service + Controller (The Core)

**Files:**
- Create: `src/auth/auth.service.ts`
- Create: `src/auth/auth.controller.ts`
- Create: `src/auth/auth.module.ts`

- [ ] **Step 1: Write auth service**

```typescript
// src/auth/auth.service.ts
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
      expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshTokenValue = this.jwt.sign(
      { sub: userId, type: userType, familyId } as object,
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
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
```

- [ ] **Step 2: Write auth controller**

```typescript
// src/auth/auth.controller.ts
import {
  Body, Controller, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { RefreshGuard } from './guards/refresh.guard';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { StaffLoginDto } from './dto/staff-login.dto';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ── Customer: Send OTP ──
  @Post('customer/send-otp')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async sendOtp(@Body() body: SendOtpDto) {
    return this.auth.sendOtp(body.phone);
  }

  // ── Customer: Verify OTP ──
  @Post('customer/verify-otp')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
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
```

- [ ] **Step 3: Write auth module**

```typescript
// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomersModule } from '../customers/customers.module';
import { StaffModule } from '../staff/staff.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessStrategy } from './strategies/access.strategy';
import { RefreshStrategy } from './strategies/refresh.strategy';
import { AccessGuard } from './guards/access.guard';
import { RefreshGuard } from './guards/refresh.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    PassportModule.register({ session: false }),
    JwtModule.register({}),
    PrismaModule,
    CustomersModule,
    StaffModule,
    RbacModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessStrategy,
    RefreshStrategy,
    AccessGuard,
    RefreshGuard,
    RolesGuard,
  ],
  exports: [AccessGuard, RolesGuard],
})
export class AuthModule {}
```

- [ ] **Step 4: Write the ApiError helper (needed by auth.service)**

```typescript
// src/prisma/api.error.ts — NO, put it in src/common/errors/api.error.ts
import { HttpException, HttpStatus } from '@nestjs/common';

class ApiError extends HttpException {
  constructor(statusCode: number, message: string, options?: { code?: string }) {
    super({ statusCode, message, code: options?.code }, statusCode);
  }

  static BadRequest(message: string, code?: string) {
    return new ApiError(HttpStatus.BAD_REQUEST, message, { code });
  }
  static Unauthorized(message = 'Unauthorized', code?: string) {
    return new ApiError(HttpStatus.UNAUTHORIZED, message, { code });
  }
  static Forbidden(message = 'Forbidden', code?: string) {
    return new ApiError(HttpStatus.FORBIDDEN, message, { code });
  }
  static NotFound(message = 'Not Found', code?: string) {
    return new ApiError(HttpStatus.NOT_FOUND, message, { code });
  }
  static TooManyRequests(message = 'Too Many Requests', code?: string) {
    return new ApiError(HttpStatus.TOO_MANY_REQUESTS, message, { code });
  }
}

export default ApiError;
```

Actually, let's keep the existing `src/libs/filters/http-exception.filter.ts` and move ApiError there. But wait, the user said restructure. Let me put it at `src/common/errors/api.error.ts`.

- [ ] **Step 4.5: Write ApiError**

```typescript
// src/common/errors/api.error.ts
import { HttpException, HttpStatus } from '@nestjs/common';

class ApiError extends HttpException {
  constructor(statusCode: number, message: string, options?: { code?: string }) {
    super({ statusCode, message, code: options?.code }, statusCode);
  }

  static BadRequest(message: string, code?: string) {
    return new ApiError(HttpStatus.BAD_REQUEST, message, { code });
  }
  static Unauthorized(message = 'Unauthorized', code?: string) {
    return new ApiError(HttpStatus.UNAUTHORIZED, message, { code });
  }
  static Forbidden(message = 'Forbidden', code?: string) {
    return new ApiError(HttpStatus.FORBIDDEN, message, { code });
  }
  static NotFound(message = 'Not Found', code?: string) {
    return new ApiError(HttpStatus.NOT_FOUND, message, { code });
  }
  static TooManyRequests(message = 'Too Many Requests', code?: string) {
    return new ApiError(HttpStatus.TOO_MANY_REQUESTS, message, { code });
  }
}

export default ApiError;
```

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.service.ts src/auth/auth.controller.ts src/auth/auth.module.ts src/common/errors/
git commit -m "feat: auth service with phone OTP, staff login, refresh token rotation"
```

---

### Task 7: Move Prisma + Middleware + Filters, Then App Module

**Files:**
- Move: `src/libs/prisma/` → `src/prisma/`
- Move: `src/libs/filters/http-exception.filter.ts` → `src/common/filters/`
- Move: `src/libs/middleware/logger.middleware.ts` → `src/common/middleware/`
- Create: `src/app.module.ts`
- Create: `src/main.ts`

- [ ] **Step 1: Move infrastructure files**

```bash
cd /home/time/Desktop/e-commerce/backend

# Move Prisma module
mkdir -p src/prisma/health
cp -r src/libs/prisma/* src/prisma/
# Fix import path in prisma health indicator (was relative, now needs updating)
# Actually just copy it over

# Move filters and middleware
mkdir -p src/common/filters src/common/middleware
cp src/libs/filters/http-exception.filter.ts src/common/filters/
cp src/libs/middleware/logger.middleware.ts src/common/middleware/
```

- [ ] **Step 2: Update Prisma health indicator import path**

```typescript
// src/prisma/health/prisma.health.ts
import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true);
    } catch {
      throw new HealthCheckError('Prisma check failed', this.getStatus(key, false));
    }
  }
}
```

- [ ] **Step 3: Update PrismaModule**

```typescript
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaHealthIndicator } from './health/prisma.health';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, PrismaHealthIndicator],
  exports: [PrismaService, PrismaHealthIndicator],
})
export class PrismaModule {}
```

- [ ] **Step 4: Create app.module.ts**

- [ ] **Step 1: Write app module**

```typescript
// src/app.module.ts
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ValidationPipe } from '@nestjs/common';
import { envSchema } from './config/env.schema';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { StaffModule } from './staff/staff.module';
import { RbacModule } from './rbac/rbac.module';
import { AccessGuard } from './auth/guards/access.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggerMiddleware } from './common/middleware/logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => {
        const parsed = envSchema.safeParse(env);
        if (!parsed.success) {
          throw new Error(`Environment validation failed: ${parsed.error.message}`);
        }
        return parsed.data;
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 60,
        },
      ],
    }),
    PrismaModule,
    AuthModule,
    CustomersModule,
    StaffModule,
    RbacModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }) },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
```

- [ ] **Step 2: Write main.ts**

```typescript
// src/main.ts
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const logger = WinstonModule.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
        ),
      }),
      new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });

  app.set('trust proxy', 1);
  app.use(cookieParser());

  const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.enableVersioning({ type: VersioningType.URI });

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('DailyMart API')
    .setDescription('DailyMart E-Commerce API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('v1/api', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // Health endpoint
  app.getHttpAdapter().get('/health', (_, res) => res.json({ status: 'ok' }));

  await app.listen(env.HTTP_PORT);
  logger.log(`DailyMart API running on port ${env.HTTP_PORT}`);
}

bootstrap();
```

- [ ] **Step 3: Move logger middleware to correct location**

```typescript
// src/common/middleware/logger.middleware.ts
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - start;
      this.logger.log(`${method} ${originalUrl} ${statusCode} ${duration}ms`);
    });

    next();
  }
}
```

- [ ] **Step 4: Fix prisma module import path**

Make sure the PrismaModule at `src/prisma/prisma.module.ts` is clean.

- [ ] **Step 6: Clean up leftover libs** (after moving prisma, filters, middleware above)

```bash
rm -rf src/libs
```

- [ ] **Step 6: Commit**

```bash
git add src/app.module.ts src/main.ts src/common/middleware/
git rm -rf src/libs
git commit -m "feat: app module with global guards, validation, helmet, CORS, rate limiting"
```

---

### Task 8: Write Tests

**Files:**
- Create: `src/auth/__tests__/auth.service.spec.ts`
- Create: `src/auth/__tests__/roles.guard.spec.ts`

- [ ] **Step 1: Write auth service test**

```typescript
// src/auth/__tests__/auth.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomersService } from '../../customers/customers.service';
import { OtpService } from '../../customers/otp.service';
import { StaffService } from '../../staff/staff.service';
import ApiError from '../../common/errors/api.error';

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
        revokedAt: new Date(), // Already revoked = reuse detected
      });

      await expect(service.refreshTokens(token)).rejects.toThrow(
        ApiError.Unauthorized('Token reuse detected, family revoked'),
      );

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
        .toThrow(ApiError.Unauthorized('Invalid email or password'));
    });

    it('should throw on deactivated account', async () => {
      mockStaff.findByEmail.mockResolvedValue({
        email: 'deactivated@test.com',
        isActive: false,
        password: '$2b$10$...',
      });

      await expect(service.staffLogin('deactivated@test.com', 'pass123')).rejects
        .toThrow(ApiError.Forbidden('Account is deactivated'));
    });
  });

  describe('verifyOtp', () => {
    it('should throw on invalid OTP', async () => {
      mockOtp.verifyOtp.mockResolvedValue(false);

      await expect(service.verifyOtp('+251911111111', '000000')).rejects
        .toThrow(ApiError.Unauthorized('Invalid or expired OTP'));
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
```

- [ ] **Step 2: Write RolesGuard test**

```typescript
// src/auth/__tests__/roles.guard.spec.ts
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../guards/roles.guard';
import { RbacService } from '../../rbac/rbac.service';
import { RBAC_KEY } from '../decorators/roles.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: any;
  let rbac: any;

  const mockContext = (user: any, rbacOptions: any) => ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  });

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    rbac = {
      checkPermission: jest.fn(),
    };
    guard = new RolesGuard(reflector as any, rbac as any);
  });

  it('should allow access when no RBAC options are set', async () => {
    reflector.getAllAndOverride.mockReturnValue(null);
    const result = await guard.canActivate(mockContext({ type: 'staff' }, null) as any);
    expect(result).toBe(true);
  });

  it('should deny access when user is not staff', async () => {
    reflector.getAllAndOverride.mockReturnValue({ resource: 'orders', action: 'read' });
    const result = await guard.canActivate(mockContext({ type: 'customer' }, {}) as any);
    expect(result).toBe(false);
  });

  it('should check permission via RbacService', async () => {
    reflector.getAllAndOverride.mockReturnValue({ resource: 'orders', action: 'read' });
    rbac.checkPermission.mockResolvedValue(true);

    const result = await guard.canActivate(
      mockContext({ type: 'staff', roleId: 'role-1' }, {}) as any,
    );

    expect(result).toBe(true);
    expect(rbac.checkPermission).toHaveBeenCalledWith('role-1', 'orders', 'read');
  });

  it('should deny when RbacService returns false', async () => {
    reflector.getAllAndOverride.mockReturnValue({ resource: 'orders', action: 'delete' });
    rbac.checkPermission.mockResolvedValue(false);

    const result = await guard.canActivate(
      mockContext({ type: 'staff', roleId: 'role-1' }, {}) as any,
    );

    expect(result).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/auth/__tests__/
git commit -m "test: auth service and roles guard unit tests"
```

---

### Task 9: Install Dependencies + Verify Build

**Files:**
- Modify: `package.json` (remove google-auth-library)

- [ ] **Step 1: Remove unused Google OAuth dependency**

```bash
cd /home/time/Desktop/e-commerce/backend
npm uninstall google-auth-library
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: Build succeeds with zero errors.

- [ ] **Step 3: Start the app and test endpoints**

```bash
# In one terminal
npm run start:dev

# In another terminal
# Test staff login
curl -X POST http://localhost:3001/auth/staff/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dailymart.com","password":"admin123"}' \
  -c cookies.txt

# Test customer send OTP
curl -X POST http://localhost:3001/auth/customer/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+251911111111"}'

# Test customer verify OTP (use debugCode from response)
curl -X POST http://localhost:3001/auth/customer/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+251911111111","code":"<debug-code>"}' \
  -c cookies.txt

# Test refresh
curl -X POST http://localhost:3001/auth/refresh -b cookies.txt

# Test logout
curl -X POST http://localhost:3001/auth/logout -b cookies.txt

# Test health
curl http://localhost:3001/health
```

- [ ] **Step 4: Final commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove google-auth-library, verify build"
```

---

## Test Summary

| Test | What It Covers |
|------|---------------|
| `auth.service.spec.ts` — refresh token reuse detection | When a revoked token is reused, the whole family is revoked and a `TOKEN_REUSED` error thrown |
| `auth.service.spec.ts` — valid refresh | Valid tokens are rotated, old one revoked, new pair issued |
| `auth.service.spec.ts` — staff login invalid email | Returns `INVALID_CREDENTIALS` without revealing which field is wrong |
| `auth.service.spec.ts` — staff deactivated account | Returns `ACCOUNT_INACTIVE` |
| `auth.service.spec.ts` — OTP invalid code | Returns `OTP_INVALID` |
| `auth.service.spec.ts` — OTP new customer | Creates customer on first login, returns `isNew: true` |
| `roles.guard.spec.ts` — no RBAC set | Allows access (public route) |
| `roles.guard.spec.ts` — non-staff user | Denies access |
| `roles.guard.spec.ts` — permission granted | Allows access after RbacService returns true |
| `roles.guard.spec.ts` — permission denied | Denies access when RbacService returns false |
