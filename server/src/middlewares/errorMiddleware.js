export const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message;

  // Handle specific standard Express middleware overrides
  if (err.status) {
    statusCode = err.status;
  }

  // Map Prisma Unique Constraint Violations precisely to 409 Conflict
  if (err.code === 'P2002') {
    statusCode = 409;
    const targetField = err.meta?.target;
    if (Array.isArray(targetField) && targetField.includes('vin')) {
      message = 'A vehicle with this VIN already exists in the inventory.';
    } else if (typeof targetField === 'string' && targetField.includes('vin')) {
      message = 'A vehicle with this VIN already exists in the inventory.';
    } else {
      message = 'This record already exists in the system. Duplicate entries are not allowed.';
    }
  }

  // Map Prisma connection/timeout errors to 503 Service Unavailable
  if (err.code === 'P2010' || err.code === 'P1001' || err.code === 'P1002' ||
      (err.message && err.message.includes('Server selection timeout'))) {
    statusCode = 503;
    message = 'Database temporarily unavailable. Please try again in a moment.';
  }

  const isProduction = process.env.NODE_ENV === 'production';
  
  // Clean up any uploaded file in memory/disk if there was an error in handling
  if (req.file) {
    // Memory storage clears automatically on GC, but if we stored on disk we'd remove it here.
  }
  
  res.status(statusCode).json({
    message: message,
    stack: isProduction ? null : err.stack,
  });
};
