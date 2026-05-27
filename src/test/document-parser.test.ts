import { describe, expect, it } from 'vitest';
import {
  cleanDispositionName,
  extractAcquisitionDetailsFromText,
  extractDispositionDetailsFromText,
  extractTitleFromText,
  extractTotalFromText,
  extractVehicleInfo,
  extractVinFromText,
  extractVehicleInfoFromText
} from '../../server/services/documentParser.js';

describe('document parser fallback extraction', () => {
  it('parses OCR-style used vehicle record fields without dropping numeric zip values', () => {
    const text = `
      Mfrs. Model Year: 2015 Make: Honda Model: Fit LX Color: Gray
      Vehicle Ident. No. 1 H G C M 8 2 6 3 3 A 0 0 4 3 5 2
      Title No. BP239263

      Acquisition of Motor Vehicle/Part
      Obtained From (Source): BROADWAY USED AUTO SALES INC Transaction Date: 26-JUN-2025
      Address (number and street): 100 BROADWAY
      City or Town: NORWOOD State: MA Zip Code: 02062 Odometer In: 20000

      Disposition of Motor Vehicle/Part
      Transferred To: BROADWAY USED AUTO SALES INC Transaction Date: 26-JUN-2025
      Address (number and street): 100 BROADWAY
      City or Town: NORWOOD State: MA Zip Code: 02062 Odometer Out: 20000
    `;

    const info = extractVehicleInfoFromText(text);

    expect(info.vin).toBe('1HGCM82633A004352');
    expect(info.year).toBe(2015);
    expect(info.make).toBe('Honda');
    expect(info.model).toBe('Fit LX');
    expect(info.color).toBe('Gray');
    expect(info.titleNumber).toBe('BP239263');
    expect(info.purchasedFrom).toBe('BROADWAY USED AUTO SALES INC');
    expect(info.usedVehicleSourceAddress).toBe('100 BROADWAY');
    expect(info.usedVehicleSourceCity).toBe('NORWOOD');
    expect(info.usedVehicleSourceState).toBe('MA');
    expect(info.usedVehicleSourceZipCode).toBe('02062');
    expect(info.mileage).toBe(20000);
    expect(info.disposedTo).toBe('BROADWAY USED AUTO SALES INC');
    expect(info.disposedAddress).toBe('100 BROADWAY');
    expect(info.disposedCity).toBe('NORWOOD');
    expect(info.disposedState).toBe('MA');
    expect(info.disposedZip).toBe('02062');
    expect(info.disposedOdometer).toBe(20000);
  });

  it('keeps state and zip when AI-style data sends zip as a number', () => {
    const text = `
      VIN: 1O4RJEAG0PC123456
      Year: 2023 Make: Jeep Model: Grand Cherokee Color: White
      Seller: Test Motors
      Address: 42 Market Street City: Boston State: MA Zip: 02118
      Buyer Name: Jane Customer Address: 9 Main Street City: Quincy State: MA Zip: 02169
      Odometer Reading: 18000 Sale Price: $28000
    `;

    const info = extractVehicleInfoFromText(text);

    expect(info.vin).toBe('104RJEAG0PC123456');
    expect(info.usedVehicleSourceZipCode).toBe('02118');
    expect(info.disposedZip).toBe('02169');
  });

  it('parses generated used vehicle record form fields for Mfrs. Model Year, Make, and Model', () => {
    const text = `
      Mfrs. Model Year 2014 Make Toyota Model Camry Color White
      Vehicle Ident. No. 1 H G C M 8 2 6 3 3 A 0 0 4 3 5 2
    `;

    const info = extractVehicleInfoFromText(text);

    expect(info.year).toBe(2014);
    expect(info.make).toBe('Toyota');
    expect(info.model).toBe('Camry');
    expect(info.color).toBe('White');
  });

  it('extracts buyer name and address from sale documents using Buyer: label', () => {
    const text = `
      Buyer: Broadway Used Auto Sales Inc
      Address: 100 Broadway
      City or Town: NORWOOD State: MA Zip Code: 02062
    `;

    const info = extractDispositionDetailsFromText(text);

    expect(info.disposedTo).toBe('Broadway Used Auto Sales Inc');
    expect(info.disposedAddress).toBe('100 Broadway');
    expect(info.disposedCity).toBe('NORWOOD');
    expect(info.disposedState).toBe('MA');
    expect(info.disposedZip).toBe('02062');
  });

  it('ignores boilerplate headers and legal sections that contain years', () => {
    const text = `
      2015 Any Legally Required Repairs Prior To Sale. Co Inc Buyer
      
      Actual Vehicle Information:
      Year: 2010 Make: Honda Model: Civic
      VIN: 1HGCM82633A004352
    `;

    const info = extractVehicleInfoFromText(text);

    // Should extract the explicitly labeled 2010, not the boilerplate 2015
    expect(info.year).toBe(2010);
    expect(info.make).toBe('Honda');
    expect(info.model).toBe('Civic');
  });

  it('extracts a VIN from OCR text with spaces and punctuation between characters', () => {
    const text = `
      Vehicle Ident. No. 1 H G C M 8 2 6 3 3 A 0 0 4 3 5 2
    `;

    expect(extractVinFromText(text)).toBe('1HGCM82633A004352');
  });

  it('prioritizes MA title VIN rows and repairs one-character OCR insertions', () => {
    expect(extractVinFromText(`
      Certificate of Title Number Vehicle/Vessel Identification Number
      BK182936 JTDBUA4EE6B9141775
      We do hereby sell or have sold and delivered the above described vehicle.
    `)).toBe('JTDBU4EE6B9141775');

    expect(extractVinFromText(`
      Certificate of Title Number Vehicle/Vessel Identification Number
      BK517792 S5FNYF4H61BB077174
    `)).toBe('5FNYF4H61BB077174');
  });

  it('parses acquisition total due and ignores sale price lines', () => {
    const text = `
      Motor Vehicle Purchase Contract
      Sale Price: $23,000
      Buyer Fee: $1,200
      Total Due: $24,200
    `;

    expect(extractTotalFromText(text, 'acquisition')).toBe(24200);
  });

  it('extracts disposition sale price and acquisition purchase total from raw text', () => {
    const text = `
      SALE PRICE: $12,500
      Purchase Price: $11,800
      Total Due: $11,800
    `;

    const info = extractVehicleInfoFromText(text);
    expect(info.disposedPrice).toBe(12500);
    expect(info.purchasePrice).toBe(11800);
  });

  it('treats disposition purpose as sale purpose for sales document fallback parsing', async () => {
    const text = `
      Bill of Sale
      VIN: JTDBT923X84012320
      Buyer: Jane Customer
      Address: 9 Main Street City: Quincy State: MA Zip: 02169
      Vehicle Sales Price: $7,000
    `;

    const info = await extractVehicleInfo(Buffer.from(text), 'text/plain', 'disposition');

    expect(info.disposedPrice).toBe(7000);
    expect(info.purchasePrice).toBeUndefined();
  });

  it('does not accept an obviously low acquisition total as a valid vehicle price', () => {
    expect(extractTotalFromText('Total Due: $11.00', 'acquisition')).toBeNull();
  });

  it('prefers auction facility details over Broadway buyer details for acquisitions', () => {
    const text = `
      ADESA Boston Bill of Sale
      Facility: ADESA Boston
      Address: 63 Western Avenue
      Framingham, MA 01702

      Buyer: Broadway Used Auto Sales Inc
      Address: 100 Broadway
      Norwood, MA 02062

      Seller: Bernardi Toyota-Scion
      VIN: 1HGCM82633A004352
      Total Due $5,785.00
    `;

    const info = extractAcquisitionDetailsFromText(text);

    expect(info.purchasedFrom).toBe('ADESA Boston');
    expect(info.usedVehicleSourceAddress).toBe('63 Western Avenue');
    expect(info.usedVehicleSourceCity).toBe('Framingham');
    expect(info.usedVehicleSourceState).toBe('MA');
    expect(info.usedVehicleSourceZipCode).toBe('01702');
  });

  it('extracts disposition buyer details from bill of sale text, not Broadway seller details', () => {
    const text = `
      Motor Vehicle Purchase Contract
      Dealer/Seller Name and Address: Broadway Used Auto Sales Inc
      100 Broadway
      Norwood, MA 02062

      Purchaser(s) Name(s) and Address(es): Jane Customer
      Address: 9 Main Street City: Quincy State: MA Zip: 02169
      Vehicle Sales Price: $12,500
    `;

    const info = extractDispositionDetailsFromText(text);

    expect(info.disposedTo).toBe('Jane Customer');
    expect(info.disposedAddress).toBe('9 Main Street');
    expect(info.disposedCity).toBe('Quincy');
    expect(info.disposedState).toBe('MA');
    expect(info.disposedZip).toBe('02169');
  });

  it('extracts CarMax auction acquisition details without treating boilerplate purchaser text as disposition', () => {
    const text = `
      Wholesale Bill of Sale
      CarMax ("Seller") agrees to sell and Purchaser agrees to buy the vehicle identified below.
      Seller: CarMax - Westborough
      170 Turnpike Rd
      Westborough, MA 01581
      Purchaser hereby acknowledges that Purchaser has read the terms.
    `;

    const acquisition = extractAcquisitionDetailsFromText(text);
    const disposition = extractDispositionDetailsFromText(text);

    expect(acquisition.purchasedFrom).toBe('CarMax - Westborough');
    expect(acquisition.usedVehicleSourceAddress).toBe('170 Turnpike Rd');
    expect(acquisition.usedVehicleSourceCity).toBe('Westborough');
    expect(acquisition.usedVehicleSourceState).toBe('MA');
    expect(acquisition.usedVehicleSourceZipCode).toBe('01581-2806');
    expect(disposition).toEqual({});
  });

  it('extracts CMAA facility details for acquisition', () => {
    const text = `
      CMAA BILL OF SALE AND TITLE WARRANTY
      Central Mass. Auto Auction
      12 Industrial Park East - Oxford, MA 01540
      Buyer Fee
      BROADWAY USED AUTO SALES INC
      100 BROADWAY
      NORWOOD, MA 02062
    `;

    const info = extractAcquisitionDetailsFromText(text);

    expect(info.purchasedFrom).toBe('Central Mass. Auto Auction');
    expect(info.usedVehicleSourceAddress).toBe('12 Industrial Park East');
    expect(info.usedVehicleSourceCity).toBe('Oxford');
    expect(info.usedVehicleSourceState).toBe('MA');
    expect(info.usedVehicleSourceZipCode).toBe('01540');
  });

  it("detects America's AA Boston as an acquisition source and parses the total price", () => {
    const text = `
      AMERICA'S AA BOSTON
      400 Charter Way
      NORTH BILLERICA, MA 01862
      2010 TOYOTA PRIUS II
      VIN: JTDKN3DU2A5220561
      Sale Price: $4,300.00
      Buyer's Fee: $465.00
      Total: $4,765.00
    `;

    const info = extractVehicleInfoFromText(text);
    expect(info.year).toBe(2010);
    expect(info.make).toBe('Toyota');
    expect(info.model).toBe('Prius II');

    const acquisition = extractAcquisitionDetailsFromText(text);
    expect(acquisition.purchasedFrom).toBe("America's AA Boston");
    expect(acquisition.usedVehicleSourceAddress).toBe('400 Charter Way');
    expect(acquisition.usedVehicleSourceCity).toBe('North Billerica');
    expect(acquisition.usedVehicleSourceState).toBe('MA');
    expect(acquisition.usedVehicleSourceZipCode).toBe('01862');
    expect(extractTotalFromText(text, 'acquisition')).toBe(4765);
  });

  it('prioritizes TOTAL price over Vehicle Sales Price in CMAA/CarMax acquisition documents', () => {
    const text = `
      CMAA BILL OF SALE
      Central Mass. Auto Auction
      Vehicle Sales Price: $8,500
      Buyer Fee: $250
      Total Due: $8,750
    `;

    expect(extractTotalFromText(text, 'acquisition')).toBe(8750);
  });

  it('ignores total payments lines and keeps the actual invoice total', () => {
    const text = `
      CHARGE DATE DESCRIPTION PRICE LINE TOTAL
      2013 Ford Fiesta $1,800.00 $1,800.00
      BUY FEE $265.00 $265.00
      SUB TOTAL $2,065.00
      TOTAL BEFORE PAYMENTS $2,065.00
      TOTAL PAYMENTS ($2,065.00)
      OUTSTANDING BALANCE $0.00
    `;

    expect(extractTotalFromText(text, 'acquisition')).toBe(2065);
  });

  it('prefers the largest footer amount when OCR injects an address number near the total row', () => {
    const text = `
      BROADWAY USED AUTO SALES INC 3,990.00
      100 BROADWAY TOTALS
      NORWOOD, MA 02062
    `;

    expect(extractTotalFromText(text, 'acquisition')).toBe(3990);
  });

  it('keeps the acquisition total above nearby fee lines and OCR street numbers', () => {
    const text = `
      BROADWAY USED AUTO SALES INC 3,990.00
      BUYER FEE $375.00
      100 BROADWAY TOTALS
      NORWOOD, MA 02062
    `;

    expect(extractTotalFromText(text, 'acquisition')).toBe(3990);
  });

  it('parses OCR-spaced total amounts instead of returning a fragment or zero', () => {
    const text = `
      SALE PRICE S 3,800.00
      BUYER FEE S 395.00
      TOTAL >S 4 195.00
    `;

    expect(extractTotalFromText(text, 'acquisition')).toBe(4195);
  });

  it('does not use legal boilerplate as vehicle make or model when no vehicle line exists', () => {
    const text = `
      2015 Any Legally Required Repairs Prior To Sale. Co Inc Buyer
      Purchaser acknowledges all terms and conditions.
    `;

    const info = extractVehicleInfoFromText(text);
    expect(info.make).toBeNull();
    expect(info.model).toBeNull();
    expect(info.year).toBeNull();
    expect(info.purchasePrice).toBeNull();
    expect(info.disposedPrice).toBeNull();
  });

  it('does not turn VIN, odometer, or date footer numbers into a price', () => {
    const text = `
      Vehicle Ident. No. 1 H G C M 8 2 6 3 3 A 0 0 4 3 5 2
      Odometer: 133,713 Miles
      Reprinted: 9/29/2025 12:03:40 PM
      Page 1 of 1
    `;

    expect(extractTotalFromText(text, 'acquisition')).toBeNull();
  });

  it('prefers the actual total over an address number on a contaminated total row', () => {
    const text = `
      BROADWAY USED AUTO SALES INC
      100 BROADWAY
      TOTAL $ 5,415.00
    `;

    expect(extractTotalFromText(text, 'acquisition')).toBe(5415);
  });

  it('uses the fallback CarMax Westborough address when OCR drops the street line', () => {
    const text = `
      Wholesale Bill of Sale
      Seller: CarMax - Westborough Purchaser's Name
      170 Turnpike Rd
      Westborough, MA 01581
    `;
    const info = extractAcquisitionDetailsFromText(text);

    expect(info.purchasedFrom).toBe('CarMax - Westborough');
    expect(info.usedVehicleSourceAddress).toBe('170 Turnpike Rd');
    expect(info.usedVehicleSourceCity).toBe('Westborough');
    expect(info.usedVehicleSourceState).toBe('MA');
    expect(info.usedVehicleSourceZipCode).toBe('01581-2806');
  });

  it('strips dealer-name noise and standalone trailing numbers from model names', () => {
    const text = `
      2016 Honda Odyssey 18 = ~~
      VIN: 5FNRL5H26GB066677
    `;

    const info = extractVehicleInfoFromText(text);
    expect(info.year).toBe(2016);
    expect(info.make).toBe('Honda');
    expect(info.model).toBe('Odyssey');
  });

  it('prefers the vehicle row over sale dates when extracting year make and model', () => {
    const text = `
      Date 8/29/2024
      Year Make Model
      2014 Toyota Camry LE
      Sale Date 8/29/2024
    `;

    const info = extractVehicleInfoFromText(text);
    expect(info.year).toBe(2014);
    expect(info.make).toBe('Toyota');
    expect(info.model).toBe('Camry LE');
  });

  it('cleans OCR noise from MA title vehicle rows', () => {
    const info = extractVehicleInfoFromText(`
      MakeManufactu Body Type Model Color
      201 i! Toyota ree Sedan Corolla Black
      Certificate of Title Number Vehicle/Vessel Identification Number
      BK182936 JTDBUA4EE6B9141775
    `);

    expect(info.year).toBe(2011);
    expect(info.make).toBe('Toyota');
    expect(info.model).toBe('Corolla');
  });

  it('ignores body type and color words when extracting model from OCR text', () => {
    const text = `
      2008 Honda Hatchback Fit Blue
      VIN: JHMGD386585066717
    `;

    const info = extractVehicleInfoFromText(text);
    expect(info.year).toBe(2008);
    expect(info.make).toBe('Honda');
    expect(info.model).toBe('Fit');
  });

  it('ignores date-like years when a vehicle year is present on a Manheim-style bill of sale', () => {
    const text = `
      Printed on: 15-May-2026
      Vehicle Information
      2011 Toyota Prius
      Mileage: 99515 Miles
    `;

    const info = extractVehicleInfoFromText(text);
    expect(info.year).toBe(2011);
    expect(info.make).toBe('Toyota');
    expect(info.model).toBe('Prius');
  });

  it('uses known auction details instead of seller details on ADESA documents', () => {
    const text = `
      Invoice to Buyer from ADESA Boston
      Buyer: Broadway Used Auto Sales Inc
      Seller: Bernardi Toyota-Scion
      Seller Address: 500 Worcester Road
      Framingham, MA 01702
      VIN 1HGCM82633A004352
    `;

    const info = extractAcquisitionDetailsFromText(text);

    expect(info.purchasedFrom).toBe('ADESA Boston');
    expect(info.usedVehicleSourceAddress).toBe('63 Western Avenue');
    expect(info.usedVehicleSourceCity).toBe('Framingham');
    expect(info.usedVehicleSourceState).toBe('MA');
    expect(info.usedVehicleSourceZipCode).toBe('01702');
  });

  it('extracts MA title transfer buyer details only when sale labels are present', () => {
    const text = `
      Print Name(s) of Purchaser(s) OL State DL Number
      Nathaniel Eli Kianovsky
      Address City State Zip Code
      127 Sydney Street Boston MA 02125
    `;

    const info = extractDispositionDetailsFromText(text);

    expect(info.disposedTo).toBe('Nathaniel Eli Kianovsky');
    expect(info.disposedAddress).toBe('127 Sydney Street');
    expect(info.disposedCity).toBe('Boston');
    expect(info.disposedState).toBe('MA');
    expect(info.disposedZip).toBe('02125');
  });

  it('cleans MA title transfer buyer license fragments and apartment addresses', () => {
    const text = `
      Print Name(s) of Purchaser(s) DL State DL Number
      Sara Saad MA SA2260770
      Address City State Zip Code
      55 David Ter Apt 08 Norwood MA 02062
    `;

    const info = extractDispositionDetailsFromText(text);

    expect(info.disposedTo).toBe('Sara Saad');
    expect(info.disposedAddress).toBe('55 David Ter Apt 08');
    expect(info.disposedCity).toBe('Norwood');
    expect(info.disposedState).toBe('MA');
    expect(info.disposedZip).toBe('02062');
  });

  it('removes customer, license, phone, and date numbers from disposition names', () => {
    expect(cleanDispositionName('Nathaniel Eli Kianovsky 1/31/26 AHTL # 12345')).toBe('Nathaniel Eli Kianovsky');
    expect(cleanDispositionName('Buyer Name: Jane Customer DL Number S12345678 Phone 617-555-1212')).toBe('Jane Customer');
  });

  it('extracts ADESA title state/number without returning title heading words', () => {
    expect(extractTitleFromText('TITLE INFORMATION\nTitle State/Number: MA/BN355731 Certificate of Origin: No')).toBe('BN355731');
    expect(extractTitleFromText('TITLE INFORMATION\nTitle State/Number: MABT686155 Certificate of Origin: No')).toBe('BT686155');
    expect(extractTitleFromText('TITLE INFORMATION\nVehicle Information')).toBeNull();
  });

  it('extracts CMAA title numbers from State / Title # / VIN layouts', () => {
    expect(extractTitleFromText('State Title # V.I.N. No.\nMA CK320305 2T1BU4EEXCC883365')).toBe('CK320305');
    expect(extractTitleFromText('State | Title # | V.I.N. No.\nCT | AA2606042 1FMCU9JXXGUB02440')).toBe('AA2606042');
  });

  it('rejects title announcement words and warranty headings', () => {
    expect(extractTitleFromText('CMAA BILL OF SALE AND TITLE WARRANTY')).toBeNull();
    expect(extractTitleFromText('Announcements: TITLE ATTACHED')).toBeNull();
    expect(extractTitleFromText('Announcements: TITLE ABSENT STRUCTURAL DAMAGE')).toBeNull();
  });

  it('cleans CarMax acquisition names and picks known Manheim acquisition details', () => {
    const carmax = extractAcquisitionDetailsFromText(`
      Seller: CarMax - Westborough Purchaser's Name
      170 Turnpike Rd
      Westborough, MA 01581
    `);
    expect(carmax.purchasedFrom).toBe('CarMax - Westborough');
    expect(carmax.usedVehicleSourceAddress).toBe('170 Turnpike Rd');

    const manheim = extractAcquisitionDetailsFromText(`
      Manheim New England
      123 Williams St
      North Dighton, MA 02764
    `);
    expect(manheim.purchasedFrom).toBe('Manheim New England');
    expect(manheim.usedVehicleSourceAddress).toBe('123 Williams St');
    expect(manheim.usedVehicleSourceCity).toBe('North Dighton');
    expect(manheim.usedVehicleSourceState).toBe('MA');
    expect(manheim.usedVehicleSourceZipCode).toBe('02764');
  });

  it('normalizes OCR-damaged Manheim New England source details', async () => {
    const text = `
      7) Manheim
      408 MANHEIM NEW Sale Date Vehicle Purchase Price
      123 WILLIAMS ST $ 000
      NORTH DIGHTON, MA 02764 US Adjustments
      Sale Type Seller Buyer
      KIA OF DARTMOUTH BROADWAY USED AUTO SALES INC
      VIN: 5XXGN4A75CG005331
      Total $2,600.00
    `;

    const acquisition = extractAcquisitionDetailsFromText(text);
    expect(acquisition.purchasedFrom).toBe('Manheim New England');
    expect(acquisition.usedVehicleSourceAddress).toBe('123 Williams St');
    expect(acquisition.usedVehicleSourceCity).toBe('North Dighton');
    expect(acquisition.usedVehicleSourceState).toBe('MA');
    expect(acquisition.usedVehicleSourceZipCode).toBe('02764');

    const info = await extractVehicleInfo(Buffer.from(text), 'text/plain', 'acquisition');
    expect(info.purchasedFrom).toBe('Manheim New England');
    expect(info.purchasePrice).toBe(2600);
    expect(info.usedVehicleSourceAddress).toBe('123 Williams St');
    expect(info.usedVehicleSourceCity).toBe('North Dighton');
    expect(info.usedVehicleSourceState).toBe('MA');
    expect(info.usedVehicleSourceZipCode).toBe('02764');
  });

  it('prefers Manheim vehicle information over seller names and normalizes OCR prices', () => {
    const text = `
      408 MANHEIM NEW Sale Date Vehicle Purchase Price
      ENGLAND 20-JAN-2026 09:55:13 Sale Price $ 5590000
      NOR Yr Wk Ln Rn Final Sale Price $ 500000
      pickup location In-Lane LEXUS OF WATERTOWN BROADWAY USED AUTO SALES INC
      Vehicle Information
      2011 Toyota Prius
      JTDKN3DU7B5298190
      Mileage: 99515 Miles
    `;

    const info = extractVehicleInfoFromText(text);

    expect(info.year).toBe(2011);
    expect(info.make).toBe('Toyota');
    expect(info.model).toBe('Prius');
    expect(extractTotalFromText(text, 'acquisition')).toBe(5590);
  });

  it('reads uncommaed sale totals without truncating to the first three digits', () => {
    const text = `
      COSTS AND DISCOUNTS
      Selling Price $7,100.00
      Doc Fee $399
      Tax $443.75
      Reg, Title&Insp $170.00
      Reg Runner $150.00
      Total 8262.75
    `;

    expect(extractTotalFromText(text, 'sale')).toBe(8262.75);
  });

  it('uses MA title selling price row when OCR breaks a total into a tiny amount', () => {
    const text = `
      Date of Sale Salesperson Selling Price
      8/13/2025 7999
      COSTS AND DISCOUNTS
      Selling Price. $26500
      Doc Fee $400
      Total S800
    `;

    expect(extractTotalFromText(text, 'sale')).toBe(7999);
  });
});
