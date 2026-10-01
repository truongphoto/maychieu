(() => {
"use strict";

const $ = id => document.getElementById(id);
const stage = $("stage");
const host = $("stageHost");
const glCanvas = $("glCanvas");
const gridCanvas = $("gridCanvas");
const handleLayer = $("handleLayer");

const gl = glCanvas.getContext("webgl", {
  alpha:false,
  antialias:true,
  preserveDrawingBuffer:false,
  powerPreference:"high-performance"
});
if(!gl){
  alert("Thiết bị/trình duyệt không hỗ trợ WebGL.");
  return;
}

/* =========================================================
   V1.2.3 DATA CORE
   Project -> Box -> Face -> Source
   ========================================================= */
const SCHEMA_VERSION = 2;
const PROJECT_KEY = "gpp-can-chieu-project-v2";
const LEGACY_KEY = "gpp-v11-mz";
const SETTINGS_KEY = "gpp-v111-settings";

function makeId(prefix){
  if(window.crypto && crypto.randomUUID){
    return prefix + "_" + crypto.randomUUID();
  }
  return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,10);
}

const colors = ["#00d9ff","#39ffc2","#ffd166","#ff7aa2","#8ea1ff","#d19cff","#64ffda","#ff9f5a"];

function makeProject(){
  return {
    schemaVersion:SCHEMA_VERSION,
    id:makeId("PROJECT"),
    name:"Dự án GPP",
    boxes:[],
    sources:[]
  };
}
function makeBox(index=0){
  return {
    id:makeId("BOX"),
    name:`HỘP ${index+1}`,
    sourceId:null,
    displayMode:"sync",       // future: sync / continuous
    faceOrder:[],
    faces:[]
  };
}
function defaultPoints(i=0){
  const o=(i%4)*0.025;
  return [
    {x:.10+o,y:.12+o},
    {x:.55+o,y:.12+o},
    {x:.55+o,y:.55+o},
    {x:.10+o,y:.55+o}
  ];
}
function makeFace(box,index=0){
  const id=makeId("FACE");
  const face={
    id,
    name:`MẶT ${index+1}`,
    shape:"quad",
    points:defaultPoints(index),       // 4 điểm PHỐI CẢNH nền
    lastValidPoints:null,
    perimeter:{
      type:"quad",                     // future: ellipse / perimeter
      points:[],
      protectedCount:4
    },
    content:{
      fit:"cover",
      panX:0,
      panY:0,
      scale:1,
      rotation:0,
      flipX:1,
      flipY:1
    },
    sourceId:null,                     // override nguồn HỘP nếu khác null
    visible:true,
    locked:false,
    brightness:1,
    color:colors[index%colors.length],
    zIndex:index
  };
  face.lastValidPoints=face.points.map(p=>({...p}));
  box.faceOrder.push(id);
  box.faces.push(face);
  return face;
}

let project=makeProject();
let selectedBoxId=null;
let selectedFaceId=null;
let selectedPointId=null;
let logicalW=1600, logicalH=900;
let showGrid=true;

/* -------- Runtime Source Manager --------
   Dữ liệu serializable ở project.sources.
   Runtime media/texture tách riêng, không lưu vào localStorage.
*/
const sourceRuntime = new Map();

function sourceMeta(id){
  return project.sources.find(s=>s.id===id)||null;
}
function activeBox(){
  return project.boxes.find(b=>b.id===selectedBoxId)||null;
}
function allFaces(){
  return project.boxes.flatMap(b=>b.faces);
}
function current(){
  const b=activeBox();
  return b ? (b.faces.find(f=>f.id===selectedFaceId)||null) : null;
}
function boxOfFace(faceId){
  return project.boxes.find(b=>b.faces.some(f=>f.id===faceId))||null;
}
function effectiveSourceId(face){
  if(!face) return null;
  if(face.sourceId) return face.sourceId;
  const b=boxOfFace(face.id);
  return b?.sourceId || null;
}
function effectiveRuntime(face){
  const id=effectiveSourceId(face);
  return id ? (sourceRuntime.get(id)||null) : null;
}
function effectiveMeta(face){
  const id=effectiveSourceId(face);
  return id ? sourceMeta(id) : null;
}
function createTexture(){
  const t=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  return t;
}
function sourceRefCount(sourceId){
  let n=0;
  project.boxes.forEach(b=>{
    if(b.sourceId===sourceId) n++;
    b.faces.forEach(f=>{ if(f.sourceId===sourceId) n++; });
  });
  return n;
}
function releaseSourceIfUnused(sourceId){
  if(!sourceId || sourceRefCount(sourceId)>0) return;
  const rt=sourceRuntime.get(sourceId);
  if(rt){
    try{ if(rt.objectUrl) URL.revokeObjectURL(rt.objectUrl); }catch(e){}
    try{ if(rt.texture) gl.deleteTexture(rt.texture); }catch(e){}
    try{ if(rt.video){rt.video.pause();rt.video.removeAttribute("src");rt.video.load();} }catch(e){}
  }
  sourceRuntime.delete(sourceId);
  project.sources=project.sources.filter(s=>s.id!==sourceId);
}
function createSourceFromFile(file){
  const id=makeId("SRC");
  const meta={
    id,
    name:file.name,
    type:file.type.startsWith("video/") ? "video" : "image",
    mime:file.type||"",
    size:file.size||0,
    lastModified:file.lastModified||0
  };
  project.sources.push(meta);

  const rt={
    id,
    objectUrl:URL.createObjectURL(file),
    texture:createTexture(),
    image:null,
    video:null,
    ready:false
  };
  sourceRuntime.set(id,rt);

  if(meta.type==="image"){
    const img=new Image();
    rt.image=img;
    img.onload=()=>{rt.ready=true;refreshUI();};
    img.onerror=()=>{rt.ready=false;refreshUI();};
    img.src=rt.objectUrl;
  }else{
    const v=document.createElement("video");
    rt.video=v;
    v.src=rt.objectUrl;
    v.loop=true;
    v.playsInline=true;
    v.preload="metadata";
    v.muted=true;
    v.onloadeddata=()=>{
      rt.ready=true;
      v.play().catch(()=>{});
      refreshUI();
    };
    v.onerror=()=>{rt.ready=false;refreshUI();};
    v.load();
  }
  return id;
}

/* =========================================================
   Geometry validation
   ========================================================= */
function clonePoints(points){return points.map(p=>({x:p.x,y:p.y}));}
function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function segIntersect(a,b,c,d){
  const o1=cross(a,b,c),o2=cross(a,b,d),o3=cross(c,d,a),o4=cross(c,d,b);
  return (o1*o2<0 && o3*o4<0);
}
function polygonArea(points){
  let a=0;
  for(let i=0;i<points.length;i++){
    const p=points[i],q=points[(i+1)%points.length];
    a+=p.x*q.y-q.x*p.y;
  }
  return Math.abs(a)/2;
}
function validQuad(points){
  if(!points || points.length!==4) return false;
  if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) return false;
  if(polygonArea(points)<0.00015) return false;
  if(segIntersect(points[0],points[1],points[2],points[3])) return false;
  if(segIntersect(points[1],points[2],points[3],points[0])) return false;
  return true;
}
function commitPoints(face,newPoints){
  if(validQuad(newPoints)){
    face.points=clonePoints(newPoints);
    face.lastValidPoints=clonePoints(newPoints);
    return true;
  }
  return false;
}

/* =========================================================
   Stage
   ========================================================= */
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
  if(glCanvas.width!==w||glCanvas.height!==h){
    glCanvas.width=w; glCanvas.height=h;
    gridCanvas.width=w; gridCanvas.height=h;
    gl.viewport(0,0,w,h);
  }
}

/* =========================================================
   Box / Face operations
   ========================================================= */
function ensureDefaultBox(){
  if(!project.boxes.length){
    const b=makeBox(0);
    project.boxes.push(b);
    selectedBoxId=b.id;
  }
  if(!selectedBoxId || !project.boxes.some(b=>b.id===selectedBoxId)){
    selectedBoxId=project.boxes[0].id;
  }
  return activeBox();
}
function addFace(copy=null){
  const box=ensureDefaultBox();
  const f=makeFace(box,box.faces.length);

  if(copy){
    f.shape=copy.shape||"quad";
    const shifted=copy.points.map(p=>({x:Math.min(.98,p.x+.03),y:Math.min(.98,p.y+.03)}));
    commitPoints(f,shifted);
    f.brightness=copy.brightness;
    f.content=JSON.parse(JSON.stringify(copy.content||f.content));
    f.sourceId=copy.sourceId||null; // dùng chung source -> 1 decoder/texture
  }
  selectedBoxId=box.id;
  selectedFaceId=f.id;
  selectedPointId=null;
  refreshUI();
  return f;
}
function deleteFace(faceId){
  const box=boxOfFace(faceId);
  if(!box) return false;
  if(box.faces.length<=1){
    alert("Phải giữ lại ít nhất 1 mặt trong hộp hiện tại.");
    return false;
  }
  const i=box.faces.findIndex(f=>f.id===faceId);
  const face=box.faces[i];
  const oldSource=face.sourceId;
  box.faces.splice(i,1);
  box.faceOrder=box.faceOrder.filter(id=>id!==faceId);
  if(selectedFaceId===faceId){
    const next=box.faces[Math.min(i,box.faces.length-1)];
    selectedFaceId=next?.id||null;
    selectedPointId=null;
  }
  releaseSourceIfUnused(oldSource);
  refreshUI();
  return true;
}

/* =========================================================
   WebGL
   ========================================================= */
const vs=`
attribute vec2 a_position;
attribute vec2 a_texcoord;
uniform mat3 u_matrix;
varying vec2 v_texcoord;
void main(){
  vec3 p=u_matrix*vec3(a_position,1.0);
  gl_Position=vec4(p.xy/p.z,0.0,1.0);
  v_texcoord=a_texcoord;
}`;
const fs=`
precision mediump float;
varying vec2 v_texcoord;
uniform sampler2D u_texture;
uniform float u_brightness;
uniform mat3 u_uv;
uniform float u_shape;
void main(){
  vec3 q=u_uv*vec3(v_texcoord,1.0);
  vec2 uv=q.xy;

  // Mask TRÒN/ELIP nằm trong local face space,
  // sau đó toàn mặt mới chịu homography.
  if(u_shape>0.5){
    vec2 d=uv-vec2(0.5);
    if(dot(d,d)>0.25) discard;
  }

  vec4 c=texture2D(u_texture,uv);
  gl_FragColor=vec4(c.rgb*u_brightness,c.a);
}`;
function compileShader(type,src){
  const s=gl.createShader(type);
  gl.shaderSource(s,src);
  gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
    throw new Error(gl.getShaderInfoLog(s)||"Shader compile error");
  }
  return s;
}
const prog=gl.createProgram();
gl.attachShader(prog,compileShader(gl.VERTEX_SHADER,vs));
gl.attachShader(prog,compileShader(gl.FRAGMENT_SHADER,fs));
gl.linkProgram(prog);
if(!gl.getProgramParameter(prog,gl.LINK_STATUS)){
  throw new Error(gl.getProgramInfoLog(prog)||"WebGL link error");
}
gl.useProgram(prog);

const posLoc=gl.getAttribLocation(prog,"a_position");
const uvLoc=gl.getAttribLocation(prog,"a_texcoord");
const mLoc=gl.getUniformLocation(prog,"u_matrix");
const uvMLoc=gl.getUniformLocation(prog,"u_uv");
const bLoc=gl.getUniformLocation(prog,"u_brightness");
const shapeLoc=gl.getUniformLocation(prog,"u_shape");

const quadData=new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]);
const pb=gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER,pb);
gl.bufferData(gl.ARRAY_BUFFER,quadData,gl.STATIC_DRAW);
gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(posLoc,2,gl.FLOAT,false,0,0);

const ub=gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER,ub);
gl.bufferData(gl.ARRAY_BUFFER,quadData,gl.STATIC_DRAW);
gl.enableVertexAttribArray(uvLoc);
gl.vertexAttribPointer(uvLoc,2,gl.FLOAT,false,0,0);

function solve(A,b){
  const n=b.length;
  for(let i=0;i<n;i++){
    let m=i;
    for(let j=i+1;j<n;j++) if(Math.abs(A[j][i])>Math.abs(A[m][i]))m=j;
    [A[i],A[m]]=[A[m],A[i]];
    [b[i],b[m]]=[b[m],b[i]];
    const p=A[i][i];
    if(Math.abs(p)<1e-12) throw new Error("Ma trận phối cảnh suy biến");
    for(let j=i+1;j<n;j++){
      const f=A[j][i]/p;
      for(let k=i;k<n;k++)A[j][k]-=f*A[i][k];
      b[j]-=f*b[i];
    }
  }
  const x=new Array(n).fill(0);
  for(let i=n-1;i>=0;i--){
    let s=b[i];
    for(let j=i+1;j<n;j++)s-=A[i][j]*x[j];
    const d=A[i][i];
    if(Math.abs(d)<1e-12) throw new Error("Ma trận phối cảnh suy biến");
    x[i]=s/d;
  }
  return x;
}
function H(src,dst){
  const A=[],b=[];
  for(let i=0;i<4;i++){
    const [x,y]=src[i],[u,v]=dst[i];
    A.push([x,y,1,0,0,0,-u*x,-u*y]); b.push(u);
    A.push([0,0,0,x,y,1,-v*x,-v*y]); b.push(v);
  }
  const h=solve(A,b);
  return [h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1];
}
function glH(h){
  return new Float32Array([h[0],h[3],h[6],h[1],h[4],h[7],h[2],h[5],h[8]]);
}
function uvMat(face){
  const cdata=face.content||{};
  const r=(cdata.rotation||0)*Math.PI/180;
  const c=Math.cos(r),s=Math.sin(r),cx=.5,cy=.5;
  const fx=cdata.flipX??1, fy=cdata.flipY??1;
  const scale=Math.max(.05,cdata.scale||1);
  const m00=(c*fx)/scale, m01=(-s*fy)/scale;
  const m10=(s*fx)/scale, m11=(c*fy)/scale;
  const panX=cdata.panX||0, panY=cdata.panY||0;
  const tx=cx-m00*cx-m01*cy+panX;
  const ty=cy-m10*cx-m11*cy+panY;
  return new Float32Array([m00,m10,0,m01,m11,0,tx,ty,1]);
}

function uploadSourceOnce(rt,uploaded){
  if(!rt || !rt.ready || uploaded.has(rt.id)) return;
  gl.bindTexture(gl.TEXTURE_2D,rt.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  if(rt.image){
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,rt.image);
  }else if(rt.video && rt.video.readyState>=2){
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,rt.video);
  }else return;
  uploaded.add(rt.id);
}

function render(){
  requestAnimationFrame(render);
  if(document.hidden) return;
  resizeCanvases();
  gl.clearColor(0,0,0,1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(prog);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);

  const uploaded=new Set();

  const faces=allFaces().filter(f=>f.visible).sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
  faces.forEach(face=>{
    const rt=effectiveRuntime(face);
    if(!rt || !rt.ready) return;

    const pts=validQuad(face.points) ? face.points : face.lastValidPoints;
    if(!pts || !validQuad(pts)) return;

    try{
      uploadSourceOnce(rt,uploaded);
      const dst=pts.map(p=>[p.x*2-1,1-p.y*2]);
      const h=H([[0,1],[1,1],[1,0],[0,0]],dst);

      gl.uniformMatrix3fv(mLoc,false,glH(h));
      gl.uniformMatrix3fv(uvMLoc,false,uvMat(face));
      gl.uniform1f(bLoc,face.brightness);
      gl.uniform1f(shapeLoc,face.shape==="circle"?1.0:0.0);
      gl.bindTexture(gl.TEXTURE_2D,rt.texture);
      gl.drawArrays(gl.TRIANGLES,0,6);
    }catch(e){
      // giữ frame ổn định thay vì làm app dừng vì một mặt lỗi.
    }
  });
}

/* =========================================================
   UI
   ========================================================= */
function faceLabel(face){
  const meta=effectiveMeta(face);
  if(meta) return meta.name;
  if(face.sourceId || boxOfFace(face.id)?.sourceId) return "Cần chọn lại nguồn";
  return "Chưa có nguồn";
}
function refreshUI(){
  const list=$("zoneList");
  list.innerHTML="";
  const box=ensureDefaultBox();

  box.faces.forEach(face=>{
    const d=document.createElement("div");
    d.className="zone-item"+(face.id===selectedFaceId?" active":"");

    const main=document.createElement("div");
    main.className="zone-main";
    main.innerHTML=`<div class="zone-name">${face.name}</div><div class="zone-meta">${faceLabel(face)}</div>`;
    main.onclick=()=>{
      selectedBoxId=box.id;
      selectedFaceId=face.id;
      selectedPointId=null;
      refreshUI();
    };

    const actions=document.createElement("div");
    actions.className="zone-actions";

    const vis=document.createElement("button");
    vis.className="zone-action";
    vis.textContent=face.visible?"ẨN":"HIỆN";
    vis.onclick=e=>{
      e.stopPropagation();
      face.visible=!face.visible;
      selectedFaceId=face.id;
      refreshUI();
    };

    const del=document.createElement("button");
    del.className="zone-action delete";
    del.textContent="XÓA";
    del.onclick=e=>{
      e.stopPropagation();
      deleteFace(face.id);
    };

    actions.append(vis,del);
    d.append(main,actions);
    list.appendChild(d);
  });

  $("emptyHint").style.display=allFaces().length?"none":"flex";

  const face=current();
  if(face){
    $("brightness").value=Math.round(face.brightness*100);
    $("btnLock").textContent=face.locked?"MỞ KHÓA":"KHÓA";
    $("btnVisible").textContent=face.visible?"ẨN KHUNG":"HIỆN KHUNG";
    $("fileInfo").textContent=faceLabel(face);
  }else{
    $("fileInfo").textContent="Chưa chọn mặt";
  }
  refreshHandles();
  queueGridDraw();
}

/* =========================================================
   Handles
   ========================================================= */
let handleEls=[];
let moveHandle=null;
let dragging=null;
let movingFace=null;
let gridDrawQueued=false;

function queueGridDraw(){
  if(gridDrawQueued)return;
  gridDrawQueued=true;
  requestAnimationFrame(()=>{
    gridDrawQueued=false;
    drawGrid();
  });
}
function displayHandlePoints(face){
  if(face.shape!=="circle") return face.points;
  const tl=face.points[0],tr=face.points[1],br=face.points[2],bl=face.points[3];
  const cx=(tl.x+br.x)/2,cy=(tl.y+br.y)/2;
  return [
    {x:cx,y:tl.y},
    {x:tr.x,y:cy},
    {x:cx,y:br.y},
    {x:tl.x,y:cy}
  ];
}
function buildHandles(){
  handleLayer.innerHTML="";
  handleEls=[];

  for(let i=0;i<4;i++){
    const h=document.createElement("button");
    h.className="handle";
    h.dataset.i=String(i);

    h.addEventListener("pointerdown",e=>{
      const face=current();
      if(!face||face.locked)return;
      selectedPointId=i;
      dragging={faceId:face.id,i,pointerId:e.pointerId,start:clonePoints(face.points)};
      h.setPointerCapture(e.pointerId);
      h.classList.add("active");
      e.preventDefault();e.stopPropagation();
    });

    h.addEventListener("pointermove",e=>{
      const face=current();
      if(!face||!dragging||dragging.faceId!==face.id||dragging.i!==i||face.locked)return;
      const rr=stage.getBoundingClientRect();
      const nx=Math.max(0,Math.min(1,(e.clientX-rr.left)/rr.width));
      const ny=Math.max(0,Math.min(1,(e.clientY-rr.top)/rr.height));
      const np=clonePoints(face.points);

      if(face.shape==="circle"){
        if(i===0){np[0].y=ny;np[1].y=ny;}
        if(i===1){np[1].x=nx;np[2].x=nx;}
        if(i===2){np[2].y=ny;np[3].y=ny;}
        if(i===3){np[0].x=nx;np[3].x=nx;}
      }else{
        np[i].x=nx; np[i].y=ny;
      }

      if(commitPoints(face,np)){
        refreshHandles();
        queueGridDraw();
      }
      e.preventDefault();e.stopPropagation();
    });

    const end=e=>{
      if(dragging&&dragging.i===i){
        dragging=null;
        h.classList.remove("active");
        refreshHandles();
        queueGridDraw();
      }
    };
    h.addEventListener("pointerup",end);
    h.addEventListener("pointercancel",end);
    h.addEventListener("lostpointercapture",end);

    handleLayer.appendChild(h);
    handleEls.push(h);
  }

  moveHandle=document.createElement("button");
  moveHandle.className="move-handle";
  moveHandle.type="button";
  moveHandle.textContent="✥";
  moveHandle.title="Giữ và kéo để di chuyển cả mặt";

  moveHandle.addEventListener("pointerdown",e=>{
    const face=current();
    if(!face||face.locked)return;
    const rr=stage.getBoundingClientRect();
    movingFace={
      faceId:face.id,
      pointerId:e.pointerId,
      startX:e.clientX,startY:e.clientY,
      startPoints:clonePoints(face.points),
      width:rr.width,height:rr.height
    };
    moveHandle.setPointerCapture(e.pointerId);
    moveHandle.classList.add("dragging");
    selectedPointId=null;
    e.preventDefault();e.stopPropagation();
  });

  moveHandle.addEventListener("pointermove",e=>{
    const face=current();
    if(!face||!movingFace||movingFace.faceId!==face.id||face.locked)return;
    let dx=(e.clientX-movingFace.startX)/movingFace.width;
    let dy=(e.clientY-movingFace.startY)/movingFace.height;
    const xs=movingFace.startPoints.map(p=>p.x),ys=movingFace.startPoints.map(p=>p.y);
    dx=Math.max(-Math.min(...xs),Math.min(1-Math.max(...xs),dx));
    dy=Math.max(-Math.min(...ys),Math.min(1-Math.max(...ys),dy));
    const np=movingFace.startPoints.map(p=>({x:p.x+dx,y:p.y+dy}));
    if(commitPoints(face,np)){
      refreshHandles();
      queueGridDraw();
    }
    e.preventDefault();e.stopPropagation();
  });

  const endMove=()=>{
    if(movingFace){
      movingFace=null;
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
  const face=current();
  if(!moveHandle)return;
  if(!face||document.body.classList.contains("ui-hidden")){
    moveHandle.style.display="none";return;
  }
  const r=stage.getBoundingClientRect();
  const cx=face.points.reduce((s,p)=>s+p.x,0)/4;
  const cy=face.points.reduce((s,p)=>s+p.y,0)/4;
  moveHandle.style.display="block";
  moveHandle.style.left=(cx*r.width)+"px";
  moveHandle.style.top=(cy*r.height)+"px";
  moveHandle.style.opacity=face.locked?".45":"1";
}
function refreshHandles(){
  const face=current();
  if(!handleEls.length)buildHandles();
  if(!face||document.body.classList.contains("ui-hidden")){
    handleEls.forEach(h=>h.style.display="none");
    if(moveHandle)moveHandle.style.display="none";
    return;
  }
  const r=stage.getBoundingClientRect();
  const pts=displayHandlePoints(face);
  handleEls.forEach((h,i)=>{
    h.style.display="block";
    h.style.background=face.color;
    h.style.left=(pts[i].x*r.width)+"px";
    h.style.top=(pts[i].y*r.height)+"px";
    h.style.opacity=face.locked?".5":"1";
    h.classList.toggle("circle-handle",face.shape==="circle");
    h.classList.toggle("active",selectedPointId===i&&!!dragging);
  });
  refreshMoveHandle();
}
function drawGrid(){
  const ctx=gridCanvas.getContext("2d");
  const r=stage.getBoundingClientRect(),dpr=gridCanvas.width/Math.max(1,r.width);
  ctx.clearRect(0,0,gridCanvas.width,gridCanvas.height);
  if(!showGrid||document.body.classList.contains("ui-hidden"))return;
  ctx.save();ctx.scale(dpr,dpr);

  allFaces().forEach(face=>{
    if(!face.visible)return;
    const p=face.points.map(q=>({x:q.x*r.width,y:q.y*r.height}));
    ctx.strokeStyle=face.id===selectedFaceId?face.color:"rgba(130,180,200,.35)";
    ctx.lineWidth=face.id===selectedFaceId?1.6:1;

    if(face.shape==="circle"){
      const left=Math.min(...p.map(q=>q.x)),right=Math.max(...p.map(q=>q.x));
      const top=Math.min(...p.map(q=>q.y)),bottom=Math.max(...p.map(q=>q.y));
      ctx.beginPath();
      ctx.ellipse((left+right)/2,(top+bottom)/2,(right-left)/2,(bottom-top)/2,0,0,Math.PI*2);
      ctx.stroke();
    }else{
      ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);
      p.slice(1).forEach(q=>ctx.lineTo(q.x,q.y));
      ctx.closePath();ctx.stroke();
    }

    if(face.id===selectedFaceId && face.shape!=="circle"){
      const n=dragging?4:8;
      ctx.strokeStyle="rgba(0,217,255,.22)";
      ctx.lineWidth=1;
      for(let i=1;i<n;i++){
        const t=i/n;
        let a={x:p[0].x+(p[3].x-p[0].x)*t,y:p[0].y+(p[3].y-p[0].y)*t};
        let b={x:p[1].x+(p[2].x-p[1].x)*t,y:p[1].y+(p[2].y-p[1].y)*t};
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
        a={x:p[0].x+(p[1].x-p[0].x)*t,y:p[0].y+(p[1].y-p[0].y)*t};
        b={x:p[3].x+(p[2].x-p[3].x)*t,y:p[3].y+(p[2].y-p[3].y)*t};
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      }
    }
  });
  ctx.restore();
}

/* =========================================================
   Controls
   ========================================================= */
$("btnAddZone").onclick=()=>addFace();

$("fileInput").onchange=e=>{
  const face=current(),file=e.target.files?.[0];
  if(!face||!file)return;
  const old=face.sourceId;
  const id=createSourceFromFile(file);
  face.sourceId=id;
  releaseSourceIfUnused(old);
  refreshUI();
  e.target.value="";
};

$("btnPlay").onclick=()=>{
  const rt=effectiveRuntime(current());
  if(rt?.video)rt.video.play().catch(()=>{});
};
$("btnPause").onclick=()=>{
  const rt=effectiveRuntime(current());
  if(rt?.video)rt.video.pause();
};
$("btnStop").onclick=()=>{
  const rt=effectiveRuntime(current());
  if(rt?.video){rt.video.pause();try{rt.video.currentTime=0}catch(e){}}
};
$("brightness").oninput=e=>{
  const face=current();if(face)face.brightness=+e.target.value/100;
};
$("btnRotate").onclick=()=>{
  const face=current();if(face)face.content.rotation=(face.content.rotation+90)%360;
};
$("btnFlipX").onclick=()=>{
  const face=current();if(face)face.content.flipX*=-1;
};
$("btnFlipY").onclick=()=>{
  const face=current();if(face)face.content.flipY*=-1;
};
$("btnLock").onclick=()=>{
  const face=current();if(face){face.locked=!face.locked;refreshUI();}
};
$("btnVisible").onclick=()=>{
  const face=current();if(face){face.visible=!face.visible;refreshUI();}
};
$("btnResetZone").onclick=()=>{
  const face=current(),box=activeBox();
  if(face&&box){
    commitPoints(face,defaultPoints(box.faces.indexOf(face)));
    face.content.rotation=0;face.content.flipX=1;face.content.flipY=1;
    refreshUI();
  }
};
$("btnDuplicate").onclick=()=>{
  const face=current();if(face)addFace(face);
};
$("btnDelete").onclick=()=>{
  const face=current();if(face)deleteFace(face.id);
};
$("btnLayerUp").onclick=()=>{
  const box=activeBox(),face=current();if(!box||!face)return;
  const i=box.faces.findIndex(f=>f.id===face.id);
  if(i<box.faces.length-1){
    [box.faces[i],box.faces[i+1]]=[box.faces[i+1],box.faces[i]];
    box.faces.forEach((f,n)=>f.zIndex=n);
    refreshUI();
  }
};
$("btnLayerDown").onclick=()=>{
  const box=activeBox(),face=current();if(!box||!face)return;
  const i=box.faces.findIndex(f=>f.id===face.id);
  if(i>0){
    [box.faces[i],box.faces[i-1]]=[box.faces[i-1],box.faces[i]];
    box.faces.forEach((f,n)=>f.zIndex=n);
    refreshUI();
  }
};
$("btnToggleGrid").onclick=()=>{
  showGrid=!showGrid;
  $("btnToggleGrid").textContent=showGrid?"ẨN LƯỚI":"HIỆN LƯỚI";
  drawGrid();
};

/* =========================================================
   Save / Load / Migration
   ========================================================= */
function serializableProject(){
  return {
    schemaVersion:SCHEMA_VERSION,
    id:project.id,
    name:project.name,
    sources:project.sources.map(s=>({...s})),
    boxes:project.boxes.map(b=>({
      id:b.id,name:b.name,sourceId:b.sourceId,displayMode:b.displayMode,
      faceOrder:[...b.faceOrder],
      faces:b.faces.map(f=>({
        id:f.id,name:f.name,shape:f.shape,
        points:clonePoints(f.points),
        lastValidPoints:clonePoints(f.lastValidPoints||f.points),
        perimeter:JSON.parse(JSON.stringify(f.perimeter)),
        content:JSON.parse(JSON.stringify(f.content)),
        sourceId:f.sourceId,
        visible:f.visible,locked:f.locked,brightness:f.brightness,
        color:f.color,zIndex:f.zIndex
      }))
    }))
  };
}
function normalizeLoadedProject(data){
  if(!data || data.schemaVersion!==SCHEMA_VERSION || !Array.isArray(data.boxes)) return null;
  const out=makeProject();
  out.id=data.id||makeId("PROJECT");
  out.name=data.name||"Dự án GPP";
  out.sources=Array.isArray(data.sources)?data.sources.map(s=>({...s})):[];
  out.boxes=data.boxes.map((b,bi)=>{
    const nb=makeBox(bi);
    nb.id=b.id||makeId("BOX");
    nb.name=b.name||`HỘP ${bi+1}`;
    nb.sourceId=b.sourceId||null;
    nb.displayMode=b.displayMode||"sync";
    nb.faces=[];
    nb.faceOrder=[];
    (b.faces||[]).forEach((f,fi)=>{
      const nf=makeFace(nb,fi);
      nf.id=f.id||makeId("FACE");
      nf.name=f.name||`MẶT ${fi+1}`;
      nf.shape=f.shape||"quad";
      nf.points=validQuad(f.points)?clonePoints(f.points):defaultPoints(fi);
      nf.lastValidPoints=validQuad(f.lastValidPoints)?clonePoints(f.lastValidPoints):clonePoints(nf.points);
      nf.perimeter=f.perimeter||{type:nf.shape==="circle"?"ellipse":"quad",points:[],protectedCount:4};
      nf.content=Object.assign({fit:"cover",panX:0,panY:0,scale:1,rotation:0,flipX:1,flipY:1},f.content||{});
      nf.sourceId=f.sourceId||null;
      nf.visible=f.visible!==false;
      nf.locked=!!f.locked;
      nf.brightness=Number.isFinite(f.brightness)?f.brightness:1;
      nf.color=f.color||colors[fi%colors.length];
      nf.zIndex=Number.isFinite(f.zIndex)?f.zIndex:fi;
      // makeFace đã push id cũ; sửa lại
      nb.faceOrder[nb.faceOrder.length-1]=nf.id;
    });
    if(!nb.faces.length) makeFace(nb,0);
    if(Array.isArray(b.faceOrder) && b.faceOrder.length){
      const validIds=new Set(nb.faces.map(f=>f.id));
      nb.faceOrder=b.faceOrder.filter(id=>validIds.has(id));
      nb.faces.forEach(f=>{if(!nb.faceOrder.includes(f.id))nb.faceOrder.push(f.id);});
    }
    return nb;
  });
  if(!out.boxes.length){
    const b=makeBox(0);out.boxes.push(b);makeFace(b,0);
  }
  return out;
}
function migrateLegacy(){
  const raw=localStorage.getItem(LEGACY_KEY);
  if(!raw)return null;
  try{
    const legacy=JSON.parse(raw);
    if(!Array.isArray(legacy.zones))return null;
    const p=makeProject(),b=makeBox(0);
    p.boxes.push(b);
    legacy.zones.forEach((z,i)=>{
      const f=makeFace(b,i);
      f.name=z.name?z.name.replace(/^KHUNG/i,"MẶT"):`MẶT ${i+1}`;
      f.points=validQuad(z.points)?clonePoints(z.points):defaultPoints(i);
      f.lastValidPoints=clonePoints(f.points);
      f.visible=z.visible!==false;
      f.locked=!!z.locked;
      f.brightness=Number.isFinite(z.brightness)?z.brightness:1;
      f.content.rotation=z.rotation||0;
      f.content.flipX=z.flipX||1;
      f.content.flipY=z.flipY||1;
      f.shape=z.shape||"quad";
    });
    if(!b.faces.length)makeFace(b,0);
    return p;
  }catch(e){return null;}
}
$("btnSave").onclick=()=>{
  localStorage.setItem(PROJECT_KEY,JSON.stringify(serializableProject()));
  $("fileInfo").textContent="Đã lưu cấu trúc dự án. Ảnh/video cục bộ cần chọn lại sau khi mở lại.";
};
$("btnLoad").onclick=()=>{
  try{
    let loaded=null;
    const raw=localStorage.getItem(PROJECT_KEY);
    if(raw)loaded=normalizeLoadedProject(JSON.parse(raw));
    if(!loaded)loaded=migrateLegacy();
    if(!loaded)return;

    // runtime media hiện tại giải phóng sạch
    for(const [id,rt] of sourceRuntime){
      try{if(rt.objectUrl)URL.revokeObjectURL(rt.objectUrl)}catch(e){}
      try{if(rt.texture)gl.deleteTexture(rt.texture)}catch(e){}
      try{if(rt.video)rt.video.pause()}catch(e){}
    }
    sourceRuntime.clear();

    project=loaded;
    selectedBoxId=project.boxes[0].id;
    selectedFaceId=project.boxes[0].faces[0].id;
    selectedPointId=null;
    fitStage();refreshUI();
    $("fileInfo").textContent="Đã mở cấu hình. Chọn lại ảnh/video cục bộ khi cần.";
  }catch(e){
    alert("Không mở được cấu hình.");
  }
};

/* =========================================================
   Keyboard
   ========================================================= */
window.addEventListener("keydown",e=>{
  const face=current();
  if(!face||face.locked||selectedPointId===null)return;
  const step=e.shiftKey?10:1,rx=step/logicalW,ry=step/logicalH;
  const np=clonePoints(face.points);

  if(face.shape==="circle"){
    if(e.key==="ArrowUp"&&selectedPointId===0){np[0].y-=ry;np[1].y-=ry;}
    else if(e.key==="ArrowDown"&&selectedPointId===0){np[0].y+=ry;np[1].y+=ry;}
    else if(e.key==="ArrowRight"&&selectedPointId===1){np[1].x+=rx;np[2].x+=rx;}
    else if(e.key==="ArrowLeft"&&selectedPointId===1){np[1].x-=rx;np[2].x-=rx;}
    else if(e.key==="ArrowDown"&&selectedPointId===2){np[2].y+=ry;np[3].y+=ry;}
    else if(e.key==="ArrowUp"&&selectedPointId===2){np[2].y-=ry;np[3].y-=ry;}
    else if(e.key==="ArrowLeft"&&selectedPointId===3){np[0].x-=rx;np[3].x-=rx;}
    else if(e.key==="ArrowRight"&&selectedPointId===3){np[0].x+=rx;np[3].x+=rx;}
    else return;
  }else{
    const p=np[selectedPointId];
    if(e.key==="ArrowLeft")p.x-=rx;
    else if(e.key==="ArrowRight")p.x+=rx;
    else if(e.key==="ArrowUp")p.y-=ry;
    else if(e.key==="ArrowDown")p.y+=ry;
    else return;
  }
  np.forEach(p=>{p.x=Math.max(0,Math.min(1,p.x));p.y=Math.max(0,Math.min(1,p.y));});
  if(commitPoints(face,np)){refreshHandles();queueGridDraw();}
  e.preventDefault();
});

/* =========================================================
   Settings
   ========================================================= */
function loadAppSettings(){
  try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||"null")}catch(e){return null}
}
function refreshSetupButton(){
  const has=!!loadAppSettings();
  $("btnSetup").textContent="CẤU HÌNH";
  $("btnSetup").classList.toggle("has-config",has);
}
function openSettings(){
  const s=loadAppSettings()||{profileName:"Cấu hình mặc định",screenRatio:"16:9"};
  $("profileName").value=s.profileName||"Cấu hình mặc định";
  $("screenRatio").value=s.screenRatio||"16:9";
  $("settingsModal").hidden=false;
}
function closeSettings(){$("settingsModal").hidden=true;}
$("btnSetup").onclick=openSettings;
$("btnCloseSettings").onclick=closeSettings;
$("btnCancelSettings").onclick=closeSettings;
$("settingsModal").addEventListener("click",e=>{if(e.target===$("settingsModal"))closeSettings();});
$("btnSaveSettings").onclick=()=>{
  const s={profileName:$("profileName").value.trim()||"Cấu hình mặc định",screenRatio:$("screenRatio").value};
  localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));
  if(s.screenRatio==="16:9"){logicalW=1600;logicalH=900;}
  else if(s.screenRatio==="16:10"){logicalW=1600;logicalH=1000;}
  else {logicalW=1600;logicalH=1200;}
  fitStage();closeSettings();refreshSetupButton();
};
refreshSetupButton();

/* =========================================================
   Presentation mode
   ========================================================= */
function uiToggleExcluded(target){
  return !!(target&&target.closest&&(
    target.closest(".control-panel")||
    target.closest(".handle")||
    target.closest(".move-handle")||
    target.closest(".settings-modal")||
    target.closest(".modal-backdrop")||
    target.closest(".mobile-dock")
  ));
}
function isInstalledDisplayMode(){
  return window.matchMedia("(display-mode: fullscreen)").matches||
         window.matchMedia("(display-mode: standalone)").matches;
}
function setUIHidden(hidden){
  document.body.classList.toggle("ui-hidden",hidden);
  if(hidden){
    const modal=$("settingsModal");if(modal)modal.hidden=true;
    handleEls.forEach(h=>h.style.display="none");
    if(moveHandle)moveHandle.style.display="none";
    const ctx=gridCanvas.getContext("2d");
    ctx.clearRect(0,0,gridCanvas.width,gridCanvas.height);
  }else{
    refreshHandles();queueGridDraw();
  }
}
function requestSystemFullscreenFromGesture(){
  if(isInstalledDisplayMode()||document.fullscreenElement)return;
  const el=document.documentElement;
  if(!el.requestFullscreen)return;
  try{
    const p=el.requestFullscreen({navigationUI:"hide"});
    if(p&&typeof p.catch==="function")p.catch(()=>{});
  }catch(e){}
}
function enterPresentationMode(){
  requestSystemFullscreenFromGesture();
  setUIHidden(true);
}
function showControls(){setUIHidden(false);}
function toggleControlsFromGesture(){
  if(document.body.classList.contains("ui-hidden"))showControls();
  else enterPresentationMode();
}
$("btnHideUI")?.addEventListener("click",e=>{e.preventDefault();enterPresentationMode();});

let lastPointerType="mouse";
document.addEventListener("pointerdown",e=>{lastPointerType=e.pointerType||"mouse";},{capture:true});
document.addEventListener("click",e=>{
  if(lastPointerType!=="mouse")return;
  if(!document.body.classList.contains("ui-hidden")&&uiToggleExcluded(e.target))return;
  if(e.detail===2){e.preventDefault();toggleControlsFromGesture();}
},{capture:true});

let tapTime=0,tapX=0,tapY=0;
document.addEventListener("pointerup",e=>{
  if(e.pointerType==="mouse")return;
  if(!document.body.classList.contains("ui-hidden")&&uiToggleExcluded(e.target)){tapTime=0;return;}
  const now=performance.now(),dx=e.clientX-tapX,dy=e.clientY-tapY;
  if(tapTime>0&&now-tapTime<=500&&(dx*dx+dy*dy)<=3600){
    e.preventDefault();toggleControlsFromGesture();tapTime=0;return;
  }
  tapTime=now;tapX=e.clientX;tapY=e.clientY;
},{capture:true});

/* =========================================================
   Mobile compact UI
   ========================================================= */
const mobileQuery=window.matchMedia("(max-width: 900px)");
const mobilePanelTitles={zones:"KHUNG CHIẾU",source:"NGUỒN ẢNH / VIDEO",adjust:"HIỆU CHỈNH",more:"KHÁC"};

function closeMobilePanel(){
  document.body.classList.remove("mobile-sheet-open","mobile-panel-zones","mobile-panel-source","mobile-panel-adjust","mobile-panel-more");
  document.querySelectorAll("[data-mobile-open]").forEach(btn=>btn.classList.remove("mobile-active"));
}
function openMobilePanel(name){
  if(!mobileQuery.matches)return;
  const same=document.body.classList.contains("mobile-sheet-open")&&document.body.classList.contains("mobile-panel-"+name);
  closeMobilePanel();
  if(same)return;
  document.body.classList.add("mobile-sheet-open","mobile-panel-"+name);
  const t=$("mobileSheetTitle");if(t)t.textContent=mobilePanelTitles[name]||"ĐIỀU KHIỂN";
  document.querySelector(`[data-mobile-open="${name}"]`)?.classList.add("mobile-active");
}
document.querySelectorAll("[data-mobile-open]").forEach(btn=>{
  btn.addEventListener("click",e=>{e.preventDefault();openMobilePanel(btn.dataset.mobileOpen);});
});
$("btnCloseMobileSheet")?.addEventListener("click",e=>{e.preventDefault();closeMobilePanel();});
$("btnMobileHideUi")?.addEventListener("click",e=>{e.preventDefault();closeMobilePanel();enterPresentationMode();});

const originalSetUIHidden=setUIHidden;
setUIHidden=function(hidden){
  if(hidden)closeMobilePanel();
  originalSetUIHidden(hidden);
};
if(mobileQuery.addEventListener)mobileQuery.addEventListener("change",closeMobilePanel);
else if(mobileQuery.addListener)mobileQuery.addListener(closeMobilePanel);
if(mobileQuery.matches)closeMobilePanel();

/* =========================================================
   V1.2.2 gestures - repaired in V1.2.3
   ========================================================= */
let createTool="quad";
let quadCreate=null;
let circleCreate=null;
const circleTouches=new Map();
const shapePreview=$("shapePreview");
const toolQuad=$("toolQuad");
const toolCircle=$("toolCircle");
const shapeToolHint=$("shapeToolHint");

function setCreateTool(tool){
  createTool=tool;
  toolQuad?.classList.toggle("active",tool==="quad");
  toolCircle?.classList.toggle("active",tool==="circle");
  if(shapeToolHint){
    shapeToolHint.textContent=tool==="quad"
      ?"Tứ giác: nhấn giữ rồi kéo 1 ngón trên vùng chiếu."
      :"Tròn: đặt 2 ngón, giữ ngắn rồi tách 2 ngón để tạo.";
  }
}
toolQuad?.addEventListener("click",()=>setCreateTool("quad"));
toolCircle?.addEventListener("click",()=>setCreateTool("circle"));

function stageNorm(clientX,clientY){
  const r=stage.getBoundingClientRect();
  return {
    x:Math.max(0,Math.min(1,(clientX-r.left)/r.width)),
    y:Math.max(0,Math.min(1,(clientY-r.top)/r.height)),
    px:clientX-r.left,py:clientY-r.top,w:r.width,h:r.height
  };
}
function showPreviewRect(x1,y1,x2,y2,circle=false){
  if(!shapePreview)return;
  const left=Math.min(x1,x2),top=Math.min(y1,y2);
  shapePreview.hidden=false;
  shapePreview.classList.toggle("circle",circle);
  shapePreview.style.left=left+"px";
  shapePreview.style.top=top+"px";
  shapePreview.style.width=Math.abs(x2-x1)+"px";
  shapePreview.style.height=Math.abs(y2-y1)+"px";
}
function hideShapePreview(){if(shapePreview)shapePreview.hidden=true;}
function isStageGestureBlocked(target){
  if(document.body.classList.contains("ui-hidden"))return true;
  return !!(target&&target.closest&&(
    target.closest(".control-panel")||
    target.closest(".mobile-dock")||
    target.closest(".handle")||
    target.closest(".move-handle")||
    target.closest(".settings-modal")||
    target.closest(".modal-backdrop")
  ));
}
function createFaceFromBounds(x1,y1,x2,y2,shape){
  let left=Math.max(0,Math.min(1,Math.min(x1,x2)));
  let right=Math.max(0,Math.min(1,Math.max(x1,x2)));
  let top=Math.max(0,Math.min(1,Math.min(y1,y2)));
  let bottom=Math.max(0,Math.min(1,Math.max(y1,y2)));
  if(right-left<.035||bottom-top<.035)return null;
  const face=addFace();
  face.shape=shape;
  face.perimeter.type=shape==="circle"?"ellipse":"quad";
  commitPoints(face,[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}]);
  refreshUI();
  return face;
}

/* TỨ GIÁC: giữ 450ms rồi mới kéo */
stage.addEventListener("pointerdown",e=>{
  if(createTool!=="quad"||isStageGestureBlocked(e.target))return;
  if(e.pointerType!=="mouse"&&e.pointerType!=="touch"&&e.pointerType!=="pen")return;
  const p=stageNorm(e.clientX,e.clientY);
  quadCreate={
    pointerId:e.pointerId,start:p,active:false,moved:false,
    timer:setTimeout(()=>{
      if(!quadCreate||quadCreate.pointerId!==e.pointerId)return;
      quadCreate.active=true;
      showPreviewRect(p.px,p.py,p.px,p.py,false);
      try{navigator.vibrate?.(20)}catch(_){}
    },450)
  };
},{capture:true});

stage.addEventListener("pointermove",e=>{
  if(!quadCreate||quadCreate.pointerId!==e.pointerId)return;
  const p=stageNorm(e.clientX,e.clientY);
  const d=Math.hypot(p.px-quadCreate.start.px,p.py-quadCreate.start.py);
  if(d>10)quadCreate.moved=true;
  if(!quadCreate.active&&quadCreate.moved){
    clearTimeout(quadCreate.timer);quadCreate=null;return;
  }
  if(quadCreate?.active){
    showPreviewRect(quadCreate.start.px,quadCreate.start.py,p.px,p.py,false);
    e.preventDefault();
  }
},{capture:true});

function finishQuad(e){
  if(!quadCreate||quadCreate.pointerId!==e.pointerId)return;
  clearTimeout(quadCreate.timer);
  if(quadCreate.active){
    const p=stageNorm(e.clientX,e.clientY);
    createFaceFromBounds(quadCreate.start.x,quadCreate.start.y,p.x,p.y,"quad");
  }
  quadCreate=null;hideShapePreview();
}
stage.addEventListener("pointerup",finishQuad,{capture:true});
stage.addEventListener("pointercancel",finishQuad,{capture:true});

/* TRÒN: 2 ngón, giữ ngắn + tách */
function updateCirclePreview(){
  if(!circleCreate||circleTouches.size<2)return;
  const [a,b]=[...circleTouches.values()];
  const cx=(a.px+b.px)/2,cy=(a.py+b.py)/2;
  const d=Math.hypot(b.px-a.px,b.py-a.py);
  if(!circleCreate.active&&performance.now()-circleCreate.startedAt>=250&&d>=24){
    circleCreate.active=true;
    try{navigator.vibrate?.(20)}catch(_){}
  }
  if(circleCreate.active){
    showPreviewRect(cx-d/2,cy-d/2,cx+d/2,cy+d/2,true);
  }
}
stage.addEventListener("pointerdown",e=>{
  if(createTool!=="circle"||e.pointerType==="mouse"||isStageGestureBlocked(e.target))return;
  circleTouches.set(e.pointerId,stageNorm(e.clientX,e.clientY));
  if(circleTouches.size===2)circleCreate={startedAt:performance.now(),active:false};
},{capture:true});

stage.addEventListener("pointermove",e=>{
  if(createTool!=="circle"||!circleTouches.has(e.pointerId))return;
  circleTouches.set(e.pointerId,stageNorm(e.clientX,e.clientY));
  updateCirclePreview();
  if(circleCreate?.active)e.preventDefault();
},{capture:true});

function finishCircle(e){
  if(!circleTouches.has(e.pointerId))return;
  if(circleCreate?.active&&circleTouches.size>=2){
    const [a,b]=[...circleTouches.values()];
    const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
    const rr=stage.getBoundingClientRect();
    const dpx=Math.hypot((b.x-a.x)*rr.width,(b.y-a.y)*rr.height);
    const rx=(dpx/2)/rr.width,ry=(dpx/2)/rr.height;
    createFaceFromBounds(cx-rx,cy-ry,cx+rx,cy+ry,"circle");
  }
  circleTouches.delete(e.pointerId);
  if(circleTouches.size<2){circleCreate=null;hideShapePreview();}
}
stage.addEventListener("pointerup",finishCircle,{capture:true});
stage.addEventListener("pointercancel",finishCircle,{capture:true});
setCreateTool("quad");

/* =========================================================
   Resize / start
   ========================================================= */
window.addEventListener("resize",()=>requestAnimationFrame(fitStage));
window.addEventListener("orientationchange",()=>setTimeout(fitStage,180));

const b=ensureDefaultBox();
if(!b.faces.length)addFace();
else{
  selectedBoxId=b.id;selectedFaceId=b.faces[0].id;
}
buildHandles();
fitStage();
refreshUI();
requestAnimationFrame(render);

})();

/* =========================================================
   PWA
   ========================================================= */
let deferredInstallPrompt=null;
const installBtn=document.getElementById("btnInstallApp");

function isInstalledPwa(){
  return window.matchMedia("(display-mode: fullscreen)").matches||
         window.matchMedia("(display-mode: standalone)").matches||
         window.navigator.standalone===true;
}
window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();
  deferredInstallPrompt=e;
  if(installBtn&&!isInstalledPwa())installBtn.hidden=false;
});
installBtn?.addEventListener("click",async()=>{
  if(!deferredInstallPrompt){
    alert("Nếu chưa xuất hiện hộp cài đặt, hãy mở menu trình duyệt và chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.");
    return;
  }
  deferredInstallPrompt.prompt();
  try{await deferredInstallPrompt.userChoice}catch(_){}
  deferredInstallPrompt=null;installBtn.hidden=true;
});
window.addEventListener("appinstalled",()=>{
  deferredInstallPrompt=null;
  if(installBtn)installBtn.hidden=true;
});
if(isInstalledPwa()&&installBtn)installBtn.hidden=true;

if("serviceWorker" in navigator){
  window.addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("./service-worker.js");
      try{await reg.update()}catch(_){}
      let reloading=false;
      navigator.serviceWorker.addEventListener("controllerchange",()=>{
        if(reloading)return;
        reloading=true;location.reload();
      });
    }catch(e){
      console.warn("Không đăng ký được Service Worker:",e);
    }
  });
}
