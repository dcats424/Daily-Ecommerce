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
