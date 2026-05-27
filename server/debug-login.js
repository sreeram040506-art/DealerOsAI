import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function debugLogin() {
  const email = 'sreeram@indraam.com';
  const password = '123456789';

  console.log(`Checking login for email: ${email}`);

  const user = await prisma.user.findFirst({
    where: { email },
    include: { dealership: true }
  });

  if (!user) {
    console.log("User not found!");
    return;
  }

  console.log("User found:");
  console.log(" - ID:", user.id);
  console.log(" - Role:", user.role);
  console.log(" - Dealership:", user.dealership?.name);
  console.log(" - Dealership Active:", user.dealership?.isActive);

  const validPassword = await bcrypt.compare(password, user.password);
  console.log(`Password matches hash?: ${validPassword}`);
  
  if (user.role !== 'SUPER_ADMIN' && user.dealership && !user.dealership.isActive) {
    console.log("Login would be blocked due to inactive dealership.");
  } else {
    console.log("Login would succeed.");
  }
}

debugLogin().finally(() => prisma.$disconnect());
