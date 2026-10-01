
window.GPP = window.GPP || {};
(() => {
"use strict";
const G=window.GPP,$=id=>document.getElementById(id);
const stage=$("stage"),overlay=$("overlayCanvas"),handleLayer=$("handleLayer"),preview=$("shapePreview"),menu=$("contextMenu");
const ctx=overlay.getContext("2d");
let handles=[],moveHandle=null,drag=null,longTimer=null,longTarget=null,toastTimer=null;
let edgeLong=null,createState=null,circleTouches=new Map();

G.ui={
  stageRect:()=>stage.getBoundingClientRect(),
  toast(msg){
    const t=$("toast");t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,2500)
  },
  refresh(){refreshAll()}
};

function current(){return G.model.face()}
function currentBox(){return G.model.box()}
function sourceName(face){
  const id=G.model.effectiveSourceId(face),s=id?G.model.source(id):null;
  if(!s)return "Chưa có nguồn";
  return (G.runtime.sources.get(id)?.ready?"":"⚠ ") + s.name;
}
function selectionText(){
  const b=currentBox(),f=current();return b?(f?`${b.name} / ${f.name}`:b.name):"Chưa chọn"
}
function refreshAll(){
  renderTree();renderSources();refreshAdjust();refreshHandles();drawOverlay();
  $("selectionText").textContent=selectionText();
  $("emptyHint").style.display=G.model.allFaces().length?"none":"flex";
  $("btnUndo").disabled=!G.state.undo.length;$("btnRedo").disabled=!G.state.redo.length;
}
function renderTree(){
  const root=$("projectTree");root.innerHTML="";
  G.state.project.boxes.forEach(b=>{
    const card=document.createElement("div");card.className="box-card"+(b.id===G.state.selectedBoxId?" selected":"");
    const br=document.createElement("div");br.className="box-row";
    const bm=document.createElement("div");bm.className="row-main";bm.innerHTML=`<b>${b.name}</b><small>${b.faces.length} mặt · ${b.displayMode==="continuous"?"LIỀN KHỐI":"ĐỒNG BỘ"}</small>`;
    bm.onclick=()=>{G.model.selectBox(b.id);refreshAll()};
    bindLongPress(bm,{type:"box",boxId:b.id});
    const chip=document.createElement("span");chip.className="row-chip";chip.textContent=b.sourceId?"NGUỒN":"—";
    const more=document.createElement("button");more.className="row-menu";more.textContent="⋯";more.onclick=e=>{e.stopPropagation();showMenu(e.clientX,e.clientY,{type:"box",boxId:b.id})};
    br.append(bm,chip,more);card.appendChild(br);

    if(!b.collapsed){
      b.faceOrder.map(id=>b.faces.find(f=>f.id===id)).filter(Boolean).forEach(f=>{
        const fr=document.createElement("div");fr.className="face-row"+(f.id===G.state.selectedFaceId?" selected":"");
        const fm=document.createElement("div");fm.className="row-main";fm.innerHTML=`<b>${f.name}</b><small>${sourceName(f)} · ${f.shape==="circle"?"TRÒN/CHU VI":"TỨ GIÁC"}</small>`;
        fm.onclick=()=>{G.model.selectFace(f.id);refreshAll()};
        bindLongPress(fm,{type:"face",boxId:b.id,faceId:f.id});
        const vis=document.createElement("span");vis.className="row-chip";vis.textContent=f.visible?"HIỆN":"ẨN";
        const mm=document.createElement("button");mm.className="row-menu";mm.textContent="⋯";mm.onclick=e=>{e.stopPropagation();showMenu(e.clientX,e.clientY,{type:"face",boxId:b.id,faceId:f.id})};
        fr.append(fm,vis,mm);card.appendChild(fr);
      });
    }
    root.appendChild(card);
  })
}
function renderSources(){
  const root=$("sourceList");root.innerHTML="";
  G.state.project.sources.forEach(s=>{
    const r=document.createElement("div");r.className="source-row"+(s.id===G.state.selectedSourceId?" selected":"");
    const main=document.createElement("div");main.className="row-main";
    const rt=G.runtime.sources.get(s.id);main.innerHTML=`<b>${s.name}</b><small>${s.type.toUpperCase()} · ${rt?.ready?"Sẵn sàng":"Cần chọn lại sau khi tải lại trang"}</small>`;
    main.onclick=()=>{G.state.selectedSourceId=s.id;refreshAll()};
    const count=document.createElement("span");count.className="row-chip";count.textContent=`${G.model.sourceRefCount(s.id)} dùng`;
    r.append(main,count);root.appendChild(r);
  });
  if(!G.state.project.sources.length)root.innerHTML='<div class="hint">Chưa có nguồn. Thêm ảnh/video rồi gán cho HỘP hoặc MẶT.</div>';
}
function refreshAdjust(){
  const b=currentBox(),f=current();
  $("modeContinuous").classList.toggle("active",b?.displayMode==="continuous");
  $("modeSync").classList.toggle("active",b?.displayMode==="sync");
  $("btnPerspective").classList.toggle("active",f?.editMode==="perspective");
  $("btnPerimeter").classList.toggle("active",f?.editMode==="perimeter");
  if(!f)return;
  $("brightness").value=Math.round((f.brightness||1)*100);$("brightnessValue").textContent=$("brightness").value+"%";
  $("contentScale").value=Math.round((f.content.scale||1)*100);$("scaleValue").textContent=$("contentScale").value+"%";
  $("contentPanX").value=Math.round((f.content.panX||0)*100);$("contentPanY").value=Math.round((f.content.panY||0)*100);
  $("contentWeight").value=Math.round((f.content.weight||1)*100);$("weightValue").textContent=(f.content.weight||1).toFixed(2);
  $("btnLockFace").textContent=f.locked?"MỞ KHÓA":"KHÓA MẶT";$("btnHideFace").textContent=f.visible?"ẨN MẶT":"HIỆN MẶT";
  $("linkInfo").textContent=`${b?.edgeLinks?.filter(l=>l.faceA===f.id||l.faceB===f.id).length||0} liên kết cạnh trên mặt đang chọn.`;
}
function openPage(name){
  document.body.classList.add("sheet-open");
  document.querySelectorAll(".sheet-page").forEach(p=>p.classList.toggle("active",p.dataset.page===name));
  document.querySelectorAll("[data-open-page]").forEach(b=>b.classList.toggle("active",b.dataset.openPage===name));
}
document.querySelectorAll("[data-open-page]").forEach(b=>b.onclick=()=>openPage(b.dataset.openPage));
$("btnCloseSheet").onclick=()=>document.body.classList.remove("sheet-open");

/* ---------- overlay + handles ---------- */
function resizeOverlay(){
  const r=stage.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);
  if(overlay.width!==w||overlay.height!==h){overlay.width=w;overlay.height=h}
  return{r,dpr}
}
function projectedPerimeter(face){return face.perimeter.points.map(p=>G.render.faceLocalToScreen(face,p))}
function drawOverlay(){
  const {r,dpr}=resizeOverlay();ctx.clearRect(0,0,overlay.width,overlay.height);if(!G.state.showGuides||document.body.classList.contains("ui-hidden"))return;
  ctx.save();ctx.scale(dpr,dpr);
  G.model.allFaces().forEach(f=>{
    if(!f.visible)return;
    const poly=projectedPerimeter(f);if(!poly.length)return;
    ctx.strokeStyle=f.id===G.state.selectedFaceId?f.color:"rgba(130,180,200,.30)";ctx.lineWidth=f.id===G.state.selectedFaceId?1.5:1;
    ctx.beginPath();ctx.moveTo(poly[0].x*r.width,poly[0].y*r.height);for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i].x*r.width,poly[i].y*r.height);ctx.closePath();ctx.stroke();
    if(f.id===G.state.selectedFaceId&&f.editMode==="perspective"){
      ctx.setLineDash([4,4]);ctx.strokeStyle="rgba(255,255,255,.35)";ctx.beginPath();ctx.moveTo(f.points[0].x*r.width,f.points[0].y*r.height);f.points.slice(1).forEach(p=>ctx.lineTo(p.x*r.width,p.y*r.height));ctx.closePath();ctx.stroke();ctx.setLineDash([]);
    }
  });
  ctx.restore();
}
function clearHandles(){handleLayer.innerHTML="";handles=[];moveHandle=null}
function makeHandle(cls,label=""){
  const h=document.createElement("button");h.className=cls;h.type="button";h.textContent=label;handleLayer.appendChild(h);return h
}
function refreshHandles(){
  clearHandles();const f=current();if(!f||document.body.classList.contains("ui-hidden"))return;
  const r=stage.getBoundingClientRect();

  if(f.editMode==="perspective"){
    f.points.forEach((p,i)=>{
      const h=makeHandle("handle");h.style.background=f.color;h.style.left=p.x*r.width+"px";h.style.top=p.y*r.height+"px";
      bindDragHandle(h,{kind:"corner",index:i});
    });
  }else{
    const pts=f.perimeter.points;
    pts.forEach((p,i)=>{
      // For ellipse quick mode, show only 4 protected cardinal points.
      if(f.perimeter.mode==="ellipse"&&!p.protected)return;
      const s=G.render.faceLocalToScreen(f,p),h=makeHandle("perimeter-handle"+(p.locked?" locked":""));
      h.style.left=s.x*r.width+"px";h.style.top=s.y*r.height+"px";
      bindDragHandle(h,{kind:"perimeter",index:i,pointId:p.id});
      bindLongPress(h,{type:"point",faceId:f.id,index:i,pointId:p.id});
    });
  }
  const center={x:f.points.reduce((s,p)=>s+p.x,0)/4,y:f.points.reduce((s,p)=>s+p.y,0)/4};
  moveHandle=makeHandle("move-handle","✥");moveHandle.style.left=center.x*r.width+"px";moveHandle.style.top=center.y*r.height+"px";bindDragHandle(moveHandle,{kind:"move"});
}
function applyLinkedVertex(face,index,newPos){
  const b=G.model.boxOfFace(face.id);if(!b)return;
  const edges=[[0,1],[1,2],[2,3],[3,0]],queue=[{fid:face.id,idx:index,pos:newPos}],seen=new Set();
  while(queue.length){
    const it=queue.shift(),key=it.fid+":"+it.idx;if(seen.has(key))continue;seen.add(key);
    const ff=b.faces.find(x=>x.id===it.fid);if(!ff)continue;ff.points[it.idx]={x:it.pos.x,y:it.pos.y};
    for(const l of b.edgeLinks){
      let fromFace,fromEdge,toFace,toEdge,rev;
      if(l.faceA===it.fid){fromFace=l.faceA;fromEdge=l.edgeA;toFace=l.faceB;toEdge=l.edgeB;rev=l.reversed}
      else if(l.faceB===it.fid){fromFace=l.faceB;fromEdge=l.edgeB;toFace=l.faceA;toEdge=l.edgeA;rev=l.reversed}
      else continue;
      const fe=edges[fromEdge],te=edges[toEdge],posIn=fe.indexOf(it.idx);if(posIn<0)continue;
      const mapped=rev?1-posIn:posIn;queue.push({fid:toFace,idx:te[mapped],pos:it.pos});
    }
  }
}
function bindDragHandle(el,meta){
  el.addEventListener("pointerdown",e=>{
    const f=current();if(!f||f.locked)return;
    G.history.begin();
    drag={meta,pid:e.pointerId,startX:e.clientX,startY:e.clientY,startPoints:G.clone(f.points),startPer:G.clone(f.perimeter.points)};
    el.setPointerCapture(e.pointerId);e.stopPropagation();e.preventDefault();
  });
  el.addEventListener("pointermove",e=>{
    if(!drag||drag.pid!==e.pointerId)return;const f=current(),r=stage.getBoundingClientRect();if(!f)return;
    const nx=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),ny=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));
    if(meta.kind==="corner"){
      const candidate=G.clone(f.points);candidate[meta.index]={x:nx,y:ny};
      if(G.math.validQuad(candidate)){applyLinkedVertex(f,meta.index,{x:nx,y:ny});f.lastValidPoints=G.clone(f.points)}
    }else if(meta.kind==="move"){
      let dx=(e.clientX-drag.startX)/r.width,dy=(e.clientY-drag.startY)/r.height;
      const xs=drag.startPoints.map(p=>p.x),ys=drag.startPoints.map(p=>p.y);
      dx=Math.max(-Math.min(...xs),Math.min(1-Math.max(...xs),dx));dy=Math.max(-Math.min(...ys),Math.min(1-Math.max(...ys),dy));
      const np=drag.startPoints.map(p=>({x:p.x+dx,y:p.y+dy}));
      if(G.math.validQuad(np)){f.points=np;f.lastValidPoints=G.clone(np)}
    }else if(meta.kind==="perimeter"){
      const p=f.perimeter.points[meta.index];if(!p||p.locked)return;
      const local=G.render.screenToFaceLocal(f,{x:nx,y:ny});if(!local)return;
      p.x=Math.max(-.25,Math.min(1.25,local.x));p.y=Math.max(-.25,Math.min(1.25,local.y));
      if(f.perimeter.mode==="ellipse"){
        // protected cardinal points control ellipse radii; rebuild ellipse without distorting source.
        const dx=Math.abs(p.x-.5),dy=Math.abs(p.y-.5);
        let rx=.5,ry=.5;
        if(Math.abs(p.x-.5)>.15)rx=Math.max(.03,dx);
        if(Math.abs(p.y-.5)>.15)ry=Math.max(.03,dy);
        const old=f.perimeter.points;
        const curRx=Math.max(...old.map(q=>Math.abs(q.x-.5))),curRy=Math.max(...old.map(q=>Math.abs(q.y-.5)));
        if(Math.abs(p.x-.5)>.15) f.perimeter.points=G.factory.ellipsePerimeter(16,rx,curRy);
        else f.perimeter.points=G.factory.ellipsePerimeter(16,curRx,ry);
      }
    }
    refreshHandles();drawOverlay();e.preventDefault();
  });
  const end=e=>{if(drag&&drag.pid===e.pointerId){drag=null;G.history.commit();refreshAll()}};
  el.addEventListener("pointerup",end);el.addEventListener("pointercancel",end);el.addEventListener("lostpointercapture",end);
}

/* ---------- context / long press ---------- */
function bindLongPress(el,target){
  el.addEventListener("pointerdown",e=>{
    if(e.pointerType==="mouse"&&e.button!==0)return;
    const sx=e.clientX,sy=e.clientY;
    longTimer=setTimeout(()=>{showMenu(sx,sy,target);longTimer=null},600);
    const cancel=ev=>{if(Math.hypot(ev.clientX-sx,ev.clientY-sy)>8){clearTimeout(longTimer);longTimer=null}};
    el.addEventListener("pointermove",cancel,{once:true});
  });
  ["pointerup","pointercancel","pointerleave"].forEach(n=>el.addEventListener(n,()=>{clearTimeout(longTimer);longTimer=null},{passive:true}));
}
function showMenu(x,y,target){
  longTarget=target;menu.hidden=false;menu.style.left=Math.min(innerWidth-180,Math.max(6,x))+"px";menu.style.top=Math.min(innerHeight-280,Math.max(6,y))+"px";
  menu.querySelector('[data-action="add-point"]').style.display=target.type==="edge"?"block":"none";
  ["delete-point","lock-point"].forEach(a=>menu.querySelector(`[data-action="${a}"]`).style.display=target.type==="point"?"block":"none");
  menu.querySelector('[data-action="reset-perimeter"]').style.display=(target.type==="point"||target.type==="edge"||target.type==="face")?"block":"none";
  ["duplicate-face","delete-face"].forEach(a=>menu.querySelector(`[data-action="${a}"]`).style.display=target.type==="face"?"block":"none");
  ["duplicate-box","delete-box"].forEach(a=>menu.querySelector(`[data-action="${a}"]`).style.display=target.type==="box"?"block":"none");
}
function hideMenu(){menu.hidden=true;longTarget=null}
document.addEventListener("pointerdown",e=>{if(!menu.hidden&&!menu.contains(e.target))hideMenu()},{capture:true});
menu.addEventListener("click",e=>{
  const a=e.target.dataset.action;if(!a||!longTarget)return;
  if(a==="delete-point"){
    const f=G.model.face(longTarget.faceId),p=f?.perimeter.points[longTarget.index];
    if(f&&p&&!p.protected&&f.perimeter.points.length>4)G.history.atomic(()=>f.perimeter.points.splice(longTarget.index,1));
    else G.ui.toast("Điểm nền hoặc số điểm tối thiểu không thể xóa.");
  }else if(a==="lock-point"){
    const f=G.model.face(longTarget.faceId);if(f?.perimeter.points[longTarget.index])G.history.atomic(()=>f.perimeter.points[longTarget.index].locked=!f.perimeter.points[longTarget.index].locked);
  }else if(a==="add-point"){
    const f=G.model.face(longTarget.faceId);if(f){
      G.history.atomic(()=>{
        if(f.perimeter.mode==="ellipse")f.perimeter={mode:"custom",points:G.clone(f.perimeter.points).map(p=>({...p,protected:false}))};
        const i=longTarget.index,j=(i+1)%f.perimeter.points.length,a=f.perimeter.points[i],b=f.perimeter.points[j];
        f.perimeter.points.splice(j,0,{id:G.uid("P"),x:(a.x+b.x)/2,y:(a.y+b.y)/2,locked:false,protected:false});
      });
    }
  }else if(a==="reset-perimeter"){resetPerimeter()}
  else if(a==="duplicate-face")G.model.duplicateFace();
  else if(a==="delete-face")G.model.deleteFace(longTarget.faceId);
  else if(a==="duplicate-box"){G.model.selectBox(longTarget.boxId);G.model.duplicateBox()}
  else if(a==="delete-box")G.model.deleteBox(longTarget.boxId);
  hideMenu();refreshAll();
});

/* Long press selected face => perimeter mode; long press boundary => add point */
stage.addEventListener("pointerdown",e=>{
  if(G.state.createTool||e.target.closest(".handle,.perimeter-handle,.move-handle"))return;
  const f=current();if(!f)return;const r=stage.getBoundingClientRect(),p={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};
  const poly=projectedPerimeter(f);
  let best={d:Infinity,index:-1};
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const ax=a.x*r.width,ay=a.y*r.height,bx=b.x*r.width,by=b.y*r.height,px=e.clientX-r.left,py=e.clientY-r.top;
    const vx=bx-ax,vy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*vx+(py-ay)*vy)/(vx*vx+vy*vy||1)));
    const dx=px-(ax+vx*t),dy=py-(ay+vy*t),d=Math.hypot(dx,dy);if(d<best.d)best={d,index:i};
  }
  const sx=e.clientX,sy=e.clientY;
  edgeLong=setTimeout(()=>{
    if(best.d<=18){showMenu(sx,sy,{type:"edge",faceId:f.id,index:best.index})}
    else{
      const local=G.render.screenToFaceLocal(f,p);
      if(local&&local.x>=-.05&&local.x<=1.05&&local.y>=-.05&&local.y<=1.05){
        f.editMode="perimeter";refreshAll();G.ui.toast("Đã mở chỉnh CHU VI. Nhấn giữ đường biên để thêm điểm.");
      }
    }
  },650);
},{capture:true});
["pointerup","pointercancel","pointermove"].forEach(n=>stage.addEventListener(n,e=>{if(n==="pointermove"&&e.buttons&&Math.abs(e.movementX)+Math.abs(e.movementY)<4)return;clearTimeout(edgeLong);edgeLong=null},{capture:true}));

/* ---------- create gestures ---------- */
function setCreate(tool){
  G.state.createTool=tool;$("btnCancelCreate").hidden=!tool;$("toolQuad").classList.toggle("active",tool==="quad");$("toolCircle").classList.toggle("active",tool==="circle");
  $("gestureHint").textContent=tool==="quad"?"TỨ GIÁC: nhấn giữ ~0,45 giây rồi kéo 1 ngón.":tool==="circle"?"TRÒN: đặt 2 ngón, giữ ngắn rồi tách.":"Chọn công cụ rồi thao tác trực tiếp trên vùng chiếu.";
}
$("toolQuad").onclick=()=>setCreate("quad");$("toolCircle").onclick=()=>setCreate("circle");$("btnCancelCreate").onclick=()=>setCreate(null);

function showPreview(x1,y1,x2,y2,circle=false){preview.hidden=false;preview.classList.toggle("circle",circle);preview.style.left=Math.min(x1,x2)+"px";preview.style.top=Math.min(y1,y2)+"px";preview.style.width=Math.abs(x2-x1)+"px";preview.style.height=Math.abs(y2-y1)+"px"}
function hidePreview(){preview.hidden=true}
function norm(e){const r=stage.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)),px:e.clientX-r.left,py:e.clientY-r.top,r}}
stage.addEventListener("pointerdown",e=>{
  if(G.state.createTool!=="quad"||e.pointerType==="touch"&&circleTouches.size)return;
  const p=norm(e);createState={pid:e.pointerId,start:p,active:false,moved:false,timer:setTimeout(()=>{if(!createState)return;createState.active=true;showPreview(p.px,p.py,p.px,p.py,false);navigator.vibrate?.(20)},450)};
},{capture:true});
stage.addEventListener("pointermove",e=>{
  if(!createState||createState.pid!==e.pointerId)return;const p=norm(e),d=Math.hypot(p.px-createState.start.px,p.py-createState.start.py);
  if(!createState.active&&d>10){clearTimeout(createState.timer);createState=null;return}
  if(createState?.active){showPreview(createState.start.px,createState.start.py,p.px,p.py,false);e.preventDefault()}
},{capture:true});
function endQuad(e){
  if(!createState||createState.pid!==e.pointerId)return;clearTimeout(createState.timer);
  if(createState.active){const p=norm(e),a=createState.start;if(Math.abs(p.x-a.x)>.04&&Math.abs(p.y-a.y)>.04){G.model.addFace("quad",[{x:Math.min(a.x,p.x),y:Math.min(a.y,p.y)},{x:Math.max(a.x,p.x),y:Math.min(a.y,p.y)},{x:Math.max(a.x,p.x),y:Math.max(a.y,p.y)},{x:Math.min(a.x,p.x),y:Math.max(a.y,p.y)}]);suppressTapUntil=performance.now()+700;setCreate(null)}}
  createState=null;hidePreview();refreshAll()
}
stage.addEventListener("pointerup",endQuad,{capture:true});stage.addEventListener("pointercancel",endQuad,{capture:true});

stage.addEventListener("pointerdown",e=>{
  if(G.state.createTool!=="circle"||e.pointerType==="mouse")return;circleTouches.set(e.pointerId,norm(e));if(circleTouches.size===2)createState={circle:true,started:performance.now(),active:false}
},{capture:true});
stage.addEventListener("pointermove",e=>{
  if(G.state.createTool!=="circle"||!circleTouches.has(e.pointerId))return;circleTouches.set(e.pointerId,norm(e));if(circleTouches.size<2)return;
  const [a,b]=[...circleTouches.values()],d=Math.hypot(b.px-a.px,b.py-a.py),cx=(a.px+b.px)/2,cy=(a.py+b.py)/2;
  if(!createState.active&&performance.now()-createState.started>250&&d>24){createState.active=true;navigator.vibrate?.(20)}
  if(createState.active){showPreview(cx-d/2,cy-d/2,cx+d/2,cy+d/2,true);e.preventDefault()}
},{capture:true});
function endCircle(e){
  if(!circleTouches.has(e.pointerId))return;
  if(createState?.circle&&createState.active&&circleTouches.size>=2){
    const [a,b]=[...circleTouches.values()],r=stage.getBoundingClientRect(),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,dpx=Math.hypot((b.x-a.x)*r.width,(b.y-a.y)*r.height),rx=dpx/2/r.width,ry=dpx/2/r.height;
    if(rx>.03&&ry>.03){G.model.addFace("circle",[{x:cx-rx,y:cy-ry},{x:cx+rx,y:cy-ry},{x:cx+rx,y:cy+ry},{x:cx-rx,y:cy+ry}]);suppressTapUntil=performance.now()+700;setCreate(null)}
  }
  circleTouches.delete(e.pointerId);if(circleTouches.size<2){createState=null;hidePreview();refreshAll()}
}
stage.addEventListener("pointerup",endCircle,{capture:true});stage.addEventListener("pointercancel",endCircle,{capture:true});

/* ---------- perimeter ---------- */
function applyDefaultPerimeter(f){
  if(!f)return;
  f.perimeter={mode:f.shape==="circle"?"ellipse":"quad",points:f.shape==="circle"?G.factory.ellipsePerimeter():G.factory.rectPerimeter()};
}
function resetPerimeter(){
  const f=current();if(!f)return;
  G.history.atomic(()=>applyDefaultPerimeter(f));
}

/* ---------- edges ---------- */
function nearestEdgePair(){
  const f=current(),b=currentBox();if(!f||!b||b.faces.length<2)return null;
  const edges=[[0,1],[1,2],[2,3],[3,0]];let best=null;
  for(const other of b.faces){if(other.id===f.id)continue;
    for(let ea=0;ea<4;ea++)for(let eb=0;eb<4;eb++){
      const A=edges[ea].map(i=>f.points[i]),B=edges[eb].map(i=>other.points[i]);
      const dSame=Math.hypot(A[0].x-B[0].x,A[0].y-B[0].y)+Math.hypot(A[1].x-B[1].x,A[1].y-B[1].y);
      const dRev=Math.hypot(A[0].x-B[1].x,A[0].y-B[1].y)+Math.hypot(A[1].x-B[0].x,A[1].y-B[0].y);
      const score=Math.min(dSame,dRev)/2,rev=dRev<dSame;if(!best||score<best.score)best={other,ea,eb,score,rev}
    }
  }
  return best;
}
function linkNearest(){
  const f=current(),b=currentBox(),n=nearestEdgePair();if(!f||!b||!n)return G.ui.toast("Không có mặt khác để liên kết.");
  if(n.score>.12)return G.ui.toast("Chưa có cạnh nào đủ gần. Hãy căn hai cạnh gần nhau trước.");
  G.history.atomic(()=>{
    b.edgeLinks=b.edgeLinks.filter(l=>!(l.faceA===f.id&&l.edgeA===n.ea)&&!(l.faceB===f.id&&l.edgeB===n.ea));
    b.edgeLinks.push({id:G.uid("LINK"),faceA:f.id,edgeA:n.ea,faceB:n.other.id,edgeB:n.eb,reversed:n.rev});
    const edges=[[0,1],[1,2],[2,3],[3,0]],A=edges[n.ea],B=edges[n.eb];
    n.other.points[B[n.rev?1:0]]=G.clone(f.points[A[0]]);n.other.points[B[n.rev?0:1]]=G.clone(f.points[A[1]]);
    n.other.lastValidPoints=G.clone(n.other.points);
  });
  G.ui.toast("Đã liên kết cạnh chung.");
}
function unlinkFace(){
  const f=current(),b=currentBox();if(!f||!b)return;
  G.history.atomic(()=>b.edgeLinks=b.edgeLinks.filter(l=>l.faceA!==f.id&&l.faceB!==f.id));G.ui.toast("Đã tách các cạnh của mặt.");
}

/* ---------- controls ---------- */
$("btnAddBox").onclick=()=>{G.model.addBox();refreshAll()};
$("btnAddFace").onclick=()=>{G.model.addFace("quad");refreshAll()};
$("modeContinuous").onclick=()=>G.model.setBoxMode("continuous");
$("modeSync").onclick=()=>G.model.setBoxMode("sync");
$("btnPerspective").onclick=()=>{const f=current();if(f){f.editMode="perspective";refreshAll()}};
$("btnPerimeter").onclick=()=>{const f=current();if(f){f.editMode="perimeter";if(f.perimeter.mode==="ellipse")G.ui.toast("Kéo 4 điểm chính để đổi TRÒN thành ELIP. Nhấn giữ mặt/biên để chỉnh nhiều điểm.");refreshAll()}};
$("brightness").oninput=e=>{const f=current();if(f){f.brightness=+e.target.value/100;$("brightnessValue").textContent=e.target.value+"%"}};
$("contentScale").oninput=e=>{const f=current();if(f){f.content.scale=+e.target.value/100;$("scaleValue").textContent=e.target.value+"%"}};
$("contentPanX").oninput=e=>{const f=current();if(f)f.content.panX=+e.target.value/100};
$("contentPanY").oninput=e=>{const f=current();if(f)f.content.panY=+e.target.value/100};
$("contentWeight").oninput=e=>{const f=current();if(f){f.content.weight=+e.target.value/100;$("weightValue").textContent=f.content.weight.toFixed(2)}};
["brightness","contentScale","contentPanX","contentPanY","contentWeight"].forEach(id=>{
  const el=$(id);
  el.addEventListener("pointerdown",()=>G.history.begin());
  el.addEventListener("keydown",()=>G.history.begin());
  el.addEventListener("change",()=>G.history.commit());
  el.addEventListener("pointerup",()=>G.history.commit());
});
$("btnRotate").onclick=()=>{const f=current();if(f)G.history.atomic(()=>f.content.rotation=(f.content.rotation+90)%360)};
$("btnFlipX").onclick=()=>{const f=current();if(f)G.history.atomic(()=>f.content.flipX*=-1)};
$("btnFlipY").onclick=()=>{const f=current();if(f)G.history.atomic(()=>f.content.flipY*=-1)};
$("btnResetContent").onclick=()=>{const f=current();if(f)G.history.atomic(()=>Object.assign(f.content,{scale:1,panX:0,panY:0,rotation:0,flipX:1,flipY:1}))};
$("btnResetFace").onclick=()=>{const f=current(),b=currentBox();if(f&&b)G.history.atomic(()=>{f.points=G.factory.defaultQuad(b.faces.indexOf(f));f.lastValidPoints=G.clone(f.points);applyDefaultPerimeter(f)})};
$("btnLinkNearest").onclick=linkNearest;$("btnUnlinkFace").onclick=unlinkFace;
$("btnToggleGrid").onclick=()=>{G.state.showGuides=!G.state.showGuides;$("btnToggleGrid").textContent=G.state.showGuides?"ẨN ĐƯỜNG BIÊN":"HIỆN ĐƯỜNG BIÊN";drawOverlay()};
$("btnLockFace").onclick=()=>{const f=current();if(f)G.history.atomic(()=>f.locked=!f.locked)};
$("btnHideFace").onclick=()=>{const f=current();if(f)G.history.atomic(()=>f.visible=!f.visible)};
$("btnLayerUp").onclick=()=>{const f=current(),b=currentBox();if(!f||!b)return;G.history.atomic(()=>{const i=b.faces.indexOf(f);if(i<b.faces.length-1)[b.faces[i],b.faces[i+1]]=[b.faces[i+1],b.faces[i]];b.faces.forEach((x,n)=>x.zIndex=n)})};
$("btnLayerDown").onclick=()=>{const f=current(),b=currentBox();if(!f||!b)return;G.history.atomic(()=>{const i=b.faces.indexOf(f);if(i>0)[b.faces[i],b.faces[i-1]]=[b.faces[i-1],b.faces[i]];b.faces.forEach((x,n)=>x.zIndex=n)})};
$("btnDuplicateFace").onclick=()=>G.model.duplicateFace();$("btnDeleteFace").onclick=()=>G.model.deleteFace();$("btnDeleteBox").onclick=()=>G.model.deleteBox();
$("btnUndo").onclick=()=>G.history.undo();$("btnRedo").onclick=()=>G.history.redo();
$("btnSave").onclick=()=>G.persistence.save();$("btnLoad").onclick=()=>G.persistence.load();

$("sourceFile").onchange=e=>{
  const files=[...(e.target.files||[])];files.forEach(f=>G.model.addSourceFile(f));e.target.value="";refreshAll();
};
$("btnAssignBox").onclick=()=>{if(!G.state.selectedSourceId)return G.ui.toast("Chọn một nguồn trước.");G.model.assignSourceToBox(G.state.selectedSourceId);refreshAll()};
$("btnAssignFace").onclick=()=>{if(!G.state.selectedSourceId)return G.ui.toast("Chọn một nguồn trước.");G.model.assignSourceToFace(G.state.selectedSourceId);refreshAll()};
$("btnClearFaceSource").onclick=()=>{G.model.clearFaceSource();refreshAll()};
function selectedRuntime(){
  const id=G.state.selectedSourceId||G.model.effectiveSourceId(current());return id?G.runtime.sources.get(id):null
}
$("btnPlay").onclick=()=>selectedRuntime()?.video?.play().catch(()=>{});
$("btnPause").onclick=()=>selectedRuntime()?.video?.pause();
$("btnRestart").onclick=()=>{const v=selectedRuntime()?.video;if(v){v.pause();try{v.currentTime=0}catch(e){};v.play().catch(()=>{})}};

/* hide/show UI */
function requestFullscreen(){
  if(document.fullscreenElement||matchMedia("(display-mode: fullscreen)").matches||matchMedia("(display-mode: standalone)").matches)return;
  document.documentElement.requestFullscreen?.({navigationUI:"hide"}).catch(()=>{});
}
function hideUI(){requestFullscreen();document.body.classList.add("ui-hidden");document.body.classList.remove("sheet-open");refreshHandles();drawOverlay()}
function showUI(){document.body.classList.remove("ui-hidden");refreshAll()}
$("btnHideUI").onclick=hideUI;
let lastTap=0,lastX=0,lastY=0,suppressTapUntil=0;
document.addEventListener("pointerup",e=>{
  if(performance.now()<suppressTapUntil)return;
  if(e.target.closest("button,input,.control-sheet,.context-menu,.handle,.perimeter-handle,.move-handle"))return;
  const now=performance.now(),near=Math.hypot(e.clientX-lastX,e.clientY-lastY)<60;
  if(now-lastTap<500&&near){document.body.classList.contains("ui-hidden")?showUI():hideUI();lastTap=0;return}
  lastTap=now;lastX=e.clientX;lastY=e.clientY;
},{capture:true});

window.addEventListener("resize",()=>{refreshHandles();drawOverlay()});
window.addEventListener("orientationchange",()=>setTimeout(()=>{document.body.classList.remove("sheet-open");refreshAll()},180));

G.ui.start=()=>{
  if(!G.state.project.boxes.length){const b=G.factory.makeBox(0);G.state.project.boxes.push(b);const f=G.factory.makeFace(b,0,"quad");G.state.selectedBoxId=b.id;G.state.selectedFaceId=f.id}
  refreshAll();openPage("boxes");document.body.classList.remove("sheet-open");
};
})();
