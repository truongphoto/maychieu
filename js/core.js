
window.GPP = window.GPP || {};
(() => {
"use strict";
const G=window.GPP;
G.VERSION="1.4.0";
G.SCHEMA=4;
G.STORAGE_KEY="gpp-can-chieu-v1-4-project";

const colors=["#00d9ff","#5cf2bd","#ffd166","#ff7aa2","#91a5ff","#d79cff","#70ffd9","#ff9f5a"];
const clone=o=>JSON.parse(JSON.stringify(o));
const uid=p=>{
  if(crypto?.randomUUID) return p+"_"+crypto.randomUUID();
  return p+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);
};
G.clone=clone; G.uid=uid;

function rectPerimeter(){
  return [
    {id:uid("P"),x:0,y:0,locked:false,protected:true},
    {id:uid("P"),x:1,y:0,locked:false,protected:true},
    {id:uid("P"),x:1,y:1,locked:false,protected:true},
    {id:uid("P"),x:0,y:1,locked:false,protected:true}
  ];
}
function ellipsePerimeter(n=16,rx=.5,ry=.5){
  const pts=[];
  for(let i=0;i<n;i++){
    const a=-Math.PI/2+i*Math.PI*2/n;
    pts.push({id:uid("P"),x:.5+Math.cos(a)*rx,y:.5+Math.sin(a)*ry,locked:false,protected:i%4===0});
  }
  return pts;
}
function defaultQuad(offset=0){
  const o=(offset%4)*.025;
  return [{x:.12+o,y:.14+o},{x:.58+o,y:.14+o},{x:.58+o,y:.60+o},{x:.12+o,y:.60+o}];
}
function makeFace(box,index=0,shape="quad"){
  const id=uid("FACE");
  const face={
    id,name:`MẶT ${index+1}`,shape,
    points:defaultQuad(index),
    lastValidPoints:null,
    perimeter:{
      mode:shape==="circle"?"ellipse":"quad",
      points:shape==="circle"?ellipsePerimeter():rectPerimeter()
    },
    content:{
      fit:"cover",scale:1,panX:0,panY:0,rotation:0,flipX:1,flipY:1,
      baseAspect:1,weight:1
    },
    sourceId:null,visible:true,locked:false,brightness:1,zIndex:index,
    editMode:shape==="circle"?"perimeter":"perspective",
    color:colors[index%colors.length]
  };
  face.lastValidPoints=clone(face.points);
  box.faces.push(face); box.faceOrder.push(id);
  return face;
}
function makeBox(index=0){
  return {
    id:uid("BOX"),name:`HỘP ${index+1}`,sourceId:null,
    displayMode:"continuous",collapsed:false,faces:[],faceOrder:[],edgeLinks:[]
  };
}
function makeProject(){
  return {schemaVersion:G.SCHEMA,id:uid("PROJECT"),name:"GPP Căn Chiếu",boxes:[],sources:[]};
}
G.factory={makeProject,makeBox,makeFace,rectPerimeter,ellipsePerimeter,defaultQuad};

G.state={
  project:makeProject(),
  selectedBoxId:null,selectedFaceId:null,selectedPointId:null,selectedSourceId:null,
  showGuides:true,createTool:null,
  undo:[],redo:[],maxHistory:40
};

G.runtime={sources:new Map()};

G.model={
  boxes:()=>G.state.project.boxes,
  box(id=G.state.selectedBoxId){return G.state.project.boxes.find(b=>b.id===id)||null},
  face(id=G.state.selectedFaceId){
    for(const b of G.state.project.boxes){const f=b.faces.find(x=>x.id===id);if(f)return f}
    return null;
  },
  boxOfFace(faceId){
    return G.state.project.boxes.find(b=>b.faces.some(f=>f.id===faceId))||null;
  },
  source(id){return G.state.project.sources.find(s=>s.id===id)||null},
  allFaces(){return G.state.project.boxes.flatMap(b=>b.faces)},
  effectiveSourceId(face){
    if(!face)return null;
    if(face.sourceId)return face.sourceId;
    return this.boxOfFace(face.id)?.sourceId||null;
  },
  effectiveRuntime(face){
    const id=this.effectiveSourceId(face);
    return id?G.runtime.sources.get(id)||null:null;
  },
  selectBox(id){
    const b=this.box(id); if(!b)return;
    G.state.selectedBoxId=id;
    if(!b.faces.some(f=>f.id===G.state.selectedFaceId)) G.state.selectedFaceId=b.faces[0]?.id||null;
    G.state.selectedPointId=null;
  },
  selectFace(id){
    const b=this.boxOfFace(id);if(!b)return;
    G.state.selectedBoxId=b.id;G.state.selectedFaceId=id;G.state.selectedPointId=null;
  },
  addBox(){
    G.history.begin();
    const b=makeBox(G.state.project.boxes.length);
    G.state.project.boxes.push(b);
    const f=makeFace(b,0,"quad");
    G.state.selectedBoxId=b.id;G.state.selectedFaceId=f.id;G.state.selectedPointId=null;
    G.history.commit();
    return b;
  },
  addFace(shape="quad",points=null){
    let b=this.box();
    if(!b){b=this.addBox()}
    G.history.begin();
    const f=makeFace(b,b.faces.length,shape);
    if(points){f.points=clone(points);f.lastValidPoints=clone(points)}
    const r=G.ui?.stageRect?.();
    if(r&&points){
      const w=Math.hypot((points[1].x-points[0].x)*r.width,(points[1].y-points[0].y)*r.height);
      const h=Math.hypot((points[3].x-points[0].x)*r.width,(points[3].y-points[0].y)*r.height);
      f.content.baseAspect=Math.max(.1,w/Math.max(1,h));
    }
    G.state.selectedFaceId=f.id;G.state.selectedPointId=null;
    G.history.commit();
    return f;
  },
  duplicateFace(){
    const src=this.face(),b=this.boxOfFace(src?.id);if(!src||!b)return;
    G.history.begin();
    const f=clone(src);f.id=uid("FACE");f.name=`MẶT ${b.faces.length+1}`;
    f.points=f.points.map(p=>({x:Math.min(.98,p.x+.025),y:Math.min(.98,p.y+.025)}));
    f.lastValidPoints=clone(f.points);
    f.perimeter.points=f.perimeter.points.map(p=>({...p,id:uid("P")}));
    b.faces.push(f);b.faceOrder.push(f.id);
    G.state.selectedBoxId=b.id;G.state.selectedFaceId=f.id;
    G.history.commit();
  },
  duplicateBox(){
    const src=this.box();if(!src)return;
    G.history.begin();
    const b=clone(src);b.id=uid("BOX");b.name=`HỘP ${G.state.project.boxes.length+1}`;
    const map=new Map();
    b.faces=b.faces.map((f,i)=>{
      const old=f.id;f.id=uid("FACE");map.set(old,f.id);f.name=`MẶT ${i+1}`;
      f.points=f.points.map(p=>({x:Math.min(.98,p.x+.03),y:Math.min(.98,p.y+.03)}));
      f.lastValidPoints=clone(f.points);
      f.perimeter.points=f.perimeter.points.map(p=>({...p,id:uid("P")}));
      return f;
    });
    b.faceOrder=b.faceOrder.map(id=>map.get(id)).filter(Boolean);
    b.edgeLinks=b.edgeLinks.map(l=>({...l,id:uid("LINK"),faceA:map.get(l.faceA),faceB:map.get(l.faceB)})).filter(l=>l.faceA&&l.faceB);
    G.state.project.boxes.push(b);G.state.selectedBoxId=b.id;G.state.selectedFaceId=b.faces[0]?.id||null;
    G.history.commit();
  },
  deleteFace(id=G.state.selectedFaceId){
    const b=this.boxOfFace(id);if(!b)return false;
    if(b.faces.length<=1){G.ui?.toast("Mỗi HỘP phải còn ít nhất 1 MẶT.");return false}
    G.history.begin();
    const f=b.faces.find(x=>x.id===id),sid=f?.sourceId;
    b.faces=b.faces.filter(x=>x.id!==id);
    b.faceOrder=b.faceOrder.filter(x=>x!==id);
    b.edgeLinks=b.edgeLinks.filter(l=>l.faceA!==id&&l.faceB!==id);
    if(G.state.selectedFaceId===id)G.state.selectedFaceId=b.faces[0]?.id||null;
    G.state.selectedPointId=null;
    G.history.commit(); this.releaseSourceIfUnused(sid); return true;
  },
  deleteBox(id=G.state.selectedBoxId){
    const b=this.box(id);if(!b)return;
    if(G.state.project.boxes.length<=1){G.ui?.toast("Dự án phải còn ít nhất 1 HỘP.");return}
    const sids=[b.sourceId,...b.faces.map(f=>f.sourceId)].filter(Boolean);
    G.history.begin();
    G.state.project.boxes=G.state.project.boxes.filter(x=>x.id!==id);
    const nb=G.state.project.boxes[0];G.state.selectedBoxId=nb.id;G.state.selectedFaceId=nb.faces[0]?.id||null;
    G.history.commit();sids.forEach(s=>this.releaseSourceIfUnused(s));
  },
  setBoxMode(mode){const b=this.box();if(!b)return;G.history.atomic(()=>b.displayMode=mode)},
  sourceRefCount(id){
    if(!id)return 0;let n=0;
    G.state.project.boxes.forEach(b=>{if(b.sourceId===id)n++;b.faces.forEach(f=>{if(f.sourceId===id)n++})});
    return n;
  },
  releaseSourceIfUnused(id){
    // Không tự xóa nguồn khi refCount=0.
    // Nguồn đã nạp vẫn nằm trong THƯ VIỆN để có thể gán lại cho HỘP/MẶT khác
    // và để Undo/Redo không làm mất media runtime trong phiên hiện tại.
    return;
  },
  addSourceFile(file){
    const id=uid("SRC");
    const meta={id,name:file.name,type:file.type.startsWith("video/")?"video":"image",mime:file.type||"",size:file.size||0,width:0,height:0,ready:false};
    G.state.project.sources.push(meta);
    const rt={id,url:URL.createObjectURL(file),texture:null,image:null,video:null,ready:false,width:0,height:0};
    G.runtime.sources.set(id,rt);
    if(meta.type==="image"){
      const img=new Image();rt.image=img;
      img.onload=()=>{rt.ready=true;rt.width=img.naturalWidth;rt.height=img.naturalHeight;meta.width=rt.width;meta.height=rt.height;meta.ready=true;G.render?.ensureTexture(rt);G.ui?.refresh()};
      img.src=rt.url;
    }else{
      const v=document.createElement("video");rt.video=v;v.src=rt.url;v.loop=true;v.muted=true;v.playsInline=true;v.preload="metadata";
      v.onloadeddata=()=>{rt.ready=true;rt.width=v.videoWidth;rt.height=v.videoHeight;meta.width=rt.width;meta.height=rt.height;meta.ready=true;G.render?.ensureTexture(rt);G.ui?.refresh();v.play().catch(()=>{})};
      v.load();
    }
    G.state.selectedSourceId=id;return id;
  },
  assignSourceToBox(sourceId){
    const b=this.box();if(!b||!sourceId)return;const old=b.sourceId;
    G.history.atomic(()=>b.sourceId=sourceId);this.releaseSourceIfUnused(old);
  },
  assignSourceToFace(sourceId){
    const f=this.face();if(!f||!sourceId)return;const old=f.sourceId;
    G.history.atomic(()=>f.sourceId=sourceId);this.releaseSourceIfUnused(old);
  },
  clearFaceSource(){
    const f=this.face();if(!f)return;const old=f.sourceId;
    G.history.atomic(()=>f.sourceId=null);this.releaseSourceIfUnused(old);
  }
};

G.history={
  pending:null,
  snapshot(){return clone(G.state.project)},
  begin(){if(this.pending)return;this.pending=this.snapshot()},
  commit(){
    if(!this.pending)return;
    const before=this.pending;this.pending=null;
    const after=this.snapshot();
    if(JSON.stringify(before)===JSON.stringify(after))return;
    G.state.undo.push(before);if(G.state.undo.length>G.state.maxHistory)G.state.undo.shift();
    G.state.redo=[];
  },
  atomic(fn){this.begin();fn();this.commit();G.ui?.refresh()},
  restore(project){
    G.state.project=clone(project);
    const b=G.state.project.boxes[0];G.state.selectedBoxId=b?.id||null;G.state.selectedFaceId=b?.faces[0]?.id||null;G.state.selectedPointId=null;
    G.ui?.refresh();
  },
  undo(){
    if(!G.state.undo.length)return;
    const current=this.snapshot(),prev=G.state.undo.pop();G.state.redo.push(current);this.pending=null;this.restore(prev);
  },
  redo(){
    if(!G.state.redo.length)return;
    const current=this.snapshot(),next=G.state.redo.pop();G.state.undo.push(current);this.pending=null;this.restore(next);
  }
};

G.persistence={
  save(){
    localStorage.setItem(G.STORAGE_KEY,JSON.stringify(G.state.project));
    G.ui?.toast("Đã lưu cấu hình. File ảnh/video cục bộ cần chọn lại sau khi mở trình duyệt mới.");
  },
  load(){
    try{
      const raw=localStorage.getItem(G.STORAGE_KEY);if(!raw){G.ui?.toast("Chưa có cấu hình đã lưu.");return}
      const p=JSON.parse(raw);
      if(!p||!Array.isArray(p.boxes)){throw new Error("invalid")}
      G.state.project=p;
      p.boxes.forEach((b,bi)=>{
        b.edgeLinks=b.edgeLinks||[];b.faceOrder=b.faceOrder||b.faces.map(f=>f.id);b.displayMode=b.displayMode||"continuous";
        b.faces.forEach((f,fi)=>{
          f.perimeter=f.perimeter||{mode:f.shape==="circle"?"ellipse":"quad",points:f.shape==="circle"?ellipsePerimeter():rectPerimeter()};
          f.content=Object.assign({fit:"cover",scale:1,panX:0,panY:0,rotation:0,flipX:1,flipY:1,baseAspect:1,weight:1},f.content||{});
          f.lastValidPoints=f.lastValidPoints||clone(f.points);f.editMode=f.editMode||"perspective";f.zIndex=f.zIndex??fi;
        });
      });
      const b=p.boxes[0];G.state.selectedBoxId=b?.id||null;G.state.selectedFaceId=b?.faces[0]?.id||null;
      G.state.undo=[];G.state.redo=[];G.ui?.refresh();G.ui?.toast("Đã mở cấu hình. Chọn lại media cục bộ nếu nguồn chưa sẵn sàng.");
    }catch(e){G.ui?.toast("Không mở được cấu hình.");}
  }
};

})();
