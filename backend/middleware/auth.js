import jwt from 'jsonwebtoken';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Access denied. No authentication token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'kemps_secret_key_123';
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Attach decoded user metadata to the request object
    // decoded: { adminId, username, role_id, isSuperAdmin }
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ ok: false, error: 'Invalid or expired authentication token.' });
  }
};

// Middleware that only allows superadmin users (role_id = null)
export const requireSuperAdmin = (req, res, next) => {
  if (!req.admin || !req.admin.isSuperAdmin) {
    return res.status(403).json({ ok: false, error: 'Access denied. Superadmin privileges required.' });
  }
  next();
};

export default authMiddleware;
