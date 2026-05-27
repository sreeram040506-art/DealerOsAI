export const injectTenant = (req, res, next) => {
  // dealershipId comes from the JWT (set by authMiddleware)
  if (!req.user?.dealershipId) {
    return res.status(403).json({ message: 'No dealership assigned to this user' });
  }
  req.dealershipId = req.user.dealershipId;
  next();
};
