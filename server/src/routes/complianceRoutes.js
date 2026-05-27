import express from 'express';
import prisma from '../db/prisma.js';

const router = express.Router();

function normalizeVin(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function computeComplianceOutputs(record) {
  const warnings = [];
  const filingDeadlines = [];
  const penaltyRisks = [];
  const blockingActions = [];
  const today = new Date();
  const tempPlateDate = toDate(record.temporaryPlateExpiration);
  const dealDate = record.createdAt ? new Date(record.createdAt) : today;

  if (record.titleTransfer !== 'COMPLETED') {
    warnings.push('Title transfer is not completed.');
    filingDeadlines.push(`Title transfer due by ${addDays(dealDate, 30).toISOString().slice(0, 10)}`);
    penaltyRisks.push('Late title transfer can result in state penalties.');
    blockingActions.push('Block final sale closeout until title transfer is completed.');
  }

  if (record.registrationStatus !== 'ACTIVE') {
    warnings.push('Registration is not active.');
    filingDeadlines.push(`Registration update due by ${addDays(dealDate, 10).toISOString().slice(0, 10)}`);
    penaltyRisks.push('Driving with invalid registration can trigger fines.');
    blockingActions.push('Block vehicle delivery until registration is active.');
  }

  if (record.inspectionValidity !== 'VALID') {
    warnings.push('Inspection validity is missing or expired.');
    penaltyRisks.push('Expired inspection may lead to citation risk.');
  }

  if (record.insuranceVerification !== 'VERIFIED' || record.insuranceStatus === 'LAPSED') {
    warnings.push('Insurance verification failed or lapsed.');
    filingDeadlines.push(`Insurance verification due by ${addDays(today, 2).toISOString().slice(0, 10)}`);
    penaltyRisks.push('Uninsured operation risk and liability exposure.');
    blockingActions.push('Block release until insurance is verified.');
  }

  if (record.taxSubmission !== 'SUBMITTED') {
    warnings.push('Tax submission is pending.');
    filingDeadlines.push(`Tax submission due by ${addDays(dealDate, 20).toISOString().slice(0, 10)}`);
    penaltyRisks.push('Late tax submission may incur penalties/interest.');
  }

  if (tempPlateDate) {
    const msLeft = tempPlateDate.getTime() - today.getTime();
    const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) {
      warnings.push('Temporary plate has expired.');
      penaltyRisks.push('Expired temporary plate can result in enforcement action.');
      blockingActions.push('Block vehicle operation until plate issue is resolved.');
    } else if (daysLeft <= 7) {
      warnings.push(`Temporary plate expires in ${daysLeft} day(s).`);
      filingDeadlines.push(`Temporary plate renewal due by ${tempPlateDate.toISOString().slice(0, 10)}`);
    }
  }

  if (record.stateRegulations && typeof record.stateRegulations === 'object') {
    warnings.push('State regulation profile is applied.');
  }

  return { warnings, filingDeadlines, penaltyRisks, blockingActions };
}

async function writeAudit(req, { complianceId = null, actionType, oldValue = null, newValue = null }) {
  await prisma.complianceAuditLog.create({
    data: {
      complianceId,
      user_id: req.user?.id || 'SYSTEM',
      action_type: actionType,
      old_value: oldValue,
      new_value: newValue,
      device: req.headers['user-agent'] || 'unknown',
      IP: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''),
      dealershipId: req.dealershipId,
    },
  });
}

router.get('/', async (req, res, next) => {
  try {
    const vin = normalizeVin(req.query.vin || '');
    const rows = await prisma.complianceRecord.findMany({
      where: {
        dealershipId: req.dealershipId,
        ...(vin ? { vin } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const vin = normalizeVin(req.body.vin || '');
    if (!vin) return res.status(400).json({ message: 'VIN is required' });

    const payload = {
      vin,
      vehicleCategory: req.body.vehicleCategory || null,
      dealType: req.body.dealType || null,
      stateRegulations: req.body.stateRegulations || null,
      insuranceStatus: req.body.insuranceStatus || null,
      titleStatus: req.body.titleStatus || null,
      titleTransfer: req.body.titleTransfer || 'PENDING',
      registrationStatus: req.body.registrationStatus || 'PENDING',
      inspectionValidity: req.body.inspectionValidity || 'PENDING',
      insuranceVerification: req.body.insuranceVerification || 'PENDING',
      taxSubmission: req.body.taxSubmission || 'PENDING',
      temporaryPlateExpiration: toDate(req.body.temporaryPlateExpiration),
      dealershipId: req.dealershipId,
      complianceWarnings: [],
      filingDeadlines: [],
      penaltyRisks: [],
      blockingActions: [],
    };

    const created = await prisma.complianceRecord.create({ data: payload });
    const evaluated = computeComplianceOutputs(created);
    const updated = await prisma.complianceRecord.update({
      where: { id: created.id },
      data: {
        complianceWarnings: evaluated.warnings,
        filingDeadlines: evaluated.filingDeadlines,
        penaltyRisks: evaluated.penaltyRisks,
        blockingActions: evaluated.blockingActions,
      },
    });

    await writeAudit(req, {
      complianceId: updated.id,
      actionType: 'CREATE_COMPLIANCE_RECORD',
      oldValue: null,
      newValue: updated,
    });

    res.status(201).json(updated);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.complianceRecord.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId },
    });
    if (!existing) return res.status(404).json({ message: 'Compliance record not found' });

    const data = {
      vin: req.body.vin ? normalizeVin(req.body.vin) : existing.vin,
      vehicleCategory: req.body.vehicleCategory ?? existing.vehicleCategory,
      dealType: req.body.dealType ?? existing.dealType,
      stateRegulations: req.body.stateRegulations ?? existing.stateRegulations,
      insuranceStatus: req.body.insuranceStatus ?? existing.insuranceStatus,
      titleStatus: req.body.titleStatus ?? existing.titleStatus,
      titleTransfer: req.body.titleTransfer ?? existing.titleTransfer,
      registrationStatus: req.body.registrationStatus ?? existing.registrationStatus,
      inspectionValidity: req.body.inspectionValidity ?? existing.inspectionValidity,
      insuranceVerification: req.body.insuranceVerification ?? existing.insuranceVerification,
      taxSubmission: req.body.taxSubmission ?? existing.taxSubmission,
      temporaryPlateExpiration:
        req.body.temporaryPlateExpiration !== undefined
          ? toDate(req.body.temporaryPlateExpiration)
          : existing.temporaryPlateExpiration,
    };

    const nextRecord = { ...existing, ...data };
    const evaluated = computeComplianceOutputs(nextRecord);

    const updated = await prisma.complianceRecord.update({
      where: { id: req.params.id },
      data: {
        ...data,
        complianceWarnings: evaluated.warnings,
        filingDeadlines: evaluated.filingDeadlines,
        penaltyRisks: evaluated.penaltyRisks,
        blockingActions: evaluated.blockingActions,
      },
    });

    await writeAudit(req, {
      complianceId: updated.id,
      actionType: 'UPDATE_COMPLIANCE_RECORD',
      oldValue: existing,
      newValue: updated,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/evaluate', async (req, res, next) => {
  try {
    const existing = await prisma.complianceRecord.findFirst({
      where: { id: req.params.id, dealershipId: req.dealershipId },
    });
    if (!existing) return res.status(404).json({ message: 'Compliance record not found' });

    const evaluated = computeComplianceOutputs(existing);
    const updated = await prisma.complianceRecord.update({
      where: { id: req.params.id },
      data: {
        complianceWarnings: evaluated.warnings,
        filingDeadlines: evaluated.filingDeadlines,
        penaltyRisks: evaluated.penaltyRisks,
        blockingActions: evaluated.blockingActions,
      },
    });

    await writeAudit(req, {
      complianceId: updated.id,
      actionType: 'EVALUATE_RULE_ENGINE',
      oldValue: existing,
      newValue: updated,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/audit', async (req, res, next) => {
  try {
    const logs = await prisma.complianceAuditLog.findMany({
      where: { dealershipId: req.dealershipId, complianceId: req.params.id },
      orderBy: { timestamp: 'desc' },
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

export default router;
