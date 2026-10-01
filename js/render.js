
window.GPP = window.GPP || {};
(() => {
"use strict";
const G=window.GPP;
const canvas=document.getElementById("glCanvas");
const gl=canvas.getContext("webgl",{alpha:false,antialias:true,preserveDrawingBuffer:false,powerPreference:"high-performance"});
if(!gl){alert("Thiết bị không hỗ trợ WebGL.");return}

const VS=`
attribute vec2 a_pos;
attribute vec2 a_uv;
uniform mat3 u_h;
uniform mat3 u_uvm;
varying vec2 v_uv;
void main(){
  vec3 q=u_h*vec3(a_pos,1.0);
  vec2 n=q.xy/q.z;
  gl_Position=vec4(n.x*2.0-1.0,1.0-n.y*2.0,0.0,1.0);
  vec3 t=u_uvm*vec3(a_uv,1.0);
  v_uv=t.xy;
}`;
const FS=`
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_brightness;
void main(){
  if(v_uv.x<0.0||v_uv.x>1.0||v_uv.y<0.0||v_uv.y>1.0) discard;
  vec4 c=texture2D(u_tex,v_uv);
  gl_FragColor=vec4(c.rgb*u_brightness,c.a);
}`;
function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s}
const prog=gl.createProgram();gl.attachShader(prog,shader(gl.VERTEX_SHADER,VS));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,FS));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const loc={
  pos:gl.getAttribLocation(prog,"a_pos"),uv:gl.getAttribLocation(prog,"a_uv"),
  h:gl.getUniformLocation(prog,"u_h"),uvm:gl.getUniformLocation(prog,"u_uvm"),
  bright:gl.getUniformLocation(prog,"u_brightness")
};
const posBuf=gl.createBuffer(),uvBuf=gl.createBuffer();
gl.enableVertexAttribArray(loc.pos);gl.enableVertexAttribArray(loc.uv);

function solve(A,b){
  const n=b.length;
  for(let i=0;i<n;i++){
    let m=i;for(let j=i+1;j<n;j++)if(Math.abs(A[j][i])>Math.abs(A[m][i]))m=j;
    [A[i],A[m]]=[A[m],A[i]];[b[i],b[m]]=[b[m],b[i]];
    const p=A[i][i];if(Math.abs(p)<1e-10)throw new Error("singular");
    for(let j=i+1;j<n;j++){const f=A[j][i]/p;for(let k=i;k<n;k++)A[j][k]-=f*A[i][k];b[j]-=f*b[i]}
  }
  const x=Array(n).fill(0);
  for(let i=n-1;i>=0;i--){let s=b[i];for(let j=i+1;j<n;j++)s-=A[i][j]*x[j];x[i]=s/A[i][i]}
  return x;
}
function homography(dst){
  const src=[[0,0],[1,0],[1,1],[0,1]],A=[],b=[];
  for(let i=0;i<4;i++){const [x,y]=src[i],[u,v]=[dst[i].x,dst[i].y];A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v)}
  const h=solve(A,b);return [h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],1];
}
function glMat(h){return new Float32Array([h[0],h[3],h[6],h[1],h[4],h[7],h[2],h[5],h[8]])}
function applyH(h,p){const d=h[6]*p.x+h[7]*p.y+h[8];return{x:(h[0]*p.x+h[1]*p.y+h[2])/d,y:(h[3]*p.x+h[4]*p.y+h[5])/d}}
function inv3(m){
  const a=m[0],b=m[1],c=m[2],d=m[3],e=m[4],f=m[5],g=m[6],h=m[7],i=m[8];
  const A=e*i-f*h,B=-(d*i-f*g),C=d*h-e*g,D=-(b*i-c*h),E=a*i-c*g,F=-(a*h-b*g),GG=b*f-c*e,H=-(a*f-c*d),I=a*e-b*d;
  const det=a*A+b*B+c*C;if(Math.abs(det)<1e-10)return null;
  return[A/det,D/det,GG/det,B/det,E/det,H/det,C/det,F/det,I/det];
}
G.math={homography,applyH,inv3};

function polygonArea(pts){let a=0;for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];a+=p.x*q.y-q.x*p.y}return a/2}
function pointInTri(p,a,b,c){
  const s=(a.x-c.x)*(p.y-c.y)-(a.y-c.y)*(p.x-c.x);
  const t=(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
  const u=(c.x-b.x)*(p.y-b.y)-(c.y-b.y)*(p.x-b.x);
  return (s>=0&&t>=0&&u>=0)||(s<=0&&t<=0&&u<=0);
}
function triangulate(points){
  if(points.length<3)return[];
  const pts=points.map((p,i)=>({...p,_i:i}));if(polygonArea(pts)<0)pts.reverse();
  const out=[],v=pts.slice();let guard=0;
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  while(v.length>3&&guard++<1000){
    let cut=false;
    for(let i=0;i<v.length;i++){
      const a=v[(i-1+v.length)%v.length],b=v[i],c=v[(i+1)%v.length];
      if(cross(a,b,c)<=1e-8)continue;
      let inside=false;
      for(let j=0;j<v.length;j++){const p=v[j];if(p===a||p===b||p===c)continue;if(pointInTri(p,a,b,c)){inside=true;break}}
      if(inside)continue;
      out.push(a._i,b._i,c._i);v.splice(i,1);cut=true;break;
    }
    if(!cut)break;
  }
  if(v.length===3)out.push(v[0]._i,v[1]._i,v[2]._i);
  if(!out.length){
    for(let i=1;i<points.length-1;i++)out.push(0,i,i+1);
  }
  return out;
}
G.math.triangulate=triangulate;

function validQuad(p){
  if(!p||p.length!==4||p.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y)))return false;
  const area=Math.abs(polygonArea(p));if(area<.00015)return false;
  function seg(a,b,c,d){const cr=(x,y,z)=>(y.x-x.x)*(z.y-x.y)-(y.y-x.y)*(z.x-x.x);const a1=cr(a,b,c),a2=cr(a,b,d),a3=cr(c,d,a),a4=cr(c,d,b);return a1*a2<0&&a3*a4<0}
  return !seg(p[0],p[1],p[2],p[3])&&!seg(p[1],p[2],p[3],p[0]);
}
G.math.validQuad=validQuad;

function ensureTexture(rt){
  if(rt.texture)return rt.texture;
  rt.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,rt.texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  return rt.texture;
}
function deleteTexture(t){if(t)gl.deleteTexture(t)}
G.render={ensureTexture,deleteTexture};

function perimeterPoints(face){return face.perimeter?.points?.length?face.perimeter.points:G.factory.rectPerimeter()}
function upload(rt,uploaded){
  if(!rt?.ready||uploaded.has(rt.id))return false;
  ensureTexture(rt);gl.bindTexture(gl.TEXTURE_2D,rt.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  try{
    if(rt.image)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,rt.image);
    else if(rt.video&&rt.video.readyState>=2)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,rt.video);
    else return false;
    uploaded.add(rt.id);return true;
  }catch(e){return false}
}

function matUV(face,box,rt){
  const srcAspect=Math.max(.01,(rt?.width||1)/(rt?.height||1));
  const c=face.content||{};
  let targetAspect=Math.max(.05,c.baseAspect||1),u0=0,u1=1;

  if(box?.displayMode==="continuous" && !face.sourceId && box.sourceId){
    const ordered=box.faceOrder.map(id=>box.faces.find(f=>f.id===id)).filter(f=>f&&f.visible&&(!f.sourceId));
    const total=ordered.reduce((s,f)=>s+Math.max(.05,f.content?.weight||1),0)||1;
    let acc=0;
    for(const f of ordered){
      const w=Math.max(.05,f.content?.weight||1);
      if(f.id===face.id){u0=acc/total;u1=(acc+w)/total;break}
      acc+=w;
    }
    targetAspect=Math.max(.1,total);
  }

  let spanX=1,spanY=1;
  if(srcAspect>targetAspect)spanX=targetAspect/srcAspect;
  else spanY=srcAspect/targetAspect;

  const scale=Math.max(1,c.scale||1);
  spanX/=scale;spanY/=scale;
  const panX=(c.panX||0)*spanX,panY=(c.panY||0)*spanY;

  const globalSpan=u1-u0;
  const a=spanX*globalSpan*(c.flipX||1),d=spanY*(c.flipY||1);
  let tx=.5-spanX/2 + spanX*u0 + panX;
  let ty=.5-spanY/2 + panY;

  // Rotation around source center (90° steps supported but generic matrix).
  const r=(c.rotation||0)*Math.PI/180,co=Math.cos(r),si=Math.sin(r);
  // Base mapping x,y -> sx,sy before rotation.
  // R around .5,.5
  const m00=co*a, m01=-si*d;
  const m10=si*a, m11=co*d;
  const bx=tx, by=ty;
  const rtx=.5 + co*(bx-.5) - si*(by-.5);
  const rty=.5 + si*(bx-.5) + co*(by-.5);
  return new Float32Array([m00,m10,0,m01,m11,0,rtx,rty,1]);
}

function drawFace(face,box,rt,uploaded){
  if(!face.visible||!rt?.ready||!validQuad(face.points))return;
  if(!upload(rt,uploaded))return;
  const pp=perimeterPoints(face);
  const pts=pp.map(p=>({x:p.x,y:p.y})),idx=triangulate(pts);
  if(idx.length<3)return;
  const verts=[],uvs=[];
  idx.forEach(i=>{verts.push(pts[i].x,pts[i].y);uvs.push(pts[i].x,pts[i].y)});
  const h=homography(face.points);

  gl.bindBuffer(gl.ARRAY_BUFFER,posBuf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(verts),gl.DYNAMIC_DRAW);gl.vertexAttribPointer(loc.pos,2,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,uvBuf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(uvs),gl.DYNAMIC_DRAW);gl.vertexAttribPointer(loc.uv,2,gl.FLOAT,false,0,0);
  gl.uniformMatrix3fv(loc.h,false,glMat(h));gl.uniformMatrix3fv(loc.uvm,false,matUV(face,box,rt));
  gl.uniform1f(loc.bright,face.brightness||1);gl.bindTexture(gl.TEXTURE_2D,rt.texture);gl.drawArrays(gl.TRIANGLES,0,idx.length);
}

function resize(){
  const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(innerWidth*dpr)),h=Math.max(1,Math.round(innerHeight*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h)}
}
function frame(){
  requestAnimationFrame(frame);if(document.hidden)return;resize();
  gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(prog);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  const uploaded=new Set();
  const boxes=G.state.project.boxes;
  for(const b of boxes){
    const faces=b.faces.slice().sort((a,z)=>(a.zIndex||0)-(z.zIndex||0));
    for(const f of faces){const rt=G.model.effectiveRuntime(f);drawFace(f,b,rt,uploaded)}
  }
}
G.render.start=()=>requestAnimationFrame(frame);
G.render.faceLocalToScreen=(face,p)=>{
  try{return applyH(homography(face.points),p)}catch(e){return{x:0,y:0}}
};
G.render.screenToFaceLocal=(face,p)=>{
  try{const inv=inv3(homography(face.points));return inv?applyH(inv,p):null}catch(e){return null}
};
})();
