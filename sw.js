self.addEventListener("install", e => {
  e.waitUntil(
    caches.open("echo-shadows").then(cache => {
      return cache.addAll([
        "/", "/index.html", "/style.css", "/game.js",
        "/manifest.webmanifest", "/assets/bg3.png",
        "/assets/player.png", "/assets/shadow.png"
      ]);
    })
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(resp => resp || fetch(e.request))
  );
});
