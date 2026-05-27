import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      dealership: {
        select: { name: true }
      }
    }
  });
  console.log('--- Platform User List ---');
  console.table(users.map(u => ({
    ID: u.id,
    Name: u.name,
    Email: u.email,
    Role: u.role,
    Dealership: u.dealership?.name || 'N/A'
  })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
