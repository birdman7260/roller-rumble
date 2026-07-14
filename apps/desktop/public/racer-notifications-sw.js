/* global self, URL */

// Take over as soon as a new version is fetched instead of waiting for every
// Roller Rumble tab to close. Without this, a device that already registered an
// older worker keeps running its push handler indefinitely — which is how stale
// "replace-in-place" logic leaves notifications stacking in the tray.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const fallback = {
    title: "Roller Rumble",
    body: "You have a race update.",
    url: "/racer",
    notificationId: "roller-rumble-update"
  };
  const payload = event.data ? event.data.json() : fallback;
  const notification = {
    ...fallback,
    ...payload
  };

  event.waitUntil(
    self.registration.showNotification(notification.title, {
      body: notification.body,
      icon: "/brand/notification-icon.png",
      badge: "/brand/notification-badge.png",
      data: {
        notificationId: notification.notificationId,
        url: notification.url || "/racer"
      },
      // Replace-in-place by channel: same tag updates the tray entry instead of
      // stacking a new one (ADR-0013). Silent/de-escalation updates pass
      // renotify:false and silent:true so they refresh without buzzing.
      tag: notification.tag || notification.notificationId || "roller-rumble-update",
      // A silent notification must not also renotify (Chrome rejects that combo),
      // so silence wins regardless of what the payload claims.
      renotify: notification.renotify !== false && notification.silent !== true,
      silent: notification.silent === true,
      requireInteraction: notification.requireInteraction === true
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/racer", self.location.origin);
  if (event.notification.data?.notificationId) {
    targetUrl.searchParams.set("notificationId", event.notification.data.notificationId);
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl.href);
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl.href);
    })
  );
});
