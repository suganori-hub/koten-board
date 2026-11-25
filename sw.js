// KOTEN BOARD v3 Service Worker
// ・キャッシュ名を v3 に更新（旧キャッシュは activate 時に削除）
// ・ネットワーク優先（オンライン時は常に最新を取得、オフライン時のみキャッシュを使用）
// ・skipWaiting / clients.claim で更新を即時反映（古い画面が残らない）
const CACHE = "koten-board-cache-v3";
const ASSETS = ["./", "./index.html", "./style.css?v=3", "./app.js?v=3", "./manifest.webmanifest"];

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
      .catch(() => caches.match(req, { ignoreSearch: false }).then(m => m || caches.match(req, { ignoreSearch: true })).then(m => m || caches.match("./index.html")))
  );
});
