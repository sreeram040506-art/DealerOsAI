import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

const PHASES = new Set(['PICKUP', 'RETURN']);
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

const leaseSelect = (lease, photos = []) => ({
  ...lease,
  photos: photos.map(({ dataBase64, ...meta }) => meta),
});

async function findLease(req) {
  return prisma.lease.findFirst({
    where: { id: req.params.id, dealershipId: req.dealershipId },
    include: { vehicle: { select: { id: true, year: true, make: true, model: true, vin: true, color: true, stockNumber: true } } },
  });
}

// GET /leases?status=ACTIVE|RETURNED
router.get('/', async (req, res, next) => {
  try {
    const where = { dealershipId: req.dealershipId };
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.vehicleId) where.vehicleId = String(req.query.vehicleId);
    const leases = await prisma.lease.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { vehicle: { select: { id: true, year: true, make: true, model: true, vin: true, color: true, stockNumber: true } } },
    });
    res.json(leases);
  } catch (err) { next(err); }
});

// POST /leases  { vehicleId, customerName, customerPhone?, startDate?, endDate?, notes? }
router.post('/', async (req, res, next) => {
  try {
    const { vehicleId, customerName, customerPhone, startDate, endDate, notes } = req.body || {};
    if (!vehicleId || !customerName?.trim()) {
      return res.status(400).json({ message: 'vehicleId and customerName are required' });
    }
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, dealershipId: req.dealershipId } });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
    if (vehicle.status === 'Sold') return res.status(400).json({ message: 'A sold vehicle cannot be leased' });

    const active = await prisma.lease.findFirst({ where: { vehicleId, dealershipId: req.dealershipId, status: 'ACTIVE' } });
    if (active) return res.status(409).json({ message: 'This vehicle already has an active lease' });

    const lease = await prisma.lease.create({
      data: {
        vehicleId,
        dealershipId: req.dealershipId,
        customerName: customerName.trim(),
        customerPhone: customerPhone?.trim() || null,
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        notes: notes?.trim() || null,
      },
    });
    res.status(201).json(lease);
  } catch (err) { next(err); }
});

// GET /leases/:id  -> lease + photo metadata (no image data)
router.get('/:id', async (req, res, next) => {
  try {
    const lease = await findLease(req);
    if (!lease) return res.status(404).json({ message: 'Lease not found' });
    const photos = await prisma.leasePhoto.findMany({
      where: { leaseId: lease.id, dealershipId: req.dealershipId },
      select: { id: true, leaseId: true, phase: true, angle: true, mimeType: true, createdAt: true },
    });
    res.json({ ...lease, photos });
  } catch (err) { next(err); }
});

// GET /leases/:id/photos?phase=PICKUP -> photos with image data (data URLs)
router.get('/:id/photos', async (req, res, next) => {
  try {
    const lease = await findLease(req);
    if (!lease) return res.status(404).json({ message: 'Lease not found' });
    const where = { leaseId: lease.id, dealershipId: req.dealershipId };
    if (req.query.phase) where.phase = String(req.query.phase);
    const photos = await prisma.leasePhoto.findMany({ where });
    res.json(photos.map((p) => ({
      id: p.id, phase: p.phase, angle: p.angle, createdAt: p.createdAt,
      dataUrl: `data:${p.mimeType};base64,${p.dataBase64}`,
    })));
  } catch (err) { next(err); }
});

// PUT /leases/:id/photos  { phase, angle, dataUrl } — upserts one angle's photo
router.put('/:id/photos', async (req, res, next) => {
  try {
    const { phase, angle, dataUrl } = req.body || {};
    if (!PHASES.has(phase)) return res.status(400).json({ message: 'phase must be PICKUP or RETURN' });
    if (!angle || !/^[a-z0-9_]{1,40}$/.test(angle)) return res.status(400).json({ message: 'Invalid angle' });
    const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl || '');
    if (!match) return res.status(400).json({ message: 'dataUrl must be a base64 image' });
    if (match[2].length * 0.75 > MAX_PHOTO_BYTES) return res.status(413).json({ message: 'Photo is larger than 4MB' });

    const lease = await findLease(req);
    if (!lease) return res.status(404).json({ message: 'Lease not found' });
    if (phase === 'PICKUP' && lease.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Pickup photos cannot change after the vehicle is returned' });
    }

    const photo = await prisma.leasePhoto.upsert({
      where: { leaseId_phase_angle: { leaseId: lease.id, phase, angle } },
      create: { leaseId: lease.id, dealershipId: req.dealershipId, phase, angle, mimeType: match[1], dataBase64: match[2] },
      update: { mimeType: match[1], dataBase64: match[2] },
      select: { id: true, phase: true, angle: true, createdAt: true },
    });
    res.json(photo);
  } catch (err) { next(err); }
});

// DELETE /leases/:id/photos/:photoId
router.delete('/:id/photos/:photoId', async (req, res, next) => {
  try {
    const lease = await findLease(req);
    if (!lease) return res.status(404).json({ message: 'Lease not found' });
    await prisma.leasePhoto.deleteMany({ where: { id: req.params.photoId, leaseId: lease.id, dealershipId: req.dealershipId } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /leases/:id/return — marks the vehicle as brought back
router.post('/:id/return', async (req, res, next) => {
  try {
    const lease = await findLease(req);
    if (!lease) return res.status(404).json({ message: 'Lease not found' });
    if (lease.status === 'RETURNED') return res.status(400).json({ message: 'Lease already returned' });
    const updated = await prisma.lease.update({
      where: { id: lease.id },
      data: { status: 'RETURNED', returnedAt: new Date() },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

export default router;
