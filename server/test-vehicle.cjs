const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const http = require('http');

async function run() {
  const prisma = new PrismaClient();
  const user = await prisma.user.findFirst();
  if (!user) return console.log('No users found');

  const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET || 'your_super_secret_jwt_key_here_make_it_long', { expiresIn: '1d' });

  const vehiclePayload = JSON.stringify({
    vin: '12345678901234567',
    make: 'Toyota',
    model: 'Camry',
    year: 2020,
    mileage: 50000,
    color: 'Black',
    purchaseDate: '2023-10-01',
    purchasedFrom: 'Auction',
    purchasePrice: 15000,
    paymentMethod: 'Bank Transfer',
    transportCost: 0,
    repairCost: 0,
    inspectionCost: 0,
    registrationCost: 0,
    status: 'Available',
    totalPurchaseCost: 15000
  });

  const req = http.request({
    hostname: '127.0.0.1',
    port: 3001,
    path: '/api/vehicles',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'Content-Length': Buffer.byteLength(vehiclePayload)
    }
  }, (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => {
      console.log('STATUS:', res.statusCode);
      console.log('RESPONSE:', data);
      prisma.$disconnect();
    });
  });
  req.write(vehiclePayload);
  req.end();
}
run();
