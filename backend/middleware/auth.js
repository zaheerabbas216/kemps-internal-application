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
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ ok: false, error: 'Invalid or expired authentication token.' });
  }
};

export default authMiddleware;
