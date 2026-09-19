import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import {
  getPushNotificationStatus,
  subscribeUserToPush,
  unsubscribeUserFromPush,
  isPushSecureContext
} from '../utils/pushNotifications';

const PUSH_STATE_EVENT = 'kemps-push-state-changed';
const PUSH_STATE_STORAGE_KEY = 'kemps_push_state_changed_at';

function announcePushStateChange() {
  window.dispatchEvent(new Event(PUSH_STATE_EVENT));
  localStorage.setItem(PUSH_STATE_STORAGE_KEY, String(Date.now()));
}

/**
 * Custom Hook for Web Push Notifications management
 * @param {Object} options - { autoPrompt: boolean } (default true)
 * @returns {{
 *   supported: boolean,
 *   secureContextRequired: boolean,
 *   permission: string,
 *   subscribed: boolean,
 *   loading: boolean,
 *   error: string,
 *   subscribe: Function,
 *   unsubscribe: Function,
 *   togglePush: Function,
 *   refreshStatus: Function
 * }}
 */
export function usePushNotification(options = {}) {
  const { autoPrompt = true } = options;

  const [pushState, setPushState] = useState({
    supported: false,
    secureContextRequired: !isPushSecureContext(),
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
    subscribed: false,
    loading: true,
    error: ''
  });

  const username = localStorage.getItem('kemps_name') || localStorage.getItem('kemps_username') || 'User';
  const isLoggedIn = localStorage.getItem('kemps_logged_in') === 'true';

  // Sync push status on mount
  const syncPushStatus = useCallback(async () => {
    setPushState(prev => ({ ...prev, loading: true, error: '' }));
    try {
      const status = await getPushNotificationStatus();

      // Not a secure context (plain HTTP on LAN) — degrade gracefully
      if (status.secureContextRequired) {
        setPushState({
          supported: false,
          secureContextRequired: true,
          permission: 'unavailable',
          subscribed: false,
          loading: false,
          error: ''
        });
        return;
      }

      if (!status.supported) {
        setPushState({
          supported: false,
          secureContextRequired: false,
          permission: 'unsupported',
          subscribed: false,
          loading: false,
          error: 'Push notifications are not supported in this browser.'
        });
        return;
      }

      setPushState(prev => ({
        ...prev,
        supported: true,
        secureContextRequired: false,
        permission: status.permission,
        subscribed: status.subscribed,
        loading: false
      }));

      // Reconcile with the server even when the browser already has a
      // subscription. This repairs a stale VAPID subscription and restores a
      // DB row that may have been removed or expired.
      if (isLoggedIn && autoPrompt && status.permission === 'granted') {
        try {
          await subscribeUserToPush(api, username);
          setPushState(prev => ({
            ...prev,
            subscribed: true,
            permission: Notification.permission,
            loading: false
          }));
        } catch (autoErr) {
          console.warn('[usePushNotification] Auto-subscribe failed:', autoErr.message);
          setPushState(prev => ({ ...prev, loading: false }));
        }
      }
    } catch (err) {
      console.error('[usePushNotification] Error checking push status:', err);
      setPushState(prev => ({ ...prev, loading: false, error: err.message }));
    }
  }, [isLoggedIn, autoPrompt, username]);

  useEffect(() => {
    syncPushStatus();
  }, [syncPushStatus]);

  // Keep the Layout hook, IMP Work hook, and other browser tabs in sync.
  useEffect(() => {
    const handleLocalChange = () => syncPushStatus();
    const handleStorageChange = (event) => {
      if (event.key === PUSH_STATE_STORAGE_KEY) syncPushStatus();
    };
    window.addEventListener(PUSH_STATE_EVENT, handleLocalChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener(PUSH_STATE_EVENT, handleLocalChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [syncPushStatus]);

  // Subscribe explicitly — must be called from a user gesture
  const subscribe = async () => {
    if (!isPushSecureContext()) {
      setPushState(prev => ({
        ...prev,
        error: 'HTTPS_REQUIRED',
        loading: false
      }));
      throw new Error('HTTPS_REQUIRED');
    }
    setPushState(prev => ({ ...prev, loading: true, error: '' }));
    try {
      await subscribeUserToPush(api, username);
      setPushState(prev => ({
        ...prev,
        subscribed: true,
        permission: 'granted',
        loading: false
      }));
      announcePushStateChange();
      return true;
    } catch (err) {
      const isHttpsErr = err.message === 'HTTPS_REQUIRED';
      setPushState(prev => ({
        ...prev,
        loading: false,
        permission: typeof Notification !== 'undefined' ? Notification.permission : prev.permission,
        error: isHttpsErr ? 'HTTPS_REQUIRED' : (err.message || 'Failed to subscribe to push notifications.')
      }));
      throw err;
    }
  };

  // Unsubscribe explicitly
  const unsubscribe = async () => {
    setPushState(prev => ({ ...prev, loading: true, error: '' }));
    try {
      await unsubscribeUserFromPush(api);
      setPushState(prev => ({
        ...prev,
        subscribed: false,
        loading: false
      }));
      announcePushStateChange();
      return false;
    } catch (err) {
      console.error('[usePushNotification] Unsubscribe failed:', err);
      setPushState(prev => ({ ...prev, loading: false, error: err.message }));
      throw err;
    }
  };

  // Toggle Push
  const togglePush = async () => {
    if (pushState.subscribed) {
      return await unsubscribe();
    } else {
      return await subscribe();
    }
  };

  return {
    supported: pushState.supported,
    secureContextRequired: pushState.secureContextRequired,
    permission: pushState.permission,
    subscribed: pushState.subscribed,
    loading: pushState.loading,
    error: pushState.error,
    subscribe,
    unsubscribe,
    togglePush,
    refreshStatus: syncPushStatus
  };
}

export default usePushNotification;
