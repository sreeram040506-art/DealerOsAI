import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createSuperAdmin() {
  const admins = [
    { email: 'indra@indraam.com', name: 'Indra Admin' },
    { email: 'sreeram@indraam.com', name: 'Sreeram Admin' }
  ].map((admin) => ({ ...admin, email: admin.email.trim().toLowerCase() }));
  const password = '123456789';

  // Check if a dealership exists to link to, or create a "System" dealership
  let systemDealership = await prisma.dealership.findFirst({
    where: { name: 'System Administration' }
  });

  if (!systemDealership) {
    systemDealership = await prisma.dealership.create({
      data: {
        name: 'System Administration',
        slug: 'system-admin'
      }
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  for (const admin of admins) {
    const existing = await prisma.user.findFirst({ where: { email: admin.email } });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { 
          role: 'SUPER_ADMIN', 
          dealershipId: systemDealership.id,
          password: hashedPassword 
        }
      });
      console.log(`Updated existing user ${admin.email} to SUPER_ADMIN with new password`);
    } else {
      await prisma.user.create({
        data: {
          email: admin.email,
          password: hashedPassword,
          name: admin.name,
          role: 'SUPER_ADMIN',
          dealershipId: systemDealership.id
        }
      });
      console.log(`Created new SUPER_ADMIN user: ${admin.email}`);
    }
  }
}

createSuperAdmin()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
