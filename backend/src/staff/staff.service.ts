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
      select: {
        id: true, email: true, name: true, isActive: true, roleId: true,
        createdAt: true, updatedAt: true, role: true,
      },
    });
  }

  async findAll() {
    return this.prisma.staff.findMany({
      select: {
        id: true, email: true, name: true, isActive: true, roleId: true,
        createdAt: true, updatedAt: true, role: true,
      },
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
