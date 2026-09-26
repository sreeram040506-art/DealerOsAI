import prisma from '../db/prisma.js';

// A signed token only proves who the user *was* when they logged in. Suspending a dealership,
// deleting a user, or changing their role must take effect well before the 24h token expires,
// so every request re-reads the account. The short cache keeps that to one query per user per
// window; anything that changes an account calls invalidateAccountCache() to apply it at once.
const ACCOUNT_CACHE_TTL_MS = 30 * 1000;
const accountCache = new Map();

export function invalidateAccountCache() {
  accountCache.clear();
}

async function loadAccount(userId) {
  const cached = accountCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.account;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, dealershipId: true, dealership: { select: { isActive: true } } },
  });

  const account = user
    ? { role: user.role, dealershipId: user.dealershipId, dealershipActive: user.dealership?.isActive !== false }
    : null;
  accountCache.set(userId, { account, expires: Date.now() + ACCOUNT_CACHE_TTL_MS });
  return account;
}

/**
 * Confirms the token's user still exists and isn't suspended, and replaces the role and
 * dealership from the token with the current values from the database.
 */
export const requireActiveAccount = async (req, res, next) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const account = await loadAccount(req.user.id);
    if (!account) {
      return res.status(401).json({ message: 'Account no longer exists' });
    }
    if (account.role !== 'SUPER_ADMIN' && !account.dealershipActive) {
      return res.status(403).json({ message: 'Account suspended' });
    }

    req.user.role = account.role;
    req.user.dealershipId = account.dealershipId;
    next();
  } catch (err) {
    next(err);
  }
};

export const injectTenant = (req, res, next) => {
  requireActiveAccount(req, res, (err) => {
    if (err) return next(err);
    if (!req.user.dealershipId) {
      return res.status(403).json({ message: 'No dealership assigned to this user' });
    }
    req.dealershipId = req.user.dealershipId;
    next();
  });
};
