import { useEffect, useRef } from 'react';
import { useSSEContext } from '../context/SSEContext';

/**
 * Custom Hook to subscribe to a specific SSE event
 * @param {string} eventType - The event name to listen for (e.g. 'INVENTORY_UPDATED', 'ORDER_CREATED')
 * @param {Function} callback - Callback function executed when event is received
 */
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

/**
 * Custom Hook to get live SSE connection status & controls
 * @returns {{ status: string, isConnected: boolean, lastEvent: object, reconnect: Function }}
 */
export function useSSEStatus() {
  const { status, isConnected, lastEvent, reconnect } = useSSEContext();
  return { status, isConnected, lastEvent, reconnect };
}

/**
 * Custom Hook to automatically call a refetch function whenever an SSE event occurs
 * @param {string|string[]} eventTypes - Single event name or array of event names
 * @param {Function} refetchFn - Function to trigger on event
 */
export function useSSERefetch(eventTypes, refetchFn) {
  const { subscribe } = useSSEContext();
  const savedRefetch = useRef(refetchFn);

  useEffect(() => {
    savedRefetch.current = refetchFn;
  }, [refetchFn]);

  useEffect(() => {
    if (!eventTypes) return;
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];

    const unsubs = types.map(type =>
      subscribe(type, (data) => {
        if (savedRefetch.current) {
          savedRefetch.current(data);
        }
      })
    );

    return () => {
      unsubs.forEach(unsub => unsub && unsub());
    };
  }, [eventTypes, subscribe]);
}

export { useSSEContext } from '../context/SSEContext';
export default useSSE;
