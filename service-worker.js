const CACHE="gpp-can-chieu-v1-4-0-full";
const SHELL=["./","./index.html","./css/app.css","./js/core.js","./js/render.js","./js/ui.js","./js/app.js","./manifest.webmanifest","./assets/logo_trang.png","./assets/icon-192.png","./assets/icon-512.png","./assets/icon-maskable-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  if(e.request.mode==="navigate"){e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put("./index.html",c));return r}).catch(()=>caches.match("./index.html")));return}
  const u=new URL(e.request.url);if(u.origin===self.location.origin)e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{const c=n.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return n})));
});