import prisma from '../db/prisma.js';

export const injectTenant = async (req, res, next) => {
  // dealershipId usually comes from the JWT, but older sessions may not have it.
  if (req.user?.dealershipId) {
    req.dealershipId = req.user.dealershipId;
    return next();
  }

  if (!req.user?.id) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { dealershipId: true },
    });

    if (!user?.dealershipId) {
      return res.status(403).json({ message: 'No dealership assigned to this user' });
    }

    req.user.dealershipId = user.dealershipId;
    req.dealershipId = user.dealershipId;
    next();
  } catch (err) {
    next(err);
  }
};
