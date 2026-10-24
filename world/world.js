(()=>{'use strict';
const canvas=document.getElementById('map'),ctx=canvas.getContext('2d');const $=id=>document.getElementById(id);
let nodes=[['北京',116.4,39.9,'城市'],['上海',121.47,31.23,'城市'],['广州',113.26,23.13,'城市'],['香港',114.17,22.3,'港口'],['东京',139.69,35.68,'城市'],['横须贺',139.67,35.28,'港口'],['新加坡',103.82,1.35,'港口'],['孟买',72.88,19.08,'港口'],['莫斯科',37.62,55.75,'城市'],['柏林',13.4,52.52,'城市'],['伦敦',-0.13,51.51,'城市'],['巴黎',2.35,48.86,'城市'],['纽约',-74,40.71,'港口'],['华盛顿',-77.04,38.9,'城市'],['洛杉矶',-118.24,34.05,'港口'],['旧金山',-122.42,37.77,'港口'],['悉尼',151.21,-33.87,'港口'],['墨尔本',144.96,-37.81,'港口'],['开罗',31.24,30.04,'城市'],['开普敦',18.42,-33.93,'港口'],['里约热内卢',-43.2,-22.91,'港口'],['布宜诺斯艾利斯',-58.38,-34.6,'港口'],['檀香山',-157.86,21.31,'港口'],['巴拿马城',-79.52,8.98,'港口'],['符拉迪沃斯托克',131.89,43.12,'港口'],['伊斯坦布尔',28.98,41.01,'港口']].map((n,i)=>({id:'node'+i,name:n[0],lon:n[1],lat:n[2],kind:n[3],side:'neutral'}));
let geo=null,countries=null,selected=null,scale=1,centerLon=0,centerLat=8,drag=null,moved=false,dirty=true;
const relief=new Image();let reliefReady=false;
relief.onload=()=>{reliefReady=true;dirty=true};relief.onerror=()=>console.warn('地形阴影底图加载失败');relief.src='world/global-relief.jpg';
function terrainFilter(){const level=Number($('terrainSharp')?.value||0);return level===2?'contrast(1.18) saturate(1.12)':level===1?'contrast(1.08) saturate(1.05)':'none'}
function drawRelief(){
 if(!reliefReady)return false;
 const v=view(),left=centerLon-v.w/(2*v.k),right=centerLon+v.w/(2*v.k);
 const north=Math.min(90,centerLat+v.h/(2*v.k)),south=Math.max(-90,centerLat-v.h/(2*v.k));
 if(north<=south)return false;
 const sy=(90-north)/180*relief.height,sh=(north-south)/180*relief.height;
 const dy=xy(0,north,0,v)[1],dh=(north-south)*v.k;
 const a=Math.floor((left+180)/360)-1,b=Math.ceil((right+180)/360)+1;
 for(let wrap=a;wrap<=b;wrap++){
  const lo=Math.max(-180,left-wrap*360),hi=Math.min(180,right-wrap*360);
  if(lo>=hi)continue;
  const sx=(lo+180)/360*relief.width,sw=(hi-lo)/360*relief.width;
  const dx=xy(lo,0,wrap,v)[0];
  ctx.save();ctx.filter=terrainFilter();ctx.drawImage(relief,sx,sy,sw,sh,dx,dy,(hi-lo)*v.k,dh);ctx.restore();
 }
 return true;
}
// 按视野加载 ArcGIS World Shaded Relief 瓦片；断网时保留原有离线底图。
// 瓦片为 Web Mercator，逐条带重投影到游戏的经纬度等距地图。
const terrainTiles=new Map();let tilePending=0,tileLastStatus='';
const TILE_URL='https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/';
function mercY(lat){const r=Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/180;return (1-Math.log(Math.tan(Math.PI/4+r/2))/Math.PI)/2}
function invMerc(y){return Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI}
function requestTile(z,x,y){const key=z+'/'+x+'/'+y;if(terrainTiles.has(key))return terrainTiles.get(key);
 const t={state:'loading',image:null,last:performance.now()};terrainTiles.set(key,t);tilePending++;
 const im=new Image();im.crossOrigin='anonymous';im.onload=()=>{t.state='ready';t.image=im;tilePending--;dirty=true};im.onerror=()=>{t.state='failed';tilePending--;dirty=true};im.src=TILE_URL+z+'/'+y+'/'+x;
 if(terrainTiles.size>240){for(const [k,v] of terrainTiles){if(terrainTiles.size<=200)break;if(v.state!=='loading'&&k!==key)terrainTiles.delete(k)}}return t;
}
function drawHighResTerrain(){
 if(!reliefReady)return;
 const v=view(),lonPerPixel=1/v.k,lat0=Math.max(-80,Math.min(80,centerLat));
 const z=Math.max(2,Math.min(13,Math.floor(Math.log2(360*v.k/256*Math.max(.25,Math.cos(lat0*Math.PI/180))))));
 if(z<4)return;
 const N=2**z,left=centerLon-v.w/(2*v.k),right=centerLon+v.w/(2*v.k);
 const north=Math.min(85,centerLat+v.h/(2*v.k)),south=Math.max(-85,centerLat-v.h/(2*v.k));
 if(north<=south)return;
 const xa=Math.floor((left+180)/360*N),xb=Math.floor((right+180)/360*N);
 const ya=Math.max(0,Math.floor(mercY(north)*N)),yb=Math.min(N-1,Math.floor(mercY(south)*N));
 // 防止一次请求数千瓦片，优先使用现有离线底图。
 if((xb-xa+1)*(yb-ya+1)>100)return;
 for(let tx=xa;tx<=xb;tx++)for(let ty=ya;ty<=yb;ty++){
  const wrapX=((tx%N)+N)%N;
  const t=requestTile(z,wrapX,ty);if(t.state!=='ready')continue;
  const lon1=tx/N*360-180,lon2=(tx+1)/N*360-180;
  const topLat=invMerc(ty/N),botLat=invMerc((ty+1)/N);
  const [x1]=xy(lon1,0,0,v),[x2]=xy(lon2,0,0,v);
  if(x2<=0||x1>=v.w)continue;
  // 分条重投影：纬度越高，Mercator 瓦片纵向变形越明显。
  const bands=24;
  for(let j=0;j<bands;j++){
   const latA=topLat+(botLat-topLat)*j/bands,latB=topLat+(botLat-topLat)*(j+1)/bands;
   const yy1=xy(0,latA,0,v)[1],yy2=xy(0,latB,0,v)[1];
   if(yy2<0||yy1>v.h)continue;
   const sy1=(mercY(latA)*N-ty)*256,sy2=(mercY(latB)*N-ty)*256;
   if(sy2<=sy1)continue;
   ctx.save();ctx.filter=terrainFilter();ctx.drawImage(t.image,0,Math.max(0,sy1),256,Math.min(256,sy2)-Math.max(0,sy1),x1,yy1,x2-x1,yy2-yy1);ctx.restore();
  }
 }
}
function resize(){const r=document.getElementById("worldViewport").getBoundingClientRect();canvas.width=Math.max(1,Math.round(r.width*devicePixelRatio));canvas.height=Math.max(1,Math.round(r.height*devicePixelRatio));dirty=true}window.addEventListener('resize',resize);
function view(){const w=canvas.width,h=canvas.height;return {w,h,k:Math.min(w/360,h/180)*scale, cx:w/2,cy:h/2}}
function xy(lon,lat,offset=0,v=view()){return [v.cx+(lon+360*offset-centerLon)*v.k,v.cy-(lat-centerLat)*v.k]}
window.worldMap3DPan=(dx,dy)=>{const v=view();centerLon-=dx*devicePixelRatio/v.k;centerLat=Math.max(-80,Math.min(80,centerLat+dy*devicePixelRatio/v.k));centerLon=((centerLon+180)%360+360)%360-180;dirty=true};
window.worldMap3DState=()=>({nodes,selected,centerLon,centerLat,scale,width:canvas.width,height:canvas.height,k:view().k});
window.worldMap3DZoom=(factor)=>{scale=Math.max(.7,Math.min(20000,scale*factor));dirty=true};
window.worldMap3DSelect=(n)=>{selected=n;$('info').textContent=n?`${n.name} · ${n.kind}\n坐标：${n.lon.toFixed(2)}°, ${n.lat.toFixed(2)}°\n控制方：${{red:'红方',blue:'蓝方',neutral:'中立'}[n.side]}`:'请选择城市或港口节点';$('info').style.whiteSpace='pre-line';dirty=true};
window.worldMap3DInvalidate=()=>{dirty=true};
window.worldMap3DLocation=(u,v)=>{const vv=view();return [centerLon+(u-.5)*vv.w/vv.k,centerLat+(.5-v)*vv.h/vv.k]};
function drawPath(segs,color,width,fill){const v=view();ctx.lineWidth=width*devicePixelRatio;ctx.strokeStyle=color;if(fill)ctx.fillStyle=fill;for(let wrap=-2;wrap<=2;wrap++){for(const seg of segs){if(seg.length<2)continue;ctx.beginPath();let prev=null;for(let i=0;i<seg.length;i++){const [x,y]=xy(seg[i][0],seg[i][1],wrap,v);if(prev&&Math.abs(x-prev)>v.k*180){ctx.moveTo(x,y)}else if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);prev=x}if(fill){ctx.closePath();ctx.fill()}ctx.stroke()}}}
function drawGrid(){
 if(!$('hex').checked)return;
 const v=view(),km=Number($('gridSize').value),size=km/111.2,radius=size/Math.sqrt(3),dy=radius*1.5,colStep=size;
 const pixelRadius=radius*v.k;
 // 网格过密时隐藏，而非跳过列绘制畸形的孤立六角形。
 if(pixelRadius<3*devicePixelRatio)return;
 const left=centerLon-v.w/(2*v.k)-2,right=centerLon+v.w/(2*v.k)+2;
 const top=Math.min(90,centerLat+v.h/(2*v.k)+2),bottom=Math.max(-90,centerLat-v.h/(2*v.k)-2);
 const minC=Math.floor((left+180)/colStep)-2,maxC=Math.ceil((right+180)/colStep)+2;
 const minR=Math.floor((bottom+90)/dy)-2,maxR=Math.ceil((top+90)/dy)+2;
 if((maxC-minC)*(maxR-minR)>45000)return;
 ctx.lineWidth=Math.max(.4,devicePixelRatio*.55);ctx.strokeStyle='rgba(24,55,62,.29)';
 for(let c=minC;c<=maxC;c++)for(let r=minR;r<=maxR;r++){
  const lon=-180+c*colStep,lat=-90+r*dy+((c%2+2)%2)*dy/2;
  if(lat>90||lat< -90)continue;
  const [x,y]=xy(lon,lat);
  if(x< -pixelRadius||x>v.w+pixelRadius||y< -pixelRadius||y>v.h+pixelRadius)continue;
  ctx.beginPath();for(let a=0;a<=6;a++){
   const t=Math.PI/3*a,px=x+pixelRadius*Math.cos(t),py=y+pixelRadius*Math.sin(t);
   a?ctx.lineTo(px,py):ctx.moveTo(px,py)
  }ctx.stroke()
 }
}
function drawCountries(){
 if(!countries||!$('nationColors').checked||$('mode').value==='terrain')return;
 const v=view();
 for(const country of countries){
  const id=country.id||'',seed=[...id].reduce((a,ch)=>a*31+ch.charCodeAt(0),17);
  const hue=((seed%360)+360)%360;
  ctx.fillStyle=`hsla(${hue},55%,52%,${$('mode').value==='control'?Math.max(.12,Number($('nationOpacity').value)/100):Number($('nationOpacity').value)/100})`;
  for(const ring of country.polygons){
   if(ring.length<3)continue;
   const lons=ring.map(p=>p[0]);let min=Math.min(...lons),max=Math.max(...lons);
   // 180度经线处的多边形不应画出横跨整个地球的填充。
   if(max-min>180)continue;
   for(let wrap=-2;wrap<=2;wrap++){
    const minX=xy(min,0,wrap,v)[0],maxX=xy(max,0,wrap,v)[0];
    if(maxX<0||minX>v.w)continue;
    ctx.beginPath();for(let i=0;i<ring.length;i++){
     const [x,y]=xy(ring[i][0],ring[i][1],wrap,v);
     i?ctx.lineTo(x,y):ctx.moveTo(x,y)
    }ctx.closePath();ctx.fill()
   }
  }
 }
}
function paint(){
 if(!dirty)return;dirty=false;const v=view();ctx.clearRect(0,0,v.w,v.h);ctx.fillStyle='#83b1c7';ctx.fillRect(0,0,v.w,v.h);
 const hasRelief=drawRelief();if(hasRelief)drawHighResTerrain();
 if(geo){if(!hasRelief)drawPath(geo.coast,'#587c67',.7,'#afc4a1');drawCountries();if($('borders').checked)drawPath(geo.countries,'rgba(68,83,71,.7)',.65);if($('rivers').checked)drawPath(geo.rivers,'#6ca2c5',.6)}drawGrid();
 const mode=$('mode').value,zoom=v.k;
 const threshold=zoom>=25?3:zoom>=8?2:1;
 const visible=nodes.filter(n=>(n.priority||1)<=threshold||n===selected);
 const labelBoxes=[];
 const in3D=!!window.worldMap3DActive;
 for(const n of visible){for(let wrap=-2;wrap<=2;wrap++){
  const [x,y]=xy(n.lon,n.lat,wrap,v);if(x< -50||x>v.w+50||y< -50||y>v.h+50)continue;
  const rad=(n.priority===3?3.5:4.5)*devicePixelRatio;
  const color=n.side==='red'?'#cf5350':n.side==='blue'?'#407ed3':n.kind==='港口'?'#e2f3f6':n.kind==='交通枢纽'?'#f1d69a':'#f0eee3';
  if(mode!=='terrain'&&n.side!=='neutral'){ctx.beginPath();ctx.arc(x,y,Math.max(rad*2,Math.min(v.k*1.25,42*devicePixelRatio)),0,Math.PI*2);ctx.fillStyle=n.side==='red'?'rgba(204,58,57,.24)':'rgba(42,104,200,.24)';ctx.fill()}
  ctx.beginPath();ctx.arc(x,y,rad,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle=n===selected?'#f4db68':'#193c48';ctx.lineWidth=n===selected?3*devicePixelRatio:1.2*devicePixelRatio;ctx.stroke();
  const fontSize=(n.priority===1?12:11)*devicePixelRatio;
  ctx.font=`${fontSize}px sans-serif`;const tw=ctx.measureText(n.name).width;
  const left=x-tw/2-3*devicePixelRatio,right=x+tw/2+3*devicePixelRatio,top=y-24*devicePixelRatio,bottom=y-8*devicePixelRatio;
  if(!in3D&&(n===selected||!labelBoxes.some(b=>left<b[2]&&right>b[0]&&top<b[3]&&bottom>b[1]))){
   labelBoxes.push([left,top,right,bottom]);ctx.fillStyle='#17282e';ctx.textAlign='center';ctx.strokeStyle='rgba(232,239,226,.88)';ctx.lineWidth=3*devicePixelRatio;ctx.strokeText(n.name,x,y-10*devicePixelRatio);ctx.fillText(n.name,x,y-10*devicePixelRatio)
  }
 }}
 ctx.font=`${12*devicePixelRatio}px sans-serif`;ctx.fillStyle='#143441';ctx.textAlign='left';if(!in3D)ctx.fillText('全球战略地图 · '+$('gridSize').value+'公里参考网格 · 真实地形阴影 · 左右循环',18*devicePixelRatio,25*devicePixelRatio)
}
function frame(){const wasDirty=dirty;paint();if(wasDirty)window.dispatchEvent(new Event("worldmap-rendered"));requestAnimationFrame(frame)}
function pointer(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*devicePixelRatio,(e.clientY-r.top)*devicePixelRatio]}
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);drag=pointer(e);moved=false});canvas.addEventListener('pointermove',e=>{if(!drag)return;const p=pointer(e),dx=p[0]-drag[0],dy=p[1]-drag[1];if(Math.abs(dx)+Math.abs(dy)>2)moved=true;const v=view();centerLon-=dx/v.k;centerLat=Math.max(-80,Math.min(80,centerLat+dy/v.k));centerLon=((centerLon+180)%360+360)%360-180;drag=p;dirty=true});canvas.addEventListener('pointerup',e=>{drag=null;if(moved)return;const p=pointer(e),v=view();let best=null,dist=14*devicePixelRatio;for(const n of nodes)for(let k=-2;k<=2;k++){const q=xy(n.lon,n.lat,k,v),d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<dist){best=n;dist=d}}selected=best;$('info').textContent=best?`${best.name} · ${best.kind}\n坐标：${best.lon.toFixed(2)}°, ${best.lat.toFixed(2)}°\n控制方：${{red:'红方',blue:'蓝方',neutral:'中立'}[best.side]}`:'请选择城市或港口节点';$('info').style.whiteSpace='pre-line';dirty=true});canvas.addEventListener('wheel',e=>{e.preventDefault();scale=Math.max(.7,Math.min(20000,scale*Math.exp(-e.deltaY*.001)));dirty=true},{passive:false});
$('locatePlace').onclick=()=>{const q=$('placeSearch').value.trim();if(!q)return;const n=nodes.find(n=>n.name===q)||nodes.find(n=>n.name.includes(q));if(!n){$('info').textContent='未找到该地名';return;}selected=n;centerLon=n.lon;centerLat=n.lat;scale=Math.max(scale,7);$('info').textContent=`${n.name} · ${n.kind}\n坐标：${n.lon.toFixed(2)}°, ${n.lat.toFixed(2)}°`; $('info').style.whiteSpace='pre-line';dirty=true};
$('placeSearch').addEventListener('keydown',e=>{if(e.key==='Enter')$('locatePlace').click()});
$('capture').onclick=()=>{if(!selected)return;selected.side=$('side').value;save();dirty=true;$('info').textContent=`${selected.name} · 已变更为${{red:'红方',blue:'蓝方',neutral:'中立'}[selected.side]}`};$('reset').onclick=()=>{nodes.forEach(n=>n.side='neutral');save();dirty=true};['mode','hex','gridSize','nationColors','borders','rivers','nationOpacity','terrainSharp'].forEach(id=>$(id).addEventListener('change',()=>dirty=true));$('era').onchange=()=>{localStorage.setItem('world-era',$('era').value);dirty=true};
function save(){try{localStorage.setItem('world-control-v1',JSON.stringify(Object.fromEntries(nodes.map(n=>[n.id,n.side]))))}catch(e){}}
try{const state=JSON.parse(localStorage.getItem('world-control-v1')||'{}');nodes.forEach(n=>{if(['red','blue','neutral'].includes(state[n.id]))n.side=state[n.id]});$('era').value=localStorage.getItem('world-era')||'现代'}catch(e){}
fetch('world/places.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(d=>{
 const existing=new Set(nodes.map(n=>n.name));const additions=d.filter(n=>!existing.has(n.name));
 try{const state=JSON.parse(localStorage.getItem('world-control-v1')||'{}');additions.forEach(n=>{if(['red','blue','neutral'].includes(state[n.id]))n.side=state[n.id]})}catch(e){}
 nodes.push(...additions);$('status').textContent='地理底图已加载 · '+nodes.length+'个城市与战略节点';dirty=true
}).catch(e=>console.warn('城市节点加载失败',e));
resize();frame();fetch('world/countries.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(d=>{countries=d;dirty=true}).catch(e=>console.warn('国家边界加载失败',e));fetch('world/geo.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(d=>{geo=d;$('status').textContent='地理底图已加载 · '+nodes.length+'个城市与战略节点';dirty=true}).catch(e=>{$('status').textContent='地理数据读取失败：请使用本地服务器打开';console.error(e)});
})();

// 领土染色和地形增强偏好（2D/3D共用画布）。
for(const id of ['nationOpacity','terrainSharp']){const el=$(id);el.addEventListener('input',()=>{const out=$(id+'Value');if(out)out.textContent=id==='nationOpacity'?el.value+'%':['关闭','适中','较强'][Number(el.value)];dirty=true;});}
