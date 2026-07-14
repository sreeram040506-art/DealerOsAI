import bcrypt from 'bcryptjs';
import prisma from '../db/prisma.js';

/**
 * Ensures SUPER_ADMIN users exist on every server boot.
 * Runs once at startup — idempotent (safe to call repeatedly).
 */
export async function ensureSuperAdmin() {
  const admins = [
    { email: 'indra@indraam.com', name: 'Indra Admin' },
    { email: 'sreeram@indraam.com', name: 'Sreeram Admin' },
  ];
  const password = process.env.SUPER_ADMIN_PASSWORD || '123456789';

  try {
    // Ensure a system dealership exists (required by schema)
    let systemDealership = await prisma.dealership.findFirst({
      where: { slug: 'system-admin' },
    });

    if (!systemDealership) {
      systemDealership = await prisma.dealership.create({
        data: {
          name: 'System Administration',
          slug: 'system-admin',
          isActive: true,
        },
      });
      console.log('[Seed] Created "System Administration" dealership');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    for (const admin of admins) {
      const normalizedEmail = admin.email.trim().toLowerCase();
      const existing = await prisma.user.findFirst({
        where: { email: normalizedEmail },
      });

      if (existing) {
        // Only update if role is wrong or dealership link is broken
        if (existing.role !== 'SUPER_ADMIN' || existing.dealershipId !== systemDealership.id) {
          await prisma.user.update({
            where: { id: existing.id },
            data: {
              role: 'SUPER_ADMIN',
              dealershipId: systemDealership.id,
              password: hashedPassword,
            },
          });
          console.log(`[Seed] Fixed SUPER_ADMIN: ${normalizedEmail}`);
        } else {
          console.log(`[Seed] SUPER_ADMIN OK: ${normalizedEmail}`);
        }
      } else {
        await prisma.user.create({
          data: {
            email: normalizedEmail,
            password: hashedPassword,
            name: admin.name,
            role: 'SUPER_ADMIN',
            dealershipId: systemDealership.id,
          },
        });
        console.log(`[Seed] Created SUPER_ADMIN: ${normalizedEmail}`);
      }
    }
  } catch (err) {
    console.error('[Seed] ensureSuperAdmin failed:', err.message);
  }
}
