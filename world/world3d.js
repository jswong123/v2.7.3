(()=>{'use strict';
const map=document.getElementById('map'),c=document.getElementById('map3d'),a=document.getElementById('view2d'),b=document.getElementById('view3d'),reset=document.getElementById('reset3d'),hint=document.getElementById('viewHint'),labels=document.getElementById('map3dLabels'),lctx=labels.getContext('2d');
let mouseMoved=false;let gl=null,prog=null,buf=null,uvbuf=null,idxbuf=null,texture=null,indices=0,active=false,dirty=true,angle=-0.42,tilt=0.95,zoom=1.0,mouse=null,relief=null,reliefPixels=null,reliefW=0,reliefH=0;
const vs=`attribute vec3 p;attribute vec2 uv;uniform mat4 matrix;varying vec2 vUV;varying float vHeight;void main(){vUV=uv;vHeight=p.z;gl_Position=matrix*vec4(p,1.0);}`;
const fs=`precision mediump float;uniform sampler2D tex;varying vec2 vUV;varying float vHeight;void main(){vec4 color=texture2D(tex,vUV);float shade=0.93+min(vHeight*0.012,0.16);gl_FragColor=vec4(color.rgb*shade,1.0);}`;
function shader(type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
function init(){if(gl)return true;gl=c.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:false});if(!gl)return false;try{prog=gl.createProgram();gl.attachShader(prog,shader(gl.VERTEX_SHADER,vs));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));gl.useProgram(prog);buf=gl.createBuffer();uvbuf=gl.createBuffer();idxbuf=gl.createBuffer();texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.enable(gl.DEPTH_TEST);return true}catch(e){console.error('三维渲染初始化失败',e);return false}}
function loadRelief(){const img=new Image();img.onload=()=>{try{const tmp=document.createElement('canvas');tmp.width=img.width;tmp.height=img.height;const ctx=tmp.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);reliefPixels=ctx.getImageData(0,0,tmp.width,tmp.height).data;reliefW=tmp.width;reliefH=tmp.height;dirty=true}catch(e){console.warn('无法读取地形像素',e)}};img.src='world/global-relief.jpg'}
// This is a *visual relief proxy* derived from shaded imagery, NOT measured elevation.
function heightAt(u,v){if(!reliefPixels)return 0;const mapW=map.width,mapH=map.height;const base=Math.min(mapW/360,mapH/180);const zoomFactor=window.worldMap3DZoomFactor?window.worldMap3DZoomFactor():1;const k=base*zoomFactor;const lon=window.worldMap3DLocation?window.worldMap3DLocation(u,v)[0]:(u-.5)*360;const lat=window.worldMap3DLocation?window.worldMap3DLocation(u,v)[1]:(.5-v)*180;let xx=((lon+180)%360+360)%360/360,yy=Math.max(0,Math.min(.9999,(90-lat)/180));const x=Math.min(reliefW-1,Math.floor(xx*reliefW)),y=Math.min(reliefH-1,Math.floor(yy*reliefH)),i=(y*reliefW+x)*4;const r=reliefPixels[i],g=reliefPixels[i+1],bb=reliefPixels[i+2];if(bb>r*1.08&&bb>g*1.04)return 0;const bright=(r+g+bb)/3;return Math.max(0,(bright-85)/170)*7.5}
function mesh(){const w=map.width,h=map.height;const cols=180,rows=Math.max(45,Math.min(220,Math.round(cols*h/w)));const pos=[],uv=[],ids=[];const aspect=w/h;for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){const u=x/cols,v=y/rows;pos.push((u-.5)*120*aspect,(.5-v)*120,heightAt(u,v));uv.push(u,1-v)}for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=y*(cols+1)+x;ids.push(i,i+cols+1,i+1,i+1,i+cols+1,i+cols+2)}indices=ids.length;gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(pos),gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,uvbuf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(uv),gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,idxbuf);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(ids),gl.STATIC_DRAW)}
function mul(a,b){const out=new Float32Array(16);for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)out[col*4+row]+=a[k*4+row]*b[col*4+k];return out}
function matrix(){const co=Math.cos(angle),si=Math.sin(angle),ct=Math.cos(tilt),st=Math.sin(tilt);const rz=new Float32Array([co,si,0,0,-si,co,0,0,0,0,1,0,0,0,0,1]);const rx=new Float32Array([1,0,0,0,0,ct,st,0,0,-st,ct,0,0,0,0,1]);const w=c.width,h=c.height,asp=w/h;const sy=1/(86/zoom),sx=sy/asp;const proj=new Float32Array([sx,0,0,0,0,sy,0,0,0,0,-.005,0,0,0,0,1]);return mul(proj,mul(rx,rz))}
function draw(){if(!active||!gl)return;const w=map.width,h=map.height;if(c.width!==w||c.height!==h){c.width=w;c.height=h;dirty=true}if(dirty){dirty=false;gl.viewport(0,0,c.width,c.height);mesh();gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,map)}gl.clearColor(.12,.22,.29,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(prog);gl.uniformMatrix4fv(gl.getUniformLocation(prog,'matrix'),false,matrix());gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(prog,'tex'),0);gl.bindBuffer(gl.ARRAY_BUFFER,buf);let loc=gl.getAttribLocation(prog,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,uvbuf);loc=gl.getAttribLocation(prog,'uv');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,idxbuf);gl.drawElements(gl.TRIANGLES,indices,gl.UNSIGNED_SHORT,0);drawLabels()}

function drawLabels(){
 if(!active)return;
 const state=window.worldMap3DState?.();if(!state)return;
 if(labels.width!==c.width||labels.height!==c.height){labels.width=c.width;labels.height=c.height}
 lctx.clearRect(0,0,labels.width,labels.height);
 const m=matrix(),boxes=[],threshold=state.k>=25?3:state.k>=8?2:1;
 const positions=[];
 for(const n of state.nodes){if((n.priority||1)>threshold&&n!==state.selected)continue;
  let u=(n.lon-state.centerLon)*state.k/state.width+.5;
  u-=Math.round(u-.5)*360*state.k/state.width;
  const v=.5-(n.lat-state.centerLat)*state.k/state.height;
  if(u<-.03||u>1.03||v<-.03||v>1.03)continue;
  const x=(u-.5)*120*(state.width/state.height),y=(.5-v)*120,z=heightAt(u,v)+.5;
  const px=m[0]*x+m[4]*y+m[8]*z+m[12],py=m[1]*x+m[5]*y+m[9]*z+m[13];
  const sx=(px+1)*c.width/2,sy=(1-py)*c.height/2;
  if(sx<0||sx>c.width||sy<0||sy>c.height)continue;
  positions.push({n,x:sx,y:sy});
 }
 positions.sort((a,b)=>(a.n===state.selected?-1:b.n===state.selected?1:0));
 const ratio=window.devicePixelRatio||1;
 for(const {n,x,y} of positions){const rad=3.8*ratio;
  lctx.beginPath();lctx.arc(x,y,rad,0,Math.PI*2);
  lctx.fillStyle=n.side==='red'?'#d85753':n.side==='blue'?'#5088df':'#f0eee3';lctx.fill();
  lctx.strokeStyle='#1b3c49';lctx.lineWidth=1.3*ratio;lctx.stroke();
  const fs=12*ratio;lctx.font=`${fs}px sans-serif`;
  const tw=lctx.measureText(n.name).width,left=x-tw/2-4*ratio,right=x+tw/2+4*ratio,top=y-25*ratio,bottom=y-8*ratio;
  if(n!==state.selected&&boxes.some(b=>left<b[2]&&right>b[0]&&top<b[3]&&bottom>b[1]))continue;
  boxes.push([left,top,right,bottom]);lctx.textAlign='center';lctx.lineWidth=3*ratio;lctx.strokeStyle='rgba(239,246,241,.95)';lctx.fillStyle='#142b33';lctx.strokeText(n.name,x,y-10*ratio);lctx.fillText(n.name,x,y-10*ratio);
 }
 window.worldMap3DProjected=positions;
}

function tick(){if(active)draw();requestAnimationFrame(tick)}
function mode(on){if(on&&!init()){alert('此浏览器不支持WebGL，无法启动三维模式');return}active=on;window.worldMap3DActive=on;window.worldMap3DInvalidate?.();c.hidden=!on;labels.hidden=!on;map.style.visibility=on?'hidden':'visible';a.classList.toggle('active',!on);b.classList.toggle('active',on);reset.hidden=!on;hint.hidden=!on;dirty=true;try{localStorage.setItem('world-view-mode',on?'3d':'2d')}catch(e){}}
a.onclick=()=>mode(false);b.onclick=()=>mode(true);reset.onclick=()=>{angle=-.42;tilt=.95;zoom=1;dirty=true};window.addEventListener('worldmap-rendered',()=>dirty=true);c.addEventListener('pointerdown',e=>{c.setPointerCapture(e.pointerId);mouseMoved=false;mouse={x:e.clientX,y:e.clientY,shift:e.shiftKey}});c.addEventListener('pointermove',e=>{if(!mouse)return;mouseMoved=true;const dx=e.clientX-mouse.x,dy=e.clientY-mouse.y;mouse.x=e.clientX;mouse.y=e.clientY;if(e.shiftKey){window.worldMap3DPan?.(dx,dy)}else{angle+=dx*.005;tilt=Math.max(.18,Math.min(1.5,tilt+dy*.004));}dirty=true});c.addEventListener('pointerup',()=>mouse=null);c.addEventListener('pointercancel',()=>mouse=null);c.addEventListener('wheel',e=>{e.preventDefault();const factor=Math.exp(-e.deltaY*.0015);window.worldMap3DZoom?.(factor);dirty=true},{passive:false});
c.addEventListener('click',e=>{if(mouseMoved)return;const r=c.getBoundingClientRect(),x=(e.clientX-r.left)*devicePixelRatio,y=(e.clientY-r.top)*devicePixelRatio;let best=null,dist=15*devicePixelRatio;for(const q of window.worldMap3DProjected||[]){const d=Math.hypot(q.x-x,q.y-y);if(d<dist){dist=d;best=q.n}}if(best)window.worldMap3DSelect?.(best)});
loadRelief();tick();try{if(localStorage.getItem('world-view-mode')==='3d')mode(true)}catch(e){}
})();