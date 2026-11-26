// A generic offline page keeps conversations, credentials and receipts out of device caches.
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.mode !== "navigate" || event.request.method !== "GET" ||
      url.origin !== self.location.origin || !(url.pathname === "/mobile" || url.pathname.startsWith("/mobile/"))) return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#101112"><title>Xtreme Avatar offline</title><body style="margin:3rem 1.5rem;background:#101112;color:#f4f1ea;font:1rem/1.5 system-ui"><p>Xtreme Avatar</p><h1>You’re offline.</h1><p>Reconnect to open Eden.</p><a style="color:#ddc18a" href="/mobile">Try again</a></body></html>',
    { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  )));
});
