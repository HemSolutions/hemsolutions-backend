const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function run() {
  const users = [
    {
      email: 'demo.customer@hemsolutions.se',
      firstName: 'Demo',
      lastName: 'Customer',
      phone: '0700000001',
      role: 'CUSTOMER',
      password: 'DemoCustomer123!',
    },
    {
      email: 'demo.employee@hemsolutions.se',
      firstName: 'Demo',
      lastName: 'Employee',
      phone: '0700000002',
      role: 'WORKER',
      password: 'DemoEmployee123!',
    },
    {
      email: 'demo.admin@hemsolutions.se',
      firstName: 'Demo',
      lastName: 'Admin',
      phone: '0700000003',
      role: 'ADMIN',
      password: 'DemoAdmin123!',
    },
  ];

  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 10);
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        isActive: true,
        password: hash,
      },
      create: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        isActive: true,
        password: hash,
      },
    });
  }

  console.log('DEMO_USERS_READY');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
