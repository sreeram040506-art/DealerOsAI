/**
 * NHTSA VIN Decoder Service
 * Uses the free NHTSA vPIC API to decode Vehicle Identification Numbers
 * and the NHTSA Recalls API to check for active recalls.
 */

const NHTSA_DECODE_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';
const NHTSA_RECALLS_URL = 'https://api.nhtsa.gov/recalls/recallsByVehicle';

/**
 * Decode a VIN using the NHTSA vPIC API.
 * @param {string} vin - 17-character Vehicle Identification Number
 * @returns {Promise<Object>} Decoded vehicle information
 */
export async function decodeVin(vin) {
  const url = `${NHTSA_DECODE_URL}/${encodeURIComponent(vin)}?format=json`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const err = new Error(`NHTSA API returned status ${response.status}`);
    err.status = 502;
    throw err;
  }

  const data = await response.json();

  if (!data.Results || data.Results.length === 0) {
    const err = new Error('No results returned from NHTSA for this VIN.');
    err.status = 400;
    throw err;
  }

  const r = data.Results[0];

  // ErrorCode "0" means successful decode; anything else is a warning/error
  const errorCode = r.ErrorCode || '';
  const hasErrors = errorCode && !errorCode.split(',').every(c => c.trim() === '0');

  if (hasErrors && !r.Make && !r.Model) {
    const err = new Error(r.ErrorText || 'NHTSA could not decode this VIN. Please verify it is correct.');
    err.status = 400;
    throw err;
  }

  return {
    vin,
    make: r.Make || '',
    model: r.Model || '',
    year: r.ModelYear ? parseInt(r.ModelYear, 10) : null,
    bodyClass: r.BodyClass || '',
    vehicleType: r.VehicleType || '',
    plantCity: r.PlantCity || '',
    plantState: r.PlantState || '',
    plantCountry: r.PlantCountry || '',
    trim: r.Trim || '',
    driveType: r.DriveType || '',
    fuelType: r.FuelTypePrimary || '',
    engineModel: r.EngineModel || '',
    engineCylinders: r.EngineCylinders || '',
    displacementL: r.DisplacementL || '',
    transmissionStyle: r.TransmissionStyle || '',
    // Not a real color field from NHTSA — leave empty; front-end won't overwrite existing
    color: '',
    errorCode,
    errorText: r.ErrorText || '',
  };
}

/**
 * Fetch active recalls for a vehicle from the NHTSA Recalls API.
 * @param {string} make - Vehicle make (e.g. "Honda")
 * @param {string} model - Vehicle model (e.g. "Civic")
 * @param {number|string} year - Model year
 * @returns {Promise<Array>} List of recalls
 */
export async function fetchRecalls(make, model, year) {
  const params = new URLSearchParams({
    make: make,
    model: model,
    modelYear: String(year),
  });

  const url = `${NHTSA_RECALLS_URL}?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    console.warn(`[VIN Decoder] Recalls API returned status ${response.status}`);
    return [];
  }

  const data = await response.json();
  const results = data.results || [];

  return results.map(recall => ({
    nhtsaCampaignNumber: recall.NHTSACampaignNumber || '',
    component: recall.Component || '',
    summary: recall.Summary || '',
    consequence: recall.Consequence || '',
    remedy: recall.Remedy || '',
    manufacturer: recall.Manufacturer || '',
    reportReceivedDate: recall.ReportReceivedDate || '',
  }));
}
