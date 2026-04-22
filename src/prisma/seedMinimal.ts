import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../utils/password';

const prisma = new PrismaClient();

async function seedMinimal(): Promise<void> {
  const adminPassword = await hashPassword('admin123456');

  await prisma.user.upsert({
    where: { email: 'admin@hemsolutions.se' },
    update: {},
    create: {
      email: 'admin@hemsolutions.se',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      phone: '+46701234567',
      role: 'SUPER_ADMIN',
      isVerified: true,
    },
  });

  await prisma.service.upsert({
    where: { slug: 'standard-cleaning' },
    update: {},
    create: {
      name: 'Standard Cleaning',
      slug: 'standard-cleaning',
      description: 'Core home cleaning service for regular maintenance.',
      shortDesc: 'Essential recurring cleaning',
      price: 450,
      priceType: 'FIXED',
      duration: 120,
      category: 'RESIDENTIAL',
      isActive: true,
      isPopular: true,
      sortOrder: 1,
      features: ['Dusting', 'Vacuuming', 'Mopping'],
    },
  });
}

seedMinimal()
  .then(() => {
    // Keep this script quiet and deterministic for deployment use.
    process.stdout.write('Minimal seed completed\n');
  })
  .catch((error) => {
    process.stderr.write(`Minimal seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
