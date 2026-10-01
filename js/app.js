
window.GPP = window.GPP || {};
(() => {
"use strict";
const G=window.GPP;
G.ui.start();
G.render.start();

/* PWA install/update */
let deferred=null;
const install=document.getElementById("btnInstallApp");
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferred=e;if(install)install.hidden=false});
install?.addEventListener("click",async()=>{
  if(!deferred){G.ui.toast("Mở menu trình duyệt → Cài đặt ứng dụng / Thêm vào màn hình chính.");return}
  deferred.prompt();try{await deferred.userChoice}catch(e){}deferred=null;install.hidden=true;
});
window.addEventListener("appinstalled",()=>{deferred=null;if(install)install.hidden=true});
if("serviceWorker" in navigator){
  window.addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("./service-worker.js");
      try{await reg.update()}catch(e){}
      let once=false;navigator.serviceWorker.addEventListener("controllerchange",()=>{if(once)return;once=true;location.reload()});
    }catch(e){console.warn("Service Worker:",e)}
  });
}
})();
