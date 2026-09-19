// ─────────────────────────────────────────────
// SSE Service — Manages real-time Server-Sent Events clients and broadcasting
// ─────────────────────────────────────────────

const clients = new Set();

/**
 * Handle new SSE client connection
 */
export function addClient(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Flush headers immediately if method exists
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Add to active clients set
  clients.add(res);

  // Write initial comment line to force proxies (Nginx/Cloudflare) to open stream instantly
  res.write(':ping\n\n');

  // Send initial connected event
  const initData = JSON.stringify({ message: 'Connected to real-time events', timestamp: new Date().toISOString() });
  res.write(`event: CONNECTED\ndata: ${initData}\n\n`);

  // Cleanup on connection close
  req.on('close', () => {
    clients.delete(res);
  });
}

/**
 * Broadcast an event to all connected clients
 * @param {string} eventType - Event name (e.g. 'INVENTORY_UPDATED', 'ORDER_CREATED')
 * @param {object} payload - Data payload to include with event
 */
export function broadcastEvent(eventType, payload = {}) {
  const dataString = JSON.stringify({
    ...payload,
    _timestamp: new Date().toISOString()
  });
  const message = `event: ${eventType}\ndata: ${dataString}\n\n`;

  for (const client of clients) {
    try {
      client.write(message);
    } catch (err) {
      console.error('Error writing to SSE client:', err);
      clients.delete(client);
    }
  }
}

/**
 * Get count of active connected SSE clients
 */
export function getClientCount() {
  return clients.size;
}

// Keep-alive heartbeat every 15 seconds
setInterval(() => {
  for (const client of clients) {
    try {
      client.write(':heartbeat\n\n');
    } catch {
      clients.delete(client);
    }
  }
}, 15000);
