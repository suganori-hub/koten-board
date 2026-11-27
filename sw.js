// KOTEN BOARD v4 Service Worker
// ・キャッシュ名 v4（旧キャッシュは activate 時に削除）
// ・ネットワーク優先（オンライン時は常に最新、オフライン時のみキャッシュ）
// ・skipWaiting / clients.claim で更新を即時反映
// ・外部API（GitHub同期・AI）は一切キャッシュせず素通し
const CACHE = "koten-board-cache-v11";
const ASSETS = ["./", "./index.html", "./style.css?v=11", "./app.js?v=11", "./manifest.webmanifest"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(ASSETS.map(a => fetch(new Request(a, { cache: "reload" })).then(r => { if (r.ok) return c.put(a, r); }).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(m => m || caches.match(req, { ignoreSearch: true })).then(m => m || caches.match("./index.html")))
  );
});
