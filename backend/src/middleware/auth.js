export function requireAuth(req, res, next) {
  if (req.session?.userId) {
    req.userId = req.session.userId;
    return next();
  }
  return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } });
}

export function attachUser(req, _res, next) {
  if (req.session?.userId) req.userId = req.session.userId;
  next();
}
