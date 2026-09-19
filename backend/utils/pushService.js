import webpush from 'web-push';
import dotenv from 'dotenv';
import pool from '../config/db.js';

dotenv.config();

// Fallback VAPID keypair if not set in process.env
const DEFAULT_VAPID = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIks693F3gT76yU70V_21sWq8N0r7Y12_Yk-e200uV36yV3-640aWq8N0r7Y12_Yk-e200uV36y',
  privateKey: process.env.VAPID_PRIVATE_KEY || '1A2b3C4d5E6f7G8h9I0j1K2l3M4n5O6p7Q8r9S0t1U2'
};

let vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  try {
    // Generate valid keys dynamically if missing from .env
    const generated = webpush.generateVAPIDKeys();
    vapidKeys.publicKey = generated.publicKey;
    vapidKeys.privateKey = generated.privateKey;
  } catch (err) {
    console.error('Failed to generate dynamic VAPID keys, using fallback:', err);
    vapidKeys = DEFAULT_VAPID;
  }
}

try {
  webpush.setVapidDetails(
    'mailto:admin@kempserp.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
  console.log('Web Push initialized with VAPID Public Key:', vapidKeys.publicKey.substring(0, 15) + '...');
} catch (err) {
  console.error('Failed to set VAPID details for web-push:', err);
}

export function getVapidPublicKey() {
  return vapidKeys.publicKey;
}

/**
 * Broadcast push notification payload to all active subscriptions
 * @param {Object} notificationPayload - { title, body, url, tag }
 */
export async function sendPushNotificationToAll(notificationPayload) {
  try {
    const [subscriptions] = await pool.query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions');
    if (subscriptions.length === 0) {
      console.log('[WebPush] No push subscriptions found in DB.');
      return { sent: 0, failed: 0 };
    }

    const payloadString = JSON.stringify(notificationPayload);
    let sentCount = 0;
    let failedCount = 0;
    const expiredIds = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };

        try {
          await webpush.sendNotification(pushSubscription, payloadString);
          sentCount++;
        } catch (error) {
          failedCount++;
          // 404 or 410 means subscription expired/unregistered
          if (error.statusCode === 404 || error.statusCode === 410) {
            expiredIds.push(sub.id);
          } else {
            console.error(`[WebPush] Error sending to endpoint ${sub.id}:`, error.message || error);
          }
        }
      })
    );

    // Prune expired subscriptions
    if (expiredIds.length > 0) {
      await pool.query('DELETE FROM push_subscriptions WHERE id IN (?)', [expiredIds]);
      console.log(`[WebPush] Pruned ${expiredIds.length} expired subscriptions.`);
    }

    console.log(`[WebPush] Push notification sent to ${sentCount} subscribers (${failedCount} failed).`);
    return { sent: sentCount, failed: failedCount };
  } catch (error) {
    console.error('[WebPush] Error in sendPushNotificationToAll:', error);
    return { sent: 0, failed: 0, error: error.message };
  }
}
