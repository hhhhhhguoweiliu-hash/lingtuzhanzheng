import type { GameMap, GameState, NodeState, OwnerId, Point } from '../sim/types';

export const palette: Record<OwnerId,{land:string;unit:string;bar:string}> = {
  neutral:{land:'#939493',unit:'#ffffff',bar:'#949594'},
  blue:{land:'#64c4ec',unit:'#078fc7',bar:'#45bcee'},
  brown:{land:'#ba8d69',unit:'#835025',bar:'#a46a40'},
  magenta:{land:'#d65ccc',unit:'#ab319f',bar:'#cb4cc5'},
  green:{land:'#64d7b6',unit:'#12ac84',bar:'#25c59b'},
  red:{land:'#e45555',unit:'#c90013',bar:'#dc242e'},
};
export interface VisualOptions {
  selected:string|null; target:Point|null; hovered:string|null; time:number;
  water?:Point[][]; fourPlayers?:boolean; skillReady:boolean; skillTargeting:boolean;
  tutorial:boolean; showLabels?:boolean; hud?:boolean; players?:OwnerId[]; playerY?:number;
}
const path = (points:Point[]) => { const p=new Path2D(); points.forEach((a,i)=>i?p.lineTo(a.x,a.y):p.moveTo(a.x,a.y));p.closePath();return p; };

export class BoardRenderer {
  ctx:CanvasRenderingContext2D;
  colors=structuredClone(palette);
  polygons=new Map<string,Path2D[]>();
  waterPaths:Path2D[]=[];
  backgroundPaths:Path2D[]=[];
  private terrain:HTMLCanvasElement;
  private terrainContext:CanvasRenderingContext2D;
  private terrainDirty=true;
  private terrainDashOffset=0;
  private terrainNodes:{id:string;owner:OwnerId;kind:NodeState['kind'];x:number;y:number;radius:number|undefined}[]=[];
  constructor(public canvas:HTMLCanvasElement,public map:GameMap) {
    this.ctx=canvas.getContext('2d',{alpha:false})!;
    this.terrain=canvas.ownerDocument.createElement('canvas');
    this.terrainContext=this.terrain.getContext('2d',{alpha:false})!;
    for(const n of map.nodes)this.polygons.set(n.id,(n.polygons??[]).map(path));
  }
  setWater(polys:Point[][]) { this.waterPaths=polys.map(path);this.terrainDirty=true; }
  setBackground(polys:Point[][]) { this.backgroundPaths=polys.map(path);this.terrainDirty=true; }
  setPalette(overrides:Partial<Record<OwnerId,Partial<typeof palette.blue>>>) {for(const [id,v]of Object.entries(overrides))Object.assign(this.colors[id as OwnerId],v);this.terrainDirty=true;}
  resize() {
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const w=Math.round(this.canvas.clientWidth*dpr),h=Math.round(this.canvas.clientHeight*dpr);
    if(w&&h&&(this.canvas.width!==w||this.canvas.height!==h)){this.canvas.width=w;this.canvas.height=h;}
  }
  point(clientX:number,clientY:number):Point {const r=this.canvas.getBoundingClientRect();return{x:(clientX-r.left)/r.width*this.map.width,y:(clientY-r.top)/r.height*this.map.height};}
  hit(p:Point):string|null {
    // A node's generous touch target takes priority over the region below it.
    const near=this.map.nodes.map(n=>({n,d:Math.hypot(n.anchor.x-p.x,n.anchor.y-p.y)})).filter(a=>a.d<32).sort((a,b)=>a.d-b.d)[0];
    if(near)return near.n.id;
    for(const [id,shapes]of this.polygons)for(const shape of shapes)if(this.ctx.isPointInPath(shape,p.x,p.y))return id;
    return null;
  }
  draw(state:GameState,o:VisualOptions) {
    this.resize();const c=this.ctx; const sx=this.canvas.width/this.map.width,sy=this.canvas.height/this.map.height;
    this.drawTerrain(state,sx,sy);
    // Copy at backing-store size, avoiding a second resampling at fractional DPR.
    c.setTransform(1,0,0,1,0,0);c.drawImage(this.terrain,0,0);
    c.setTransform(sx,0,0,sy,0,0);
    c.lineJoin='round';c.lineCap='round';
    if(o.selected){const n=state.nodes.find(n=>n.id===o.selected);if(n){c.fillStyle='#ffffff36';c.strokeStyle='#fff';c.lineWidth=4;for(const p of this.polygons.get(n.id)??[]){c.fill(p);c.stroke(p);}
      if(o.target){c.beginPath();c.moveTo(n.anchor.x,n.anchor.y);c.lineTo(o.target.x,o.target.y);c.strokeStyle='#ffffffd9';c.lineWidth=7;c.setLineDash([10,9]);c.lineDashOffset=-o.time/60;c.stroke();c.setLineDash([]);c.beginPath();c.arc(o.target.x,o.target.y,21,0,Math.PI*2);c.stroke();}
    }}
    // Each emitted packet advances on its own path. Multiple columns represent a stream,
    // with a taper near the endpoints so no dot teleports sideways at departure/arrival.
    let packetOwner:OwnerId|undefined;c.lineWidth=3;
    for(const p of state.packets){
      if(packetOwner!==p.owner){packetOwner=p.owner;c.fillStyle=this.colors[p.owner].unit;c.strokeStyle=this.colors[p.owner].unit;}
      const a=p.path[0],b=p.path[p.path.length-1];const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1;
      const taper=Math.min(1,p.progress*8,(1-p.progress)*8);
      const angle=p.owner==='brown'||p.owner==='magenta'?Math.atan2(dy,dx):0;
      for(let u=0;u<Math.min(p.units,12);u++){
        const lane=(p.units>1?u-(Math.min(p.units,12)-1)/2:(p.sequenceId%5)-2)*14;
        const x=p.x-dy/l*lane*taper,y=p.y+dx/l*lane*taper;
        this.unit(p.owner,x,y,7.6,angle,false);
      }
    }
    // A periodic ray is observed; damage is still unconfirmed. No hidden loss.
    if(state.tick%45<15)for(const n of state.nodes)if(n.kind==='special_unknown'){
      const p=state.packets.find(p=>p.owner!==n.owner&&Math.hypot(p.x-n.anchor.x,p.y-n.anchor.y)<(n.coverageRadius??115)+28);
      if(p){c.beginPath();c.moveTo(n.anchor.x,n.anchor.y);c.lineTo(p.x,p.y);c.strokeStyle='#35f5ef99';c.lineWidth=3;c.stroke();}
    }
    for(const n of state.nodes)this.node(n,o.time,o.showLabels??false);
    if(o.hud!==false){if(o.fourPlayers)this.players(state,o.players,o.playerY);else this.balance(state);
    if(!o.fourPlayers)this.footer(o);}
    if(o.tutorial&&o.fourPlayers){c.fillStyle='#202323';c.font='bold 26px Arial,sans-serif';c.textAlign='center';c.fillText('拖动你的色块，占领其他颜色',360,(o.playerY??222)+94);}
    else if(o.tutorial){c.fillStyle='#ffffffeb';c.beginPath();c.roundRect(138,963,444,64,32);c.fill();c.fillStyle='#52565b';c.font='26px Arial, sans-serif';c.textAlign='center';c.fillText('拖动蓝色据点，向目标派兵',360,1005);}
    c.setTransform(1,0,0,1,0,0);
  }
  private drawTerrain(state:GameState,sx:number,sy:number) {
    const resized=this.terrain.width!==this.canvas.width||this.terrain.height!==this.canvas.height;
    if(!resized&&!this.terrainDirty&&this.terrainDashOffset===this.ctx.lineDashOffset&&this.terrainNodes.length===state.nodes.length&&state.nodes.every((n,i)=>{
      const last=this.terrainNodes[i];return last.id===n.id&&last.owner===n.owner&&last.kind===n.kind&&last.x===n.anchor.x&&last.y===n.anchor.y&&last.radius===n.coverageRadius;
    }))return;
    if(resized){this.terrain.width=this.canvas.width;this.terrain.height=this.canvas.height;}
    const c=this.terrainContext;c.setTransform(sx,0,0,sy,0,0);c.lineDashOffset=this.ctx.lineDashOffset;
    c.fillStyle='#d1d1d1';c.fillRect(0,0,this.map.width,this.map.height);
    c.fillStyle='#b4d6e0';for(const p of this.waterPaths)c.fill(p);
    c.fillStyle='#969796';for(const p of this.backgroundPaths)c.fill(p);
    c.lineJoin='round';c.lineCap='round';
    for(const n of state.nodes){c.fillStyle=this.colors[n.owner].land;c.strokeStyle='#d5d5d2';c.lineWidth=3;for(const p of this.polygons.get(n.id)??[]){c.fill(p);c.stroke(p);}}
    // Only ownership and visual geometry affect this layer; counts/ticks never
    // invalidate it or change the simulation. Dynamic rays remain in draw().
    for(const n of state.nodes)if(n.kind==='special_unknown')this.coverage(n,c);
    this.terrainNodes=state.nodes.map(n=>({id:n.id,owner:n.owner,kind:n.kind,x:n.anchor.x,y:n.anchor.y,radius:n.coverageRadius}));
    this.terrainDashOffset=this.ctx.lineDashOffset;
    this.terrainDirty=false;
  }
  private coverage(n:NodeState,c:CanvasRenderingContext2D) {
    const x=n.anchor.x,y=n.anchor.y,r=n.coverageRadius??115;
    c.save();c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle='#ffffff50';c.fill();c.clip();
    c.fillStyle=n.owner==='neutral'?'#8d737978':this.colors[n.owner].unit+'70';
    for(let py=y-r;py<y+r;py+=17)for(let px=x-r;px<x+r;px+=16){c.beginPath();c.moveTo(px,py);c.lineTo(px+2,py);c.lineTo(px+2,py+6);c.lineTo(px+5,py+6);c.lineTo(px+1,py+11);c.lineTo(px-3,py+6);c.lineTo(px,py+6);c.closePath();c.fill();}
    c.restore();c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.strokeStyle=n.owner==='neutral'?'#858080':this.colors[n.owner].unit;c.lineWidth=4;c.setLineDash([8,8]);c.stroke();c.setLineDash([]);
  }
  private unit(owner:OwnerId,x:number,y:number,r:number,angle=0,setStyle=true) {
    const c=this.ctx;if(setStyle){c.fillStyle=this.colors[owner].unit;c.strokeStyle=this.colors[owner].unit;c.lineWidth=3;}
    if(owner==='brown'){c.beginPath();c.ellipse(x,y,r*.64,r,angle,0,Math.PI*2);c.stroke();}
    else if(owner==='magenta'){c.save();c.translate(x,y);c.rotate(angle);c.beginPath();c.moveTo(-r,-r*.65);c.lineTo(r,0);c.lineTo(-r,r*.65);c.lineTo(-r*.3,0);c.closePath();c.fill();c.restore();}
    else if(owner==='green'){c.beginPath();c.moveTo(x,y-r);c.lineTo(x+r,y);c.lineTo(x,y+r);c.lineTo(x-r,y);c.closePath();c.fill();}
    else{c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}
  }
  private node(n:NodeState,time:number,debug:boolean) {
    const c=this.ctx,x=n.anchor.x,y=n.anchor.y,color=this.colors[n.owner];
    if(n.owner!=='neutral'&&n.kind!=='special_unknown'){
      const dots=Math.min(38,Math.floor(n.garrison/9));
      for(let i=0;i<dots;i++){const row=Math.floor(i/6),col=i%6;const dx=(col-2.5)*15+(row%2)*6,dy=-31-row*14;this.unit(n.owner,x+dx,y+dy,7.3,.3);}
    }
    if(n.kind==='special_unknown'){
      c.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;const px=x+23*Math.cos(a),py=y+23*Math.sin(a);i?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();c.fillStyle=n.owner==='neutral'?'#747675':color.unit;c.fill();c.strokeStyle='#fff';c.lineWidth=2.5;c.stroke();c.font='bold 23px Arial';c.textAlign='center';c.fillStyle='#c4c4c0';c.fillText('▥',x,y+8);
    }else if(n.owner==='brown'||n.owner==='magenta'){
      c.fillStyle=color.unit;c.font='900 34px "Microsoft YaHei",sans-serif';c.textAlign='center';c.fillText(n.owner==='brown'?'杨':'李',x,y+10);
    }else this.unit(n.owner,x,y,n.owner==='neutral'?17:18);
    const label=n.labelAnchor??{x,y:y+33};c.textAlign='center';c.fillStyle='#101214';c.font='bold 17px Arial,sans-serif';
    // Keep army counts legible above intersecting troop streams.
    c.strokeStyle='#ffffff55';c.lineWidth=2;c.strokeText(String(n.garrison),label.x,label.y);c.fillText(String(n.garrison),label.x,label.y);
    if(n.bonusLabel&&n.owner==='neutral'){
      c.fillStyle='#131413';c.fillRect(x-16,y-62,34,16);c.fillStyle='#fff';c.font='bold 12px Arial';c.fillText(n.bonusLabel,x+1,y-49);
      c.fillStyle='#fff';c.strokeStyle='#626861';c.lineWidth=1.5;c.beginPath();c.arc(x,y-37,7,0,Math.PI*2);c.fill();c.stroke();c.beginPath();c.roundRect(x-10,y-31,20,14,4);c.fill();c.stroke();c.fillStyle='#5dcb34';c.font='bold 21px Arial';c.fillText('+',x-10,y-21);
    }
    if(debug){c.fillStyle='#132538';c.font='13px monospace';c.fillText(n.id,x,y+51);}
  }
  private balance(state:GameState) {
    const c=this.ctx;const x=121,y=52,w=478,h=29;c.save();c.beginPath();c.roundRect(x,y,w,h,18);c.clip();let offset=x;
    // Source bar changes before capture; total armies are the current candidate.
    const totals=new Map<OwnerId,number>();
    for(const n of state.nodes)totals.set(n.owner,(totals.get(n.owner)??0)+n.garrison);
    for(const p of state.packets)totals.set(p.owner,(totals.get(p.owner)??0)+p.units);
    const total=[...totals.values()].reduce((a,b)=>a+b,0)||1;
    for(const owner of ['blue','magenta','brown','green','red','neutral'] as OwnerId[]){const span=w*(totals.get(owner)??0)/total;if(!span)continue;c.fillStyle=this.colors[owner].bar;c.fillRect(offset,y,span,h);if(offset>x){c.fillStyle='#fff';c.fillRect(offset-4,y,8,h);}offset+=span;}
    c.restore();c.beginPath();c.roundRect(x,y,w,h,18);c.strokeStyle='#fff';c.lineWidth=4;c.stroke();
  }
  private players(state:GameState,owners:OwnerId[]= ['blue','green','magenta','red'],playerY=222) {
    const c=this.ctx;owners.forEach((o,i)=>{const x=owners.length===3?250+i*137:151+i*154,y=playerY;const alive=!state.eliminated.includes(o);c.globalAlpha=alive?1:.35;c.fillStyle='#fff';c.beginPath();c.roundRect(x-65,y+8,130,46,20);c.fill();c.beginPath();c.arc(x,y-12,28,0,Math.PI*2);c.fill();c.fillStyle=this.colors[o].unit;c.beginPath();c.arc(x,y-17,14,0,Math.PI*2);c.fill();c.fillStyle=this.colors[o].bar;c.beginPath();c.ellipse(x,y+5,22,10,0,Math.PI,0);c.fill();c.fillStyle='#111';c.font='24px Arial';c.textAlign='center';c.fillText(i===0?'我':`电脑 ${i}`,x,y+43);c.globalAlpha=1;});
  }
  private footer(o:VisualOptions) {
    const c=this.ctx;c.beginPath();c.moveTo(0,1238);c.bezierCurveTo(80,1218,216,1226,271,1211);c.bezierCurveTo(294,1204,289,1140,360,1140);c.bezierCurveTo(431,1140,426,1204,449,1211);c.bezierCurveTo(504,1226,640,1218,720,1238);c.lineTo(720,1372);c.lineTo(0,1372);c.closePath();c.fillStyle='#fff';c.fill();c.strokeStyle='#aeafba';c.lineWidth=2;c.stroke();c.beginPath();c.moveTo(0,1298);c.lineTo(720,1298);c.stroke();
    c.beginPath();c.arc(360,1206,39,0,Math.PI*2);c.fillStyle=o.skillTargeting?'#42a4eb':o.skillReady?'#4163d0':'#777da4';c.fill();c.strokeStyle='#a5b1dc';c.lineWidth=4;c.stroke();c.beginPath();c.arc(360,1206,31,0,Math.PI*2);c.strokeStyle='#233c965f';c.lineWidth=2;c.stroke();
    c.fillStyle='#d3e3f2';c.beginPath();c.arc(360,1197,17,Math.PI,0);c.closePath();c.fill();c.strokeStyle='#d3e3f2';c.lineWidth=2;
    for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(360+i*15,1198);c.lineTo(360,1219);c.stroke();}c.beginPath();c.arc(360,1222,7,0,Math.PI*2);c.fill();
  }
}
