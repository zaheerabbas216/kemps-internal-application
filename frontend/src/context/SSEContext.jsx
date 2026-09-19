import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { getApiBaseUrl } from '../api/axios';

const SSEContext = createContext(null);

export function SSEProvider({ children }) {
  const [status, setStatus] = useState('OFFLINE'); // 'CONNECTED' | 'RECONNECTING' | 'OFFLINE'
  const [lastEvent, setLastEvent] = useState(null);
  const eventSourceRef = useRef(null);
  const listenersRef = useRef(new Map()); // Map<eventType, Set<callback>>
  const reconnectTimeoutRef = useRef(null);

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

  // Connect to SSE Endpoint
  const connect = useCallback(() => {
    const token = localStorage.getItem('kemps_auth_token');
    const isLoggedIn = localStorage.getItem('kemps_logged_in') === 'true';

    if (!isLoggedIn || !token) {
      setStatus('OFFLINE');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    let apiBase = getApiBaseUrl().replace(/\/+$/, '');
    if (apiBase.startsWith('/')) {
      apiBase = `${window.location.origin}${apiBase}`;
    }
    const sseUrl = `${apiBase}/sse/events?token=${encodeURIComponent(token)}`;

    try {
      setStatus('RECONNECTING');
      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        setStatus('CONNECTED');
      };

      // Built-in SSE message handler
      es.onmessage = (e) => {
        setStatus('CONNECTED');
      };

      // Custom event listener for CONNECTED event
      es.addEventListener('CONNECTED', (e) => {
        setStatus('CONNECTED');
        try {
          const data = JSON.parse(e.data);
          dispatchSSEEvent('CONNECTED', data);
        } catch {}
      });

      // Wildcard listener dispatching custom events
      const knownEvents = [
        'INVENTORY_UPDATED',
        'STOCK_CORRECTED',
        'PET_BOTTLE_UPDATED',
        'PRODUCTION_ADDED',
        'TIMER_STATUS_CHANGED',
        'ORDER_CREATED',
        'ORDER_STATUS_UPDATED',
        'DISTRIBUTION_ORDER_UPDATED',
        'LOADING_SESSION_UPDATED',
        'SUNDAY_LOADING_UPDATED',
        'BILL_GENERATED',
        'PAYMENT_APPROVAL_REQUESTED',
        'PAYMENT_APPROVED',
        'SALES_RETURN_CREATED',
        'CAN_SUPPLY_LOGGED',
        'CAN_DEPOSIT_UPDATED',
        'MAINTENANCE_LOGGED',
        'MAINTENANCE_MASTER_UPDATED'
      ];

      knownEvents.forEach(eventType => {
        es.addEventListener(eventType, (e) => {
          setStatus('CONNECTED');
          try {
            const data = JSON.parse(e.data);
            dispatchSSEEvent(eventType, data);
          } catch (err) {
            console.error(`Failed to parse SSE payload for ${eventType}:`, err);
          }
        });
      });

      es.onerror = () => {
        setStatus('RECONNECTING');
        es.close();
        eventSourceRef.current = null;

        // Auto reconnect after 4 seconds if user is still logged in
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 4000);
      };
    } catch (err) {
      console.error('Failed to establish EventSource connection:', err);
      setStatus('OFFLINE');
    }
  }, [dispatchSSEEvent]);

  // Connect on mount & token changes
  useEffect(() => {
    connect();

    // Listen for storage changes (e.g. login/logout)
    const handleStorage = () => connect();
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  return (
    <SSEContext.Provider value={{ status, isConnected: status === 'CONNECTED', subscribe, lastEvent, reconnect: connect }}>
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
      if (savedCallback.current) {
        savedCallback.current(data);
      }
    };
    return subscribe(eventType, handler);
  }, [eventType, subscribe]);
}

export default SSEContext;
