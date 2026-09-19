import express from 'express';
import jwt from 'jsonwebtoken';
import { addClient, getClientCount } from '../services/sseService.js';

const router = express.Router();

// SSE Streaming Endpoint: GET /api/sse/events
router.get('/events', (req, res) => {
  let token = req.query.token;
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Authentication token required for SSE stream.' });
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'kemps_secret_key_123';
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;

    addClient(req, res);
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired SSE token.' });
  }
});

// GET /api/sse/status - Status check returns count of connected clients
router.get('/status', (req, res) => {
  res.json({ ok: true, activeClients: getClientCount() });
});

export default router;
