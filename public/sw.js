self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let payload = {}
  try { payload = event.data ? event.data.json() : {} } catch { payload = { body: event.data?.text() || "" } }
  const title = payload.title || "우리 가족 단어장"
  const options = {
    body: payload.body || "새로운 알림이 도착했어요.",
    icon: "/icon",
    badge: "/icon",
    data: { url: payload.url || "/parent" },
    tag: payload.tag || "family-word-quiz",
    renotify: true,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || "/parent", self.location.origin).href
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    for (const client of clients) {
      if ("focus" in client) {
        await client.focus()
        if ("navigate" in client) await client.navigate(target)
        return
      }
    }
    await self.clients.openWindow(target)
  })())
})
