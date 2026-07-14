import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
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

  const resources = ['orders', 'catalog', 'customers', 'staff', 'roles', 'reports', 'gift_cards', 'sliders', 'faq'];
  for (const name of resources) {
    await prisma.resource.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} management` },
    });
  }

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

  console.log(`✅ Seed complete: admin@dailymart.com (role: ${adminRole.name})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
