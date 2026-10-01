const CACHE_NAME="gpp-can-chieu-v1-1-13";
const APP_SHELL=["./","./index.html","./css/app.css","./js/app.js","./manifest.webmanifest","./assets/logo_trang.png","./assets/icon-192.png","./assets/icon-512.png","./assets/icon-maskable-192.png","./assets/icon-maskable-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)));self.skipWaiting();});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const x=r.clone();caches.open(CACHE_NAME).then(cache=>cache.put(e.request,x)).catch(()=>{});return r;}).catch(()=>caches.match("./index.html"))));});
