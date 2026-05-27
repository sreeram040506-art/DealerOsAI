import { extractVehicleInfo } from '../services/documentParser.js';

async function run() {
  try {
    console.log("Running end-to-end extraction test using strictly forced OpenAI...");
    const dummyBuffer = Buffer.from("VIN: 1FADP3F25DL227699, Make: Ford, Model: Fusion, Year: 2013, Price: $12500");
    const result = await extractVehicleInfo(dummyBuffer, 'text/plain', 'acquisition');
    console.log("SUCCESS! Extraction result:", result);
  } catch (err) {
    console.error("FAILED with error:", err);
  }
}

run();
