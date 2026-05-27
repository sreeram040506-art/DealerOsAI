import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load placements from external JSON
const configPath = path.join(__dirname, '..', 'config', 'pdfFieldMap.json');
const fieldMap = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const white = rgb(1, 1, 1);
const red = rgb(1, 0, 0);
const basePageSize = {
  width: 612,
  height: 792,
};

const VIN_START_X = fieldMap.vinSettings?.startX || 114;
const VIN_START_Y = fieldMap.vinSettings?.startY || 613;
const VIN_STEP_X  = fieldMap.vinSettings?.stepX || 17.05;

/**
 * Main service to fill the Used Vehicle Record PDF.
 * @param {Buffer} templateBuffer - The PDF or Image template
 * @param {Object} vehicleInfo - Data to populate
 * @param {string} templateMimeType - Mime type of the template
 * @param {boolean} debug - If true, draws red boxes around field boundaries for calibration
 */
export async function fillUsedVehiclePdf(templateBuffer, vehicleInfo, templateMimeType = 'application/pdf', debug = false) {
  const pdfDoc = await loadTemplateDocument(templateBuffer, templateMimeType);
  const [page] = pdfDoc.getPages();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);
  const sourceName = vehicleInfo.usedVehicleSourceName || vehicleInfo.purchasedFrom || '';

  // ── Motor Vehicle/Part Identification & History ──
  drawField(page, fieldMap.year, String(vehicleInfo.year || ''), helvetica, debug);
  drawField(page, fieldMap.make, vehicleInfo.make || '', helvetica, debug);
  drawField(page, fieldMap.model, vehicleInfo.model || '', helvetica, debug);
  drawField(page, fieldMap.color, vehicleInfo.color || '', helvetica, debug);
  drawVin(page, vehicleInfo.vin || '', courier, debug);

  // ── Acquisition of Motor Vehicle/Part ──
  drawField(page, fieldMap.obtainedFrom, sourceName, courier, debug);
  drawField(page, fieldMap.transactionDate, formatUsedVehicleDate(vehicleInfo.purchaseDate), courier, debug);
  drawField(page, fieldMap.address, vehicleInfo.usedVehicleSourceAddress || vehicleInfo.sellerAddress || '', courier, debug);
  drawField(page, fieldMap.city, vehicleInfo.usedVehicleSourceCity || vehicleInfo.sellerCity || '', courier, debug);
  drawField(page, fieldMap.state, vehicleInfo.usedVehicleSourceState || vehicleInfo.sellerState || '', courier, debug);
  drawField(page, fieldMap.zipCode, vehicleInfo.usedVehicleSourceZipCode || vehicleInfo.sellerZip || '', courier, debug);
  drawField(
    page,
    fieldMap.odometerIn,
    vehicleInfo.mileage ? String(vehicleInfo.mileage) : '',
    courier,
    debug
  );
  drawField(page, fieldMap.sourceRepeater, sourceName, courier, debug);

  // ── Stock & Title No. ──
  const vin = vehicleInfo.vin || '';
  const stockNoValue = (vehicleInfo.stockNumber || (vin.length >= 6 ? vin.slice(-6) : vin)).toUpperCase();
  drawField(page, fieldMap.stockNo, stockNoValue, helvetica, debug);
  drawField(page, fieldMap.titleNo, vehicleInfo.titleNumber || '', helvetica, debug);

  // ── Disposition of Motor Vehicle/Part ──
  drawField(page, fieldMap.disposedTo, vehicleInfo.disposedTo || '', courier, debug);
  drawField(page, fieldMap.disposedAddress, vehicleInfo.disposedAddress || '', courier, debug);
  drawField(page, fieldMap.disposedCity, vehicleInfo.disposedCity || '', courier, debug);
  drawField(page, fieldMap.disposedState, vehicleInfo.disposedState || '', courier, debug);
  drawField(page, fieldMap.disposedZip, vehicleInfo.disposedZip || '', courier, debug);
  drawField(page, fieldMap.disposedOdometer, vehicleInfo.disposedOdometer ? String(vehicleInfo.disposedOdometer) : '', courier, debug);
  drawField(page, fieldMap.disposedDate, formatUsedVehicleDate(vehicleInfo.disposedDate), courier, debug);
  // drawField(page, fieldMap.disposedPrice, vehicleInfo.disposedPrice ? `$${vehicleInfo.disposedPrice.toLocaleString()}` : '', courier, debug);
  
  // ── DL & Signature ──
  drawField(page, fieldMap.disposedDl, vehicleInfo.disposedDlNumber || '', courier, debug);
  drawField(page, fieldMap.disposedDlState, vehicleInfo.disposedDlState || '', courier, debug);
  drawField(page, fieldMap.dealerSignature, "AUTHORIZED REPRESENTATIVE", courier, debug);

  return await pdfDoc.saveAsBase64({ useObjectStreams: false });
}

export function buildUsedVehiclePdfFileName(vehicleInfo) {
  const parts = [
    'used-vehicle-record',
    vehicleInfo.year || '',
    vehicleInfo.make || '',
    vehicleInfo.model || '',
    (vehicleInfo.vin || '').slice(-6),
  ]
    .map((part) => sanitizeFileNamePart(String(part || '')))
    .filter(Boolean);

  return `${parts.join('-') || 'used-vehicle-record'}.pdf`;
}

// ──────────────────────────────────────────────────────────────────────
// Drawing helpers
// ──────────────────────────────────────────────────────────────────────

function drawField(page, field, value, font, debug = false) {
  const bounds = scaleRect(page, field);
  const startFontSize = scaleFontSize(page, 10);
  const minFontSize = scaleFontSize(page, 6);
  
  let fontSize = startFontSize;
  let text = String(value || '').replace(/\s+/g, ' ').trim();

  // Auto-scale font size if text is too long
  if (text && font) {
    while (fontSize > minFontSize && font.widthOfTextAtSize(text, fontSize) > bounds.width) {
      fontSize -= 0.5;
    }
    // Final truncation if still too long at min size
    if (font.widthOfTextAtSize(text, fontSize) > bounds.width) {
      while (text.length > 1 && font.widthOfTextAtSize(text, fontSize) > bounds.width) {
        text = text.slice(0, -1);
      }
      text = text.trim();
    }
  }

  if (debug) {
    page.drawRectangle({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      borderColor: red,
      borderWidth: 1,
    });
  }

  if (!text) {
    return;
  }

  // Adjust Y offset slightly based on font size to keep it centered vertically
  const yOffset = (startFontSize - fontSize) / 2;

  page.drawText(text, {
    x: bounds.x,
    y: bounds.y + yOffset,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawVin(page, vin, font, debug = false) {
  const startX = scaleX(page, VIN_START_X);
  const startY = scaleY(page, VIN_START_Y);
  const stepX = scaleSize(page, VIN_STEP_X, 'x');
  const height = scaleSize(page, fieldMap.vinArea?.height || 16, 'y');
  const fontSize = scaleFontSize(page, 10);

  const sanitizedVin = (vin || '').toUpperCase()
    .replace(/^VIN[:\s-]*/, '') 
    .replace(/[^A-Z0-9]/g, '')
    .replace(/I/g, '1')
    .replace(/[OQ]/g, '0')
    .slice(0, 17);

  [...sanitizedVin].forEach((character, index) => {
    const charWidth = font.widthOfTextAtSize(character, fontSize);
    const boxCenterOffset = (stepX - charWidth) / 2;
    const charX = startX + index * stepX + Math.max(0, boxCenterOffset);

    if (debug) {
      page.drawRectangle({
        x: startX + index * stepX,
        y: startY,
        width: stepX,
        height: height,
        borderColor: red,
        borderWidth: 1,
      });
    }

    page.drawText(character, {
      x: charX,
      y: startY,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  });
}

// ──────────────────────────────────────────────────────────────────────
// Template loading
// ──────────────────────────────────────────────────────────────────────

async function loadTemplateDocument(templateBuffer, templateMimeType) {
  if (templateMimeType === 'application/pdf') {
    return PDFDocument.load(templateBuffer);
  }

  if (templateMimeType === 'image/jpeg' || templateMimeType === 'image/jpg') {
    return buildPdfFromImageTemplate(templateBuffer, 'jpeg');
  }

  if (templateMimeType === 'image/png') {
    return buildPdfFromImageTemplate(templateBuffer, 'png');
  }

  throw new Error('Unsupported used vehicle template format');
}

async function buildPdfFromImageTemplate(templateBuffer, imageType) {
  const pdfDoc = await PDFDocument.create();
  const embeddedImage =
    imageType === 'png'
      ? await pdfDoc.embedPng(templateBuffer)
      : await pdfDoc.embedJpg(templateBuffer);

  const page = pdfDoc.addPage([basePageSize.width, basePageSize.height]);
  page.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width: basePageSize.width,
    height: basePageSize.height,
  });

  return pdfDoc;
}

// ──────────────────────────────────────────────────────────────────────
// Formatting utilities
// ──────────────────────────────────────────────────────────────────────

function formatUsedVehicleDate(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = date
    .toLocaleString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    })
    .toUpperCase();
  const year = date.getUTCFullYear();

  return `${day}-${month}-${year}`;
}

function sanitizeFileNamePart(value) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

// ──────────────────────────────────────────────────────────────────────
// Coordinate scaling — maps base 612×792 coords to actual page size
// ──────────────────────────────────────────────────────────────────────

function scaleRect(page, field) {
  return {
    x: scaleX(page, field.x),
    y: scaleY(page, field.y),
    width: scaleSize(page, field.width, 'x'),
    height: scaleSize(page, field.height, 'y'),
  };
}

function scaleX(page, value) {
  return (value / basePageSize.width) * page.getWidth();
}

function scaleY(page, value) {
  return (value / basePageSize.height) * page.getHeight();
}

function scaleSize(page, value, axis) {
  const base = axis === 'x' ? basePageSize.width : basePageSize.height;
  const target = axis === 'x' ? page.getWidth() : page.getHeight();
  return (value / base) * target;
}

function scaleFontSize(page, value) {
  return value * Math.min(page.getWidth() / basePageSize.width, page.getHeight() / basePageSize.height);
}
