// Bump CACHE_NAME on every release that changes index.html / app.js.
// v5 also switches the app shell off cache-first — see the fetch handler.
const CACHE_NAME = 'ruqyah-pro-v10';  // v10: resilient install, no remote precache
const AUDIO_CACHE = 'ruqyah-audio-dl-v1';

// Files that change with every deploy. Cache-first on these meant a returning
// visitor kept running whatever build they first loaded — new sections (like the
// book store) never appeared until they cleared site data.
const SHELL = ['/', '/index.html', '/app.html', '/app.js',
               '/audio.json', '/pdf_list.json', '/features.html'];

function isShell(url) {
    try {
        const u = new URL(url);
        if (u.origin !== self.location.origin) return false;
        return SHELL.includes(u.pathname) || u.pathname === '/index.html';
    } catch (e) { return false; }
}
// Same-origin only. A Google Fonts URL used to sit in this list, and because
// addAll is atomic, one flaky font request rejected the whole install and the
// service worker never activated — no offline support at all, silently.
//
// app.html only exists in the web build and index.html is the app itself in the
// native one, so a couple of these 404 depending on target. That is fine now
// that failures are per-entry.
const ASSETS = [
  './',
  './index.html',
  './app.html',
  './app.js',
  './build-flags.js',
  './audio.json',
  './pdf_list.json',
  './manifest.json',
  // Bengali is the interface language, so its face is precached rather than
  // left to the generic cache-first path — otherwise the very first offline
  // launch renders the whole UI in a fallback font.
  './fonts/fonts.css',
  './fonts/Hind-Siliguri-400-normal-bengali.woff2',
  './fonts/Hind-Siliguri-600-normal-bengali.woff2',
  './fonts/Hind-Siliguri-700-normal-bengali.woff2'
];

self.addEventListener('install', (event) => {
  // Take over straight away instead of idling until every tab is closed —
  // otherwise a fix can sit unused for days on a phone that never fully quits.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Per-entry, so a single miss degrades the cache instead of voiding it.
      Promise.allSettled(ASSETS.map((a) => cache.add(a)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== AUDIO_CACHE).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Helper function to handle HTTP Range requests for cached audio files (crucial for Safari & media seeking)
async function handleAudioRangeRequest(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const cachedResponse = await cache.match(request.url, { ignoreVary: true });

  if (!cachedResponse) {
    return fetch(request);
  }

  const rangeHeader = request.headers.get('Range');
  if (!rangeHeader) {
    return cachedResponse;
  }

  try {
    const arrayBuffer = await cachedResponse.arrayBuffer();
    const total = arrayBuffer.byteLength;

    // Parse Range header (e.g., "bytes=0-1024" or "bytes=2048-")
    const parts = rangeHeader.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : total - 1;

    const chunkStart = isNaN(start) ? 0 : start;
    const chunkEnd = isNaN(end) ? total - 1 : end;

    const slicedBuffer = arrayBuffer.slice(chunkStart, chunkEnd + 1);

    const responseHeaders = new Headers(cachedResponse.headers);
    responseHeaders.set('Content-Range', `bytes ${chunkStart}-${chunkEnd}/${total}`);
    responseHeaders.set('Content-Length', slicedBuffer.byteLength.toString());
    responseHeaders.set('Accept-Ranges', 'bytes');

    return new Response(slicedBuffer, {
      status: 206,
      statusText: 'Partial Content',
      headers: responseHeaders
    });
  } catch (error) {
    // If range processing fails, fallback to standard cached response
    return cachedResponse;
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Never touch the API. /api/book streams paid pages that the server gates per
  // request — caching them here would keep a copy on the device that outlives
  // the purchase check, and would also freeze 401s once a login expires.
  if (/\/api\//.test(url)) return;

  // opus/webm are here for the odd YouTube source that offers no m4a stream —
  // without the extension the download would still cache but a seek would miss
  // the offline copy and re-fetch over the network.
  const isAudio = event.request.destination === 'audio' || /\.(mp3|m4a|ogg|opus|webm)(\?|$)/i.test(url);

  // Downloaded audio: serve cache-first with support for range requests
  if (isAudio) {
    event.respondWith(handleAudioRangeRequest(event.request));
    return;
  }

  // Blog content changes whenever a post is published, so it must never be
  // cache-first: a reader who opened the blog once would otherwise be pinned to
  // that day's posts forever. Network-first still leaves a copy to read offline.
  //
  // This covers the pages as well as the JSON. Images under /blog/images/ are
  // immutable once published, so they stay on the cache-first path below.
  const isBlogContent = /\/blog\//.test(url) && !/\/blog\/images\//.test(url);

  // App shell: network-first, fall back to cache. Keeps the app updatable while
  // still working offline (the cached copy answers as soon as the network fails).
  if (isShell(url) || isBlogContent) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match('/app.html')))
    );
    return;
  }

  // Everything else (fonts, images, PDFs) is versioned or static — cache-first.
  event.respondWith(
    caches.match(event.request).then((res) => {
      return res || fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => cache.put(event.request, clone))
          .catch(() => {});
        return response;
      });
    })
  );
});
