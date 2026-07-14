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
