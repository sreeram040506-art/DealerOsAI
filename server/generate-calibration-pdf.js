import fs from 'fs';
import { fillUsedVehiclePdf } from './services/usedVehiclePdfService.js';

async function generateCalibration() {
  console.log('📝 Generating Calibration PDF...');

  // Mock data to see how it fills
  const mockData = {
    vin: '1234567890ABCDEFG',
    make: 'MAKE_TEST',
    model: 'MODEL_TEST',
    year: 2024,
    color: 'COLOR_TEST',
    purchasedFrom: 'SOURCE_NAME_TEST',
    purchaseDate: new Date(),
    usedVehicleSourceAddress: 'ADDRESS_TEST_123_STREET',
    usedVehicleSourceCity: 'CITY_TEST',
    usedVehicleSourceState: 'MA',
    usedVehicleSourceZipCode: '01234',
    mileage: 88888,
    titleNumber: 'TITLE_TEST_123',
    disposedTo: 'BUYER_NAME_TEST',
    disposedAddress: 'BUYER_ADDRESS_456_AVE',
    disposedCity: 'BUYER_CITY',
    disposedState: 'MA',
    disposedZip: '56789',
    disposedDate: new Date(),
    disposedPrice: 15000,
    disposedOdometer: 99999,
    disposedDlNumber: 'DL123456789',
    disposedDlState: 'MA'
  };

  try {
    // Load the template
    const templatePath = './used-vechile-report.jpeg';
    if (!fs.existsSync(templatePath)) {
      console.error('❌ Template not found at:', templatePath);
      return;
    }
    const templateBuffer = fs.readFileSync(templatePath);

    // Generate with debug=true to see boxes
    const pdfBase64 = await fillUsedVehiclePdf(templateBuffer, mockData, 'image/jpeg', true);
    
    // Save to file
    const outputPath = './calibration-report.pdf';
    fs.writeFileSync(outputPath, Buffer.from(pdfBase64, 'base64'));

    console.log(`✅ Calibration PDF generated at: ${outputPath}`);
    console.log('🚀 Open this file to see where the data lands on the template.');
  } catch (err) {
    console.error('❌ Failed to generate calibration PDF:', err);
  }
}

generateCalibration();
