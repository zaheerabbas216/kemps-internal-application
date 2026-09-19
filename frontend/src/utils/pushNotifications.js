/**
 * Convert VAPID Public Key from Base64 string to Uint8Array required by pushManager.subscribe
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function applicationServerKeysMatch(subscription, expectedKey) {
  const currentKey = subscription?.options?.applicationServerKey;
  if (!currentKey) return false;

  const currentBytes = new Uint8Array(currentKey);
  if (currentBytes.length !== expectedKey.length) return false;
  return currentBytes.every((value, index) => value === expectedKey[index]);
}

/**
 * Returns true if the current context is secure enough to use Push APIs.
 * Web Push requires HTTPS or localhost — plain HTTP LAN IPs are rejected by browsers.
 */
export function isPushSecureContext() {
  if (typeof window === 'undefined') return false;
  // window.isSecureContext is the canonical check (covers HTTPS + localhost)
  return window.isSecureContext === true;
}

/**
 * Check browser support and current permission status
 */
export async function getPushNotificationStatus() {
  // Must be a secure context (HTTPS or localhost)
  if (!isPushSecureContext()) {
    return {
      supported: false,
      secureContextRequired: true,
      permission: 'unavailable',
      subscribed: false
    };
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
    return { supported: false, secureContextRequired: false, permission: 'unsupported', subscribed: false };
  }

  const permission = Notification.permission;
  let subscribed = false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const existingSub = await registration.pushManager.getSubscription();
    subscribed = !!existingSub;
  } catch (err) {
    console.warn('Error checking push subscription:', err);
  }

  return { supported: true, secureContextRequired: false, permission, subscribed };
}

/**
 * Register Service Worker, prompt for permission, fetch VAPID key, and subscribe device.
 * Must be called from a user gesture (button click) for permission dialog to appear.
 */
export async function subscribeUserToPush(apiClient, username) {
  // Secure context guard
  if (!isPushSecureContext()) {
    throw new Error('HTTPS_REQUIRED');
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported by this browser.');
  }

  // 1. Request browser notification permission (requires user gesture)
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied.');
  }

  // 2. Ensure Service Worker is registered & ready
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // 3. Get VAPID public key from backend
  const res = await apiClient.get('/notifications/vapid-public-key');
  if (!res.data || !res.data.ok || !res.data.publicKey) {
    throw new Error('Failed to retrieve VAPID public key from server.');
  }

  const convertedVapidKey = urlBase64ToUint8Array(res.data.publicKey);

  // 4. Subscribe with PushManager
  let subscription = await registration.pushManager.getSubscription();

  // A subscription is bound to the VAPID public key used when it was created.
  // Re-create stale subscriptions when the backend key has changed; otherwise
  // the browser still reports "subscribed" while every push delivery fails.
  if (subscription && !applicationServerKeysMatch(subscription, convertedVapidKey)) {
    const staleEndpoint = subscription.endpoint;
    await subscription.unsubscribe();
    subscription = null;
    try {
      await apiClient.post('/notifications/unsubscribe', { endpoint: staleEndpoint });
    } catch (err) {
      console.warn('Failed to remove stale push endpoint from server:', err);
    }
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey
    });
  }

  // 5. Send subscription JSON payload to backend DB
  const subJson = subscription.toJSON();
  await apiClient.post('/notifications/subscribe', {
    subscription: subJson,
    username: username || 'User'
  });

  return subscription;
}

/**
 * Unsubscribe user device from push notifications
 */
export async function unsubscribeUserFromPush(apiClient) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    try {
      await apiClient.post('/notifications/unsubscribe', { endpoint });
    } catch (err) {
      console.warn('Failed to unregister endpoint from server:', err);
    }
  }

  return false;
}
