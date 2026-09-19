import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const SSEContext = createContext(null);

export function SSEProvider({ children }) {
  const [status, setStatus] = useState('OFFLINE'); // 'CONNECTED' | 'RECONNECTING' | 'OFFLINE'
  const [lastEvent, setLastEvent] = useState(null);
  const eventSourceRef = useRef(null);
  const listenersRef = useRef(new Map()); // Map<eventType, Set<callback>>
  const statusRef = useRef('OFFLINE'); // mirror of status for use inside closures

  // Keep statusRef in sync
  const updateStatus = useCallback((s) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  // Subscribe helper
  const subscribe = useCallback((eventType, callback) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType).add(callback);

    return () => {
      const callbacks = listenersRef.current.get(eventType);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          listenersRef.current.delete(eventType);
        }
      }
    };
  }, []);

  // Dispatch event to subscribers
  const dispatchSSEEvent = useCallback((eventType, data) => {
    setLastEvent({ type: eventType, data, timestamp: Date.now() });
    const callbacks = listenersRef.current.get(eventType);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in SSE listener for ${eventType}:`, err);
        }
      });
    }
  }, []);

  // Internal: create and attach a fresh EventSource
  const openConnection = useCallback(() => {
    const token = localStorage.getItem('kemps_auth_token');
    const isLoggedIn = localStorage.getItem('kemps_logged_in') === 'true';

    if (!isLoggedIn || !token) {
      updateStatus('OFFLINE');
      return;
    }

    // If already open, just confirm the status and do nothing
    if (eventSourceRef.current && eventSourceRef.current.readyState === 1 /* OPEN */) {
      updateStatus('CONNECTED');
      return;
    }

    // Close any stale connection
    if (eventSourceRef.current) {
      try { eventSourceRef.current.close(); } catch {}
      eventSourceRef.current = null;
    }

    const sseUrl = `/api/sse/events?token=${encodeURIComponent(token)}`;

    try {
      updateStatus('RECONNECTING');
      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      const markConnected = () => {
        if (statusRef.current !== 'CONNECTED') updateStatus('CONNECTED');
      };

      es.onopen = markConnected;

      // CONNECTED handshake event from backend
      es.addEventListener('CONNECTED', (e) => {
        markConnected();
        try { dispatchSSEEvent('CONNECTED', JSON.parse(e.data)); } catch {}
      });

      // All known application events
      const knownEvents = [
        'INVENTORY_UPDATED', 'STOCK_CORRECTED', 'PET_BOTTLE_UPDATED',
        'PRODUCTION_ADDED', 'TIMER_STATUS_CHANGED', 'ORDER_CREATED',
        'ORDER_STATUS_UPDATED', 'DISTRIBUTION_ORDER_UPDATED',
        'LOADING_SESSION_UPDATED', 'SUNDAY_LOADING_UPDATED', 'BILL_GENERATED',
        'PAYMENT_APPROVAL_REQUESTED', 'PAYMENT_APPROVED', 'SALES_RETURN_CREATED',
        'CAN_SUPPLY_LOGGED', 'CAN_DEPOSIT_UPDATED', 'MAINTENANCE_LOGGED',
        'MAINTENANCE_MASTER_UPDATED', 'IMP_WORK_UPDATED'
      ];

      knownEvents.forEach(eventType => {
        es.addEventListener(eventType, (e) => {
          markConnected();
          try {
            dispatchSSEEvent(eventType, JSON.parse(e.data));
          } catch (err) {
            console.error(`Failed to parse SSE payload for ${eventType}:`, err);
          }
        });
      });

      es.onerror = () => {
        if (es.readyState === 1 /* OPEN */) {
          markConnected();
        } else if (es.readyState === 2 /* CLOSED */) {
          updateStatus('RECONNECTING');
          // Browser will auto-reconnect EventSource; we just reflect the state
        }
      };
    } catch (err) {
      console.error('Failed to establish SSE connection:', err);
      updateStatus('OFFLINE');
    }
  }, [dispatchSSEEvent, updateStatus]);

  // Exposed reconnect for manual trigger (e.g. from the header button)
  const reconnect = useCallback(() => {
    // Force close existing to allow a fresh open
    if (eventSourceRef.current) {
      try { eventSourceRef.current.close(); } catch {}
      eventSourceRef.current = null;
    }
    openConnection();
  }, [openConnection]);

  // Mount once — open connection and listen to auth/network events
  useEffect(() => {
    openConnection();

    const handleAuthChange = () => {
      // On login: reconnect. On logout: close.
      const isLoggedIn = localStorage.getItem('kemps_logged_in') === 'true';
      if (!isLoggedIn) {
        if (eventSourceRef.current) {
          try { eventSourceRef.current.close(); } catch {}
          eventSourceRef.current = null;
        }
        updateStatus('OFFLINE');
      } else {
        reconnect();
      }
    };

    const handleOnline = () => openConnection();

    window.addEventListener('kemps_auth_change', handleAuthChange);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('kemps_auth_change', handleAuthChange);
      window.removeEventListener('online', handleOnline);
      if (eventSourceRef.current) {
        try { eventSourceRef.current.close(); } catch {}
        eventSourceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — run only on mount/unmount

  return (
    <SSEContext.Provider value={{ status, isConnected: status === 'CONNECTED', subscribe, lastEvent, reconnect }}>
      {children}
    </SSEContext.Provider>
  );
}

// Hook to access SSE Context
export function useSSEContext() {
  const ctx = useContext(SSEContext);
  if (!ctx) throw new Error('useSSEContext must be used inside <SSEProvider>');
  return ctx;
}

// Custom Hook to listen to a specific SSE event
export function useSSE(eventType, callback) {
  const { subscribe } = useSSEContext();
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!eventType) return;
    const handler = (data) => {
      if (savedCallback.current) savedCallback.current(data);
    };
    return subscribe(eventType, handler);
  }, [eventType, subscribe]);
}

export { useSSEContext as useSSEContextRef };
export default SSEContext;
