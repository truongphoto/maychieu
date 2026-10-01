(() => {
const $=id=>document.getElementById(id);
const stage=$("stage"),host=$("stageHost"),glCanvas=$("glCanvas"),gridCanvas=$("gridCanvas"),handleLayer=$("handleLayer");
const gl=glCanvas.getContext("webgl",{alpha:false,antialias:true,preserveDrawingBuffer:false,powerPreference:"high-performance"});
if(!gl){return;}


let logicalW=1600, logicalH=900; // không đổi khi fullscreen
let zones=[],selectedId=null,selectedPoint=null,uid=1,showGrid=true;
const colors=["#00d9ff","#39ffc2","#ffd166","#ff7aa2","#8ea1ff","#d19cff","#64ffda","#ff9f5a"];

function fitStage(){
  const r=host.getBoundingClientRect();
  stage.style.width=Math.max(1,r.width)+"px";
  stage.style.height=Math.max(1,r.height)+"px";
  resizeCanvases();
  refreshHandles();
  drawGrid();
}
function resizeCanvases(){
  const r=stage.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
  const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
  if(glCanvas.width!==w||glCanvas.height!==h){glCanvas.width=w;glCanvas.height=h;gridCanvas.width=w;gridCanvas.height=h;gl.viewport(0,0,w,h);}
}
function defaultPoints(i=0){const o=(i%4)*0.025;return[{x:.10+o,y:.12+o},{x:.55+o,y:.12+o},{x:.55+o,y:.55+o},{x:.10+o,y:.55+o}]}
function current(){return zones.find(z=>z.id===selectedId)||null;}
function addZone(copy=null){
  const z={id:uid,name:`KHUNG ${String(uid).padStart(2,"0")}`,points:defaultPoints(zones.length),visible:true,locked:false,brightness:1,rotation:0,flipX:1,flipY:1,loop:true,mediaType:null,fileName:"Chưa có nguồn",ready:false,image:null,video:null,objectUrl:null,color:colors[(uid-1)%colors.length],texture:gl.createTexture()};
  uid++;
  if(copy){z.points=copy.points.map(p=>({x:Math.min(.98,p.x+.03),y:Math.min(.98,p.y+.03)}));z.brightness=copy.brightness;z.rotation=copy.rotation;z.flipX=copy.flipX;z.flipY=copy.flipY;}
  gl.bindTexture(gl.TEXTURE_2D,z.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  zones.push(z);selectedId=z.id;selectedPoint=null;refreshUI();return z;
}

const vs=`attribute vec2 a_position;attribute vec2 a_texcoord;uniform mat3 u_matrix;varying vec2 v_texcoord;void main(){vec3 p=u_matrix*vec3(a_position,1.0);gl_Position=vec4(p.xy/p.z,0.0,1.0);v_texcoord=a_texcoord;}`;
const fs=`precision mediump float;varying vec2 v_texcoord;uniform sampler2D u_texture;uniform float u_brightness;uniform mat3 u_uv;void main(){vec3 q=u_uv*vec3(v_texcoord,1.0);vec4 c=texture2D(u_texture,q.xy);gl_FragColor=vec4(c.rgb*u_brightness,c.a);}`;
function sh(t,s){const q=gl.createShader(t);gl.shaderSource(q,s);gl.compileShader(q);return q}
const prog=gl.createProgram();gl.attachShader(prog,sh(gl.VERTEX_SHADER,vs));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);gl.useProgram(prog);
const posLoc=gl.getAttribLocation(prog,"a_position"),uvLoc=gl.getAttribLocation(prog,"a_texcoord"),mLoc=gl.getUniformLocation(prog,"u_matrix"),uvMLoc=gl.getUniformLocation(prog,"u_uv"),bLoc=gl.getUniformLocation(prog,"u_brightness");
const pb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(posLoc);gl.vertexAttribPointer(posLoc,2,gl.FLOAT,false,0,0);
const ub=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,ub);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(uvLoc);gl.vertexAttribPointer(uvLoc,2,gl.FLOAT,false,0,0);

function solve(A,b){const n=b.length;for(let i=0;i<n;i++){let m=i;for(let j=i+1;j<n;j++)if(Math.abs(A[j][i])>Math.abs(A[m][i]))m=j;[A[i],A[m]]=[A[m],A[i]];[b[i],b[m]]=[b[m],b[i]];const p=A[i][i]||1e-12;for(let j=i+1;j<n;j++){const f=A[j][i]/p;for(let k=i;k<n;k++)A[j][k]-=f*A[i][k];b[j]-=f*b[i]}}const x=new Array(n).fill(0);for(let i=n-1;i>=0;i--){let s=b[i];for(let j=i+1;j<n;j++)s-=A[i][j]*x[j];x[i]=s/(A[i][i]||1e-12)}return x}
function H(src,dst){const A=[],b=[];for(let i=0;i<4;i++){const [x,y]=src[i],[u,v]=dst[i];A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v)}const h=solve(A,b);return[h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1]}
function glH(h){return new Float32Array([h[0],h[3],h[6],h[1],h[4],h[7],h[2],h[5],h[8]])}
function uvMat(z){const r=z.rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r),cx=.5,cy=.5,m00=c*z.flipX,m01=-s*z.flipY,m10=s*z.flipX,m11=c*z.flipY,tx=cx-m00*cx-m01*cy,ty=cy-m10*cx-m11*cy;return new Float32Array([m00,m10,0,m01,m11,0,tx,ty,1])}

function refreshUI(){
  $("zoneList").innerHTML="";

  zones.forEach((z,idx)=>{
    const d=document.createElement("div");
    d.className="zone-item"+(z.id===selectedId?" active":"");

    const main=document.createElement("div");
    main.className="zone-main";
    main.innerHTML=`<div class="zone-name">${z.name}</div><div class="zone-meta">${z.fileName}</div>`;
    main.onclick=()=>{
      selectedId=z.id;
      selectedPoint=null;
      refreshUI();
    };

    const actions=document.createElement("div");
    actions.className="zone-actions";

    const vis=document.createElement("button");
    vis.className="zone-action";
    vis.textContent=z.visible?"ẨN":"HIỆN";
    vis.title=z.visible?"Ẩn khung":"Hiện khung";
    vis.onclick=(e)=>{
      e.stopPropagation();
      z.visible=!z.visible;
      selectedId=z.id;
      refreshUI();
    };

    const del=document.createElement("button");
    del.className="zone-action delete";
    del.textContent="XÓA";
    del.title="Xóa khung";
    del.onclick=(e)=>{
      e.stopPropagation();
      if(zones.length<=1){
        alert("Phải giữ lại ít nhất 1 khung.");
        return;
      }
      const i=zones.findIndex(q=>q.id===z.id);
      if(z.objectUrl) URL.revokeObjectURL(z.objectUrl);
      zones.splice(i,1);
      if(selectedId===z.id){
        const next=zones[Math.min(i,zones.length-1)];
        selectedId=next ? next.id : null;
        selectedPoint=null;
      }
      refreshUI();
    };

    actions.appendChild(vis);
    actions.appendChild(del);
    d.appendChild(main);
    d.appendChild(actions);
    $("zoneList").appendChild(d);
  });

  $("emptyHint").style.display=zones.length?"none":"flex";

  const z=current();
  if(z){
    $("brightness").value=Math.round(z.brightness*100);
    $("btnLock").textContent=z.locked?"MỞ KHÓA":"KHÓA";
    $("btnVisible").textContent=z.visible?"ẨN KHUNG":"HIỆN KHUNG";
    $("fileInfo").textContent=z.fileName;
  }else{
    $("fileInfo").textContent="Chưa chọn khung";
  }

  refreshHandles();
  queueGridDraw();
}
let handleEls = [];
let moveHandle=null;
let dragging=null;
let movingZone=null;
let gridDrawQueued=false;

function queueGridDraw(){
  if(gridDrawQueued) return;
  gridDrawQueued=true;
  requestAnimationFrame(()=>{
    gridDrawQueued=false;
    drawGrid();
  });
}

function buildHandles(){
  handleLayer.innerHTML="";
  handleEls=[];

  for(let i=0;i<4;i++){
    const h=document.createElement("button");
    h.className="handle";
    h.dataset.i=String(i);

    h.addEventListener("pointerdown",e=>{
      const z=current();
      if(!z||z.locked) return;
      selectedPoint=i;
      dragging={id:z.id,i,pointerId:e.pointerId};
      h.setPointerCapture(e.pointerId);
      h.classList.add("active");
      e.preventDefault();
      e.stopPropagation();
    });

    h.addEventListener("pointermove",e=>{
      const z=current();
      if(!z||!dragging||dragging.id!==z.id||dragging.i!==i||z.locked) return;
      const rr=stage.getBoundingClientRect();
      z.points[i].x=Math.max(0,Math.min(1,(e.clientX-rr.left)/rr.width));
      z.points[i].y=Math.max(0,Math.min(1,(e.clientY-rr.top)/rr.height));

      h.style.left=(z.points[i].x*rr.width)+"px";
      h.style.top=(z.points[i].y*rr.height)+"px";

      refreshMoveHandle();
      queueGridDraw();
      e.preventDefault();
      e.stopPropagation();
    });

    const endDrag=e=>{
      if(dragging && dragging.i===i){
        dragging=null;
        h.classList.remove("active");
        refreshMoveHandle();
        queueGridDraw();
      }
    };
    h.addEventListener("pointerup",endDrag);
    h.addEventListener("pointercancel",endDrag);
    h.addEventListener("lostpointercapture",endDrag);

    handleLayer.appendChild(h);
    handleEls.push(h);
  }

  moveHandle=document.createElement("button");
  moveHandle.className="move-handle";
  moveHandle.type="button";
  moveHandle.textContent="✥";
  moveHandle.title="Giữ và kéo để di chuyển cả khung";

  moveHandle.addEventListener("pointerdown",e=>{
    const z=current();
    if(!z||z.locked) return;

    const rr=stage.getBoundingClientRect();
    movingZone={
      id:z.id,
      pointerId:e.pointerId,
      startX:e.clientX,
      startY:e.clientY,
      startPoints:z.points.map(p=>({x:p.x,y:p.y})),
      width:rr.width,
      height:rr.height
    };
    moveHandle.setPointerCapture(e.pointerId);
    moveHandle.classList.add("dragging");
    selectedPoint=null;
    e.preventDefault();
    e.stopPropagation();
  });

  moveHandle.addEventListener("pointermove",e=>{
    const z=current();
    if(!z||!movingZone||movingZone.id!==z.id||z.locked) return;

    let dx=(e.clientX-movingZone.startX)/movingZone.width;
    let dy=(e.clientY-movingZone.startY)/movingZone.height;

    // Giới hạn để toàn bộ khung không vượt khỏi vùng chiếu.
    const xs=movingZone.startPoints.map(p=>p.x);
    const ys=movingZone.startPoints.map(p=>p.y);
    const minDx=-Math.min(...xs);
    const maxDx=1-Math.max(...xs);
    const minDy=-Math.min(...ys);
    const maxDy=1-Math.max(...ys);

    dx=Math.max(minDx,Math.min(maxDx,dx));
    dy=Math.max(minDy,Math.min(maxDy,dy));

    z.points=movingZone.startPoints.map(p=>({x:p.x+dx,y:p.y+dy}));

    refreshHandles();
    queueGridDraw();
    e.preventDefault();
    e.stopPropagation();
  });

  const endMove=e=>{
    if(movingZone){
      movingZone=null;
      moveHandle.classList.remove("dragging");
      refreshHandles();
      queueGridDraw();
    }
  };
  moveHandle.addEventListener("pointerup",endMove);
  moveHandle.addEventListener("pointercancel",endMove);
  moveHandle.addEventListener("lostpointercapture",endMove);

  handleLayer.appendChild(moveHandle);
}

function refreshMoveHandle(){
  const z=current();
  if(!moveHandle) return;

  if(!z||document.body.classList.contains("ui-hidden")){
    moveHandle.style.display="none";
    return;
  }

  const r=stage.getBoundingClientRect();
  const cx=z.points.reduce((s,p)=>s+p.x,0)/4;
  const cy=z.points.reduce((s,p)=>s+p.y,0)/4;

  moveHandle.style.display="block";
  moveHandle.style.left=(cx*r.width)+"px";
  moveHandle.style.top=(cy*r.height)+"px";
  moveHandle.style.opacity=z.locked?".45":"1";
}

function refreshHandles(){
  const z=current();
  if(!handleEls.length) buildHandles();

  if(!z||document.body.classList.contains("ui-hidden")){
    handleEls.forEach(h=>h.style.display="none");
    if(moveHandle) moveHandle.style.display="none";
    return;
  }

  const r=stage.getBoundingClientRect();
  handleEls.forEach((h,i)=>{
    h.style.display="block";
    h.style.background=z.color;
    h.style.left=(z.points[i].x*r.width)+"px";
    h.style.top=(z.points[i].y*r.height)+"px";
    h.style.opacity=z.locked?".5":"1";
    h.classList.toggle("active",selectedPoint===i && !!dragging);
  });

  refreshMoveHandle();
} 

function drawGrid(){
  const ctx=gridCanvas.getContext("2d"),r=stage.getBoundingClientRect(),dpr=gridCanvas.width/Math.max(1,r.width);ctx.clearRect(0,0,gridCanvas.width,gridCanvas.height);
  if(!showGrid||document.body.classList.contains("ui-hidden"))return;
  ctx.save();ctx.scale(dpr,dpr);
  zones.forEach(z=>{
    if(!z.visible)return;
    const p=z.points.map(q=>({x:q.x*r.width,y:q.y*r.height}));
    ctx.strokeStyle=z.id===selectedId?z.color:"rgba(130,180,200,.35)";ctx.lineWidth=z.id===selectedId?1.6:1;
    ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);p.slice(1).forEach(q=>ctx.lineTo(q.x,q.y));ctx.closePath();ctx.stroke();
    if(z.id===selectedId){
      const n=dragging?4:8;ctx.strokeStyle="rgba(0,217,255,.22)";ctx.lineWidth=1;
      for(let i=1;i<n;i++){
        let t=i/n;
        let a={x:p[0].x+(p[3].x-p[0].x)*t,y:p[0].y+(p[3].y-p[0].y)*t},b={x:p[1].x+(p[2].x-p[1].x)*t,y:p[1].y+(p[2].y-p[1].y)*t};
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
        a={x:p[0].x+(p[1].x-p[0].x)*t,y:p[0].y+(p[1].y-p[0].y)*t};b={x:p[3].x+(p[2].x-p[3].x)*t,y:p[3].y+(p[2].y-p[3].y)*t};
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      }
    }
  });
  ctx.restore();
}

function render(){
  requestAnimationFrame(render);if(document.hidden)return;
  resizeCanvases();gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(prog);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  zones.forEach(z=>{
    if(!z.visible||!z.ready)return;
    const dst=z.points.map(p=>[p.x*2-1,1-p.y*2]);const h=H([[0,1],[1,1],[1,0],[0,0]],dst);
    gl.uniformMatrix3fv(mLoc,false,glH(h));gl.uniformMatrix3fv(uvMLoc,false,uvMat(z));gl.uniform1f(bLoc,z.brightness);
    gl.bindTexture(gl.TEXTURE_2D,z.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    try{
      if(z.mediaType==="image")gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,z.image);
      else if(z.mediaType==="video"&&z.video.readyState>=2)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,z.video);
      gl.drawArrays(gl.TRIANGLES,0,6);
    }catch(e){}
  });
}
function fps(){}

$("btnAddZone").onclick=()=>addZone();
$("fileInput").onchange=e=>{
  const z=current(),f=e.target.files[0];if(!z||!f)return;
  if(z.objectUrl)URL.revokeObjectURL(z.objectUrl);z.objectUrl=URL.createObjectURL(f);z.fileName=f.name;z.ready=false;
  if(f.type.startsWith("image/")){z.mediaType="image";z.image=new Image();z.image.onload=()=>{z.ready=true;refreshUI()};z.image.src=z.objectUrl}
  else if(f.type.startsWith("video/")){z.mediaType="video";z.video=document.createElement("video");z.video.src=z.objectUrl;z.video.loop=true;z.video.playsInline=true;z.video.preload="metadata";z.video.onloadeddata=()=>{z.ready=true;z.video.play().catch(()=>{});refreshUI()};z.video.load()}
  refreshUI();
};
$("btnPlay").onclick=()=>{const z=current();if(z?.video)z.video.play().catch(()=>{})};
$("btnPause").onclick=()=>{const z=current();if(z?.video)z.video.pause()};
$("btnStop").onclick=()=>{const z=current();if(z?.video){z.video.pause();z.video.currentTime=0}};
$("brightness").oninput=e=>{const z=current();if(z)z.brightness=+e.target.value/100};
$("btnRotate").onclick=()=>{const z=current();if(z)z.rotation=(z.rotation+90)%360};
$("btnFlipX").onclick=()=>{const z=current();if(z)z.flipX*=-1};
$("btnFlipY").onclick=()=>{const z=current();if(z)z.flipY*=-1};
$("btnLock").onclick=()=>{const z=current();if(z){z.locked=!z.locked;refreshUI()}};
$("btnVisible").onclick=()=>{const z=current();if(z){z.visible=!z.visible;refreshUI()}};
$("btnResetZone").onclick=()=>{const z=current();if(z){z.points=defaultPoints(zones.indexOf(z));z.rotation=0;z.flipX=1;z.flipY=1;refreshUI()}};
$("btnDuplicate").onclick=()=>{const z=current();if(z)addZone(z)};
$("btnDelete").onclick=()=>{if(zones.length<=1)return;const i=zones.findIndex(z=>z.id===selectedId);const z=zones[i];if(z?.objectUrl)URL.revokeObjectURL(z.objectUrl);zones.splice(i,1);selectedId=zones[Math.max(0,i-1)].id;refreshUI()};
$("btnLayerUp").onclick=()=>{const i=zones.findIndex(z=>z.id===selectedId);if(i<zones.length-1){[zones[i],zones[i+1]]=[zones[i+1],zones[i]];refreshUI()}};
$("btnLayerDown").onclick=()=>{const i=zones.findIndex(z=>z.id===selectedId);if(i>0){[zones[i],zones[i-1]]=[zones[i-1],zones[i]];refreshUI()}};
$("btnToggleGrid").onclick=()=>{showGrid=!showGrid;$("btnToggleGrid").textContent=showGrid?"ẨN LƯỚI":"HIỆN LƯỚI";drawGrid()};

$("btnSave").onclick=()=>{const data={logicalW,logicalH,zones:zones.map(z=>({name:z.name,points:z.points,visible:z.visible,locked:z.locked,brightness:z.brightness,rotation:z.rotation,flipX:z.flipX,flipY:z.flipY}))};localStorage.setItem("gpp-v11-mz",JSON.stringify(data));$("fileInfo").textContent="Đã lưu cấu hình hình học. Nguồn ảnh/video không được nhúng vào cấu hình."};
$("btnLoad").onclick=()=>{const raw=localStorage.getItem("gpp-v11-mz");if(!raw)return;try{const d=JSON.parse(raw);logicalW=d.logicalW||1600;logicalH=d.logicalH||900;zones=[];uid=1;(d.zones||[]).forEach(s=>{const z=addZone();Object.assign(z,s);z.mediaType=null;z.fileName="Chưa có nguồn";z.ready=false});if(!zones.length)addZone();selectedId=zones[0].id;fitStage();refreshUI()}catch(e){}};



window.addEventListener("resize",fitStage);
window.addEventListener("keydown",e=>{
  const z=current();if(!z||z.locked||selectedPoint===null)return;const step=(e.shiftKey?10:1),rx=step/logicalW,ry=step/logicalH;
  if(e.key==="ArrowLeft")z.points[selectedPoint].x-=rx;
  else if(e.key==="ArrowRight")z.points[selectedPoint].x+=rx;
  else if(e.key==="ArrowUp")z.points[selectedPoint].y-=ry;
  else if(e.key==="ArrowDown")z.points[selectedPoint].y+=ry;
  else return;
  z.points[selectedPoint].x=Math.max(0,Math.min(1,z.points[selectedPoint].x));z.points[selectedPoint].y=Math.max(0,Math.min(1,z.points[selectedPoint].y));refreshHandles();queueGridDraw();e.preventDefault();
});


// ===== V1.1.10: DOUBLECLICK + CENTER MOVE FIX =====
const SETTINGS_KEY="gpp-v111-settings";
function loadAppSettings(){
  try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||"null")}catch(e){return null}
}
function refreshSetupButton(){
  const has=!!loadAppSettings();
  $("btnSetup").textContent="CẤU HÌNH";
  $("btnSetup").classList.toggle("has-config",has);
  $("btnSetup").title=has?"Đã có cấu hình hệ thống":"Chưa có cấu hình hệ thống";
}
function openSettings(){
  const s=loadAppSettings()||{profileName:"Cấu hình mặc định",screenRatio:"16:9",autoHideGrid:true};
  $("profileName").value=s.profileName||"Cấu hình mặc định";
  $("screenRatio").value=s.screenRatio||"16:9";
  $("autoHideGrid").checked=s.autoHideGrid!==false;
  $("settingsModal").hidden=false;
}
function closeSettings(){ $("settingsModal").hidden=true; }

$("btnSetup").onclick=openSettings;
$("btnCloseSettings").onclick=closeSettings;
$("btnCancelSettings").onclick=closeSettings;
$("settingsModal").addEventListener("click",e=>{if(e.target===$("settingsModal"))closeSettings()});
$("btnSaveSettings").onclick=()=>{
  const s={
    profileName:$("profileName").value.trim()||"Cấu hình mặc định",
    screenRatio:$("screenRatio").value,
    autoHideGrid:$("autoHideGrid").checked
  };
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));
  if(s.screenRatio==="16:9"){logicalW=1600;logicalH=900}
  else if(s.screenRatio==="16:10"){logicalW=1600;logicalH=1000}
  else {logicalW=1600;logicalH=1200}
  fitStage();
  closeSettings();
  refreshSetupButton();
};
refreshSetupButton();



// ===== V1.2.0 OFFICIAL: PRESENTATION MODE =====
function uiToggleExcluded(target){
  return !!(target && target.closest && (
    target.closest(".control-panel") ||
    target.closest(".handle") ||
    target.closest(".move-handle") ||
    target.closest(".settings-modal") ||
    target.closest(".modal-backdrop")
  ));
}

function isInstalledDisplayMode(){
  return window.matchMedia("(display-mode: fullscreen)").matches ||
         window.matchMedia("(display-mode: standalone)").matches;
}

function setUIHidden(hidden){
  document.body.classList.toggle("ui-hidden", hidden);

  if(hidden){
    const modal=document.getElementById("settingsModal");
    if(modal) modal.hidden=true;
    handleEls.forEach(h=>h.style.display="none");
    if(moveHandle) moveHandle.style.display="none";
    const ctx=gridCanvas.getContext("2d");
    ctx.clearRect(0,0,gridCanvas.width,gridCanvas.height);
  }else{
    refreshHandles();
    queueGridDraw();
  }
}

function requestSystemFullscreenFromGesture(){
  if(isInstalledDisplayMode()) return;
  if(document.fullscreenElement) return;
  const el=document.documentElement;
  if(!el.requestFullscreen) return;

  try{
    const p=el.requestFullscreen({navigationUI:"hide"});
    if(p && typeof p.catch==="function") p.catch(()=>{});
  }catch(e){}
}

function enterPresentationMode(){
  requestSystemFullscreenFromGesture();
  setUIHidden(true);
}

function showControls(){
  // Không thoát fullscreen để tránh thay đổi kích thước vùng chiếu.
  setUIHidden(false);
}

function toggleControlsFromGesture(){
  if(document.body.classList.contains("ui-hidden")) showControls();
  else enterPresentationMode();
}

const hideBtn=document.getElementById("btnHideUI");
if(hideBtn){
  hideBtn.addEventListener("click",e=>{
    e.preventDefault();
    enterPresentationMode();
  });
}

/* PC */
let lastPointerType="mouse";
document.addEventListener("pointerdown",e=>{
  lastPointerType=e.pointerType||"mouse";
},{capture:true});

document.addEventListener("click",e=>{
  if(lastPointerType!=="mouse") return;
  if(!document.body.classList.contains("ui-hidden") && uiToggleExcluded(e.target)) return;
  if(e.detail===2){
    e.preventDefault();
    toggleControlsFromGesture();
  }
},{capture:true});

/* Mobile / tablet */
let tapTime=0,tapX=0,tapY=0;
document.addEventListener("pointerup",e=>{
  if(e.pointerType==="mouse") return;
  if(!document.body.classList.contains("ui-hidden") && uiToggleExcluded(e.target)){
    tapTime=0;
    return;
  }

  const now=performance.now();
  const dx=e.clientX-tapX,dy=e.clientY-tapY;
  const near=(dx*dx+dy*dy)<=3600;

  if(tapTime>0 && now-tapTime<=500 && near){
    e.preventDefault();
    toggleControlsFromGesture();
    tapTime=0;
    return;
  }

  tapTime=now;
  tapX=e.clientX;
  tapY=e.clientY;
},{capture:true});

window.addEventListener("resize",()=>{
  requestAnimationFrame(()=>{
    try{ fitStage(); }catch(e){}
  });
});

window.addEventListener("orientationchange",()=>{
  setTimeout(()=>{
    try{ fitStage(); }catch(e){}
  },180);
});

buildHandles();
addZone();
fitStage();
requestAnimationFrame(render);
})();

// ===== V1.2.0 OFFICIAL: PWA INSTALL + SERVICE WORKER =====
let deferredInstallPrompt=null;
const installBtn=document.getElementById("btnInstallApp");

function isInstalledPwa(){
  return window.matchMedia("(display-mode: fullscreen)").matches ||
         window.matchMedia("(display-mode: standalone)").matches ||
         window.navigator.standalone===true;
}

window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();
  deferredInstallPrompt=e;
  if(installBtn && !isInstalledPwa()) installBtn.hidden=false;
});

if(installBtn){
  installBtn.addEventListener("click",async()=>{
    if(!deferredInstallPrompt){
      alert("Nếu chưa xuất hiện hộp cài đặt, hãy mở menu trình duyệt và chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.");
      return;
    }
    deferredInstallPrompt.prompt();
    try{ await deferredInstallPrompt.userChoice; }catch(e){}
    deferredInstallPrompt=null;
    installBtn.hidden=true;
  });
}

window.addEventListener("appinstalled",()=>{
  deferredInstallPrompt=null;
  if(installBtn) installBtn.hidden=true;
});

if(isInstalledPwa() && installBtn) installBtn.hidden=true;

if("serviceWorker" in navigator){
  window.addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("./service-worker.js");
      try{ await reg.update(); }catch(e){}

      let reloading=false;
      navigator.serviceWorker.addEventListener("controllerchange",()=>{
        if(reloading) return;
        reloading=true;
        location.reload();
      });
    }catch(e){
      console.warn("Không đăng ký được Service Worker:",e);
    }
  });
}
