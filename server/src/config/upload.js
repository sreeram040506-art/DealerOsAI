import multer from 'multer';

// Every upload route in this app expects the same thing the frontend's DocumentUpload
// component declares it accepts: photos of documents, PDFs, and Word files. Two routes
// (sales, vehicles) previously constructed their own multer instance with no size limit at
// all, and none of the seven had a MIME filter — meaning an unbounded, arbitrary file could
// be accepted and held entirely in memory (storage is memoryStorage() everywhere here).
//
// One shared, bounded instance closes both gaps at once and keeps the seven routes that use
// it from drifting out of sync with each other again.
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function isAllowedMimeType(mimetype) {
  return mimetype.startsWith('image/') || ALLOWED_MIME_TYPES.has(mimetype);
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB, matching what most routes already enforced
  fileFilter: (req, file, cb) => {
    if (isAllowedMimeType(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Expected an image, PDF, or Word document.`));
    }
  },
});
