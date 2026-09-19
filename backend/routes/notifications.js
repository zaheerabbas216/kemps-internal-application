import express from 'express';
import pool from '../config/db.js';
import { getVapidPublicKey } from '../utils/pushService.js';

const router = express.Router();

// Auto-initialize push_subscriptions table
const initNotificationsTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(150) NULL,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_endpoint (endpoint(255))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (err) {
    console.error('Failed to initialize push_subscriptions table:', err);
  }
};
initNotificationsTable();

// GET /api/notifications/vapid-public-key
router.get('/vapid-public-key', (req, res) => {
  const publicKey = getVapidPublicKey();
  res.json({ ok: true, publicKey });
});

// POST /api/notifications/subscribe - Save push subscription
router.post('/subscribe', async (req, res) => {
  try {
    const { subscription, username } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ ok: false, error: 'Invalid subscription object' });
    }

    const { endpoint, keys } = subscription;
    if (!keys.p256dh || !keys.auth) {
      return res.status(400).json({ ok: false, error: 'Missing encryption keys (p256dh, auth)' });
    }

    const safeUsername = username || req.user?.username || req.user?.name || 'Anonymous User';

    // Insert or update on duplicate endpoint
    await pool.query(`
      INSERT INTO push_subscriptions (username, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        username = VALUES(username),
        p256dh = VALUES(p256dh),
        auth = VALUES(auth),
        updated_at = CURRENT_TIMESTAMP
    `, [safeUsername, endpoint, keys.p256dh, keys.auth]);

    res.status(201).json({ ok: true, message: 'Push subscription saved successfully' });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ ok: false, error: 'Failed to save push subscription' });
  }
});

// POST /api/notifications/unsubscribe - Remove subscription
router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ ok: false, error: 'Endpoint is required' });
    }

    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
    res.json({ ok: true, message: 'Push subscription removed successfully' });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({ ok: false, error: 'Failed to remove push subscription' });
  }
});

export default router;
