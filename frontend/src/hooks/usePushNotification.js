import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import {
  getPushNotificationStatus,
  subscribeUserToPush,
  unsubscribeUserFromPush
} from '../utils/pushNotifications';

/**
 * Custom Hook for Web Push Notifications management
 * @param {Object} options - { autoPrompt: boolean } (default true: prompts permission on mount)
 * @returns {{ supported: boolean, permission: string, subscribed: boolean, loading: boolean, error: string, subscribe: Function, unsubscribe: Function, togglePush: Function }}
 */
export function usePushNotification(options = {}) {
  const { autoPrompt = true } = options;

  const [pushState, setPushState] = useState({
    supported: true,
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
    subscribed: false,
    loading: true,
    error: ''
  });

  const username = localStorage.getItem('kemps_name') || localStorage.getItem('kemps_username') || 'User';
  const isLoggedIn = localStorage.getItem('kemps_logged_in') === 'true';

  // Sync push status & auto-prompt on mount
  const syncPushStatus = useCallback(async () => {
    setPushState(prev => ({ ...prev, loading: true, error: '' }));
    try {
      const status = await getPushNotificationStatus();

      if (!status.supported) {
        setPushState({
          supported: false,
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
        permission: status.permission,
        subscribed: status.subscribed,
        loading: false
      }));

      // Auto-subscribe silently only when permission is already granted (no user gesture needed)
      // When permission is 'default', we must wait for an explicit user gesture (button click)
      // to call Notification.requestPermission() — browsers block it otherwise
      if (isLoggedIn && autoPrompt && status.permission === 'granted' && !status.subscribed) {
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

  // Subscribe explicitly
  const subscribe = async () => {
    setPushState(prev => ({ ...prev, loading: true, error: '' }));
    try {
      await subscribeUserToPush(api, username);
      setPushState(prev => ({
        ...prev,
        subscribed: true,
        permission: 'granted',
        loading: false
      }));
      return true;
    } catch (err) {
      console.error('[usePushNotification] Subscribe failed:', err);
      setPushState(prev => ({
        ...prev,
        loading: false,
        permission: Notification.permission,
        error: err.message || 'Failed to subscribe to push notifications.'
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
      return true;
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
