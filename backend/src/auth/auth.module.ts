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
import { RefreshGuard } from './guards/refresh.guard';

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
    RefreshGuard,
  ],
  exports: [RefreshGuard],
})
export class AuthModule {}
