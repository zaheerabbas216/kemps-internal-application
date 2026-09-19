const CACHE_NAME = "kemps-erp-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/favicon.svg"
];

// Install Event
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener("fetch", (e) => {
  // Let network-first handle the assets
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});

// Push Event - Native Browser Notification
self.addEventListener("push", (event) => {
  let data = {
    title: "📌 New IMP Work",
    body: "A new important task has been assigned.",
    url: "/imp-work"
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || "Check your IMP Work dashboard for details.",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: {
      url: data.url || "/imp-work"
    },
    vibrate: [200, 100, 200],
    tag: data.tag || "imp-work-notification",
    renotify: true,
    requireInteraction: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "📌 New IMP Work", options)
  );
});

// Notification Click Handler - Focus or Open Window
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/imp-work";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
