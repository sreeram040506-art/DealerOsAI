import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function verify() {
  try {
    // 1. Check if user exists
    const user = await prisma.user.findFirst({ 
      where: { email: 'sreeram@indraam.com' },
      include: { dealership: true }
    });
    
    console.log('--- User Lookup ---');
    console.log('User found:', !!user);
    
    if (user) {
      console.log('User ID:', user.id);
      console.log('Email:', user.email);
      console.log('Role:', user.role);
      console.log('DealershipId:', user.dealershipId);
      console.log('Dealership:', user.dealership?.name);
      console.log('Dealership isActive:', user.dealership?.isActive);
      console.log('Password hash (first 15 chars):', user.password.substring(0, 15));
      
      // 2. Verify password
      const match = await bcrypt.compare('123456789', user.password);
      console.log('\n--- Password Verification ---');
      console.log('Password "123456789" matches:', match);
      
      // 3. Try a fresh hash and compare
      const freshHash = await bcrypt.hash('123456789', 10);
      console.log('Fresh hash:', freshHash.substring(0, 15));
      const freshMatch = await bcrypt.compare('123456789', freshHash);
      console.log('Fresh hash matches:', freshMatch);
    }
    
    // 4. List all users
    const allUsers = await prisma.user.findMany({
      select: { id: true, email: true, role: true, dealershipId: true }
    });
    console.log('\n--- All Users ---');
    allUsers.forEach(u => console.log(`  ${u.email} | ${u.role} | dealership: ${u.dealershipId}`));
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

verify();
