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
