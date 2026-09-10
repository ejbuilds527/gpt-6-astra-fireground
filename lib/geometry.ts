export type Point={lat:number;lon:number};
export function decodePolyline(encoded:string):Point[]{
 let at=0,lat=0,lon=0;const points:Point[]=[];
 const next=()=>{let shift=0,value=0,b:number;do{if(at>=encoded.length||shift>30)throw Error('Invalid encoded polyline');b=encoded.charCodeAt(at++)-63;if(b<0||b>63)throw Error('Invalid polyline character');value|=(b&31)<<shift;shift+=5;}while(b>=32);return value&1?~(value>>1):value>>1;};
 while(at<encoded.length){lat+=next();lon+=next();points.push({lat:lat/1e5,lon:lon/1e5});}
 return points;
}
export function points(value:unknown):Point[]{
 if(typeof value==='string')return decodePolyline(value);
 if(!Array.isArray(value))return [];
 return value.map(p=>Array.isArray(p)?{lat:p[0],lon:p[1]}:{lat:p.lat,lon:p.lon??p.lng})
  .filter(p=>Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180);
}
const radians=(degrees:number)=>degrees*Math.PI/180;
function xy(p:Point,origin:Point){return {x:radians(p.lon-origin.lon)*6371008.8*Math.cos(radians(origin.lat)),y:radians(p.lat-origin.lat)*6371008.8};}
export function nearestSegment(point:Point,route:Point[]){
 if(route.length<2)throw Error('Route needs at least two points');
 let best={offset_m:Infinity,side:'ON' as 'LEFT'|'RIGHT'|'ON',segment:0};
 for(let i=1;i<route.length;i++){
  const a=xy(route[i-1],point),b=xy(route[i],point);const dx=b.x-a.x,dy=b.y-a.y;const length=dx*dx+dy*dy;if(!length)continue;
  const t=Math.max(0,Math.min(1,-(a.x*dx+a.y*dy)/length));const offset=Math.hypot(a.x+t*dx,a.y+t*dy);
  const cross=dx*(-a.y)-dy*(-a.x);
  if(offset<best.offset_m)best={offset_m:offset,side:Math.abs(cross)<1e-6?'ON':cross>0?'LEFT':'RIGHT',segment:i-1};
 }
 if(!Number.isFinite(best.offset_m))throw Error('Degenerate route');return best;
}
export function routeOverlap(a:Point[],b:Point[],tolerance:number){
 if(a.length<2||b.length<2||!Number.isFinite(tolerance)||tolerance<0)throw Error('Two route polylines and a nonnegative tolerance are required');
 const shared=a.filter(p=>nearestSegment(p,b).offset_m<=tolerance).length;
 return {pct:shared/a.length*100,points_shared:shared,points_total:a.length,tolerance_m:tolerance,method:'percentage of sampled route vertices within tolerance, not percentage of route length'};
}
export function polylineLengthFt(route:Point[]){
 let meters=0;
 for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i],dlat=radians(b.lat-a.lat),dlon=radians(b.lon-a.lon);
  const h=Math.sin(dlat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dlon/2)**2;
  meters+=6371008.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
 }return meters/0.3048;
}
export function polylinesCross(a:Point[],b:Point[]){
 const cross=(p:Point,q:Point,r:Point)=>(q.lon-p.lon)*(r.lat-p.lat)-(q.lat-p.lat)*(r.lon-p.lon);
 const on=(p:Point,q:Point,r:Point)=>Math.min(p.lon,q.lon)<=r.lon&&r.lon<=Math.max(p.lon,q.lon)&&Math.min(p.lat,q.lat)<=r.lat&&r.lat<=Math.max(p.lat,q.lat);
 for(let i=1;i<a.length;i++)for(let j=1;j<b.length;j++){
  const p=a[i-1],q=a[i],r=b[j-1],s=b[j],u=cross(p,q,r),v=cross(p,q,s),w=cross(r,s,p),x=cross(r,s,q);
  if(u*v<0&&w*x<0||u===0&&on(p,q,r)||v===0&&on(p,q,s)||w===0&&on(r,s,p)||x===0&&on(r,s,q))return true;
 }return false;
}
