/* global self, URL */

self.addEventListener("push", (event) => {
  const fallback = {
    title: "GoldSprints",
    body: "You have a race update.",
    url: "/racer",
    notificationId: "goldsprints-update"
  };
  const payload = event.data ? event.data.json() : fallback;
  const notification = {
    ...fallback,
    ...payload
  };

  event.waitUntil(
    self.registration.showNotification(notification.title, {
      body: notification.body,
      data: {
        notificationId: notification.notificationId,
        url: notification.url || "/racer"
      },
      tag: notification.notificationId || "goldsprints-update",
      renotify: true
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
