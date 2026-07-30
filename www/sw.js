// きりがみ ― サービスワーカー
// キャッシュ戦略:
//  ・アプリ本体（HTML/マニフェスト/アイコン）: cache-first、裏側で更新（stale-while-revalidate）
//  ・Googleフォント: cache-first、初回オンライン時に取得できていればオフラインでも文字が崩れない
const SHELL_CACHE = "kirigami-shell-v2";
const FONT_CACHE = "kirigami-fonts-v1";

const SHELL_URLS = [
  "./index.html",
  "./manifest.json",
  "./icons/icon-48.png",
  "./icons/icon-72.png",
  "./icons/icon-96.png",
  "./icons/icon-128.png",
  "./icons/icon-144.png",
  "./icons/icon-152.png",
  "./icons/icon-192.png",
  "./icons/icon-384.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== SHELL_CACHE && n !== FONT_CACHE)
          .map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

function isFontRequest(url) {
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

// 裏側でネットワークから最新版を取りに行き、キャッシュを更新する（結果はこのリクエストには使わず次回に反映）
function revalidateInBackground(request, cacheName) {
  fetch(request)
    .then((response) => {
      if (response && response.ok) {
        caches.open(cacheName).then((cache) => cache.put(request, response.clone()));
      }
    })
    .catch(() => { /* オフライン時は無視 */ });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (isFontRequest(url)) {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          revalidateInBackground(req, SHELL_CACHE);
          return cached;
        }
        return fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const clone = res.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(req, clone));
            }
            return res;
          })
          .catch(() => caches.match("./index.html"));
      })
    );
  }
});
