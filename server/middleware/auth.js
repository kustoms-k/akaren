import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  try {
    const payload  = jwt.verify(header.slice(7), JWT_SECRET);
    req.user       = payload;
    req.companyId  = payload.companyId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// requireRole(...roles) — 403 if JWT role not in the allowed list
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authorization required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
}

// requireOwner — backward compat; agare is the new name for owner
export function requireOwner(req, res, next) {
  if (req.user?.role !== 'agare' && req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

// Convenience role name constants
export const AGARE        = 'agare';
export const TRAFIKLEDARE = 'trafikledare';
export const EKONOMI      = 'ekonomi';
export const FORARE       = 'forare';
export const REVISOR      = 'revisor';

// All non-driver roles (office staff)
export const OFFICE_ROLES = [AGARE, TRAFIKLEDARE, EKONOMI, REVISOR];
