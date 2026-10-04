import type {DispatchMode, GameState} from '../sim/types';

/** Ordinary player controls. They issue commands; they never mutate simulation state. */
export class CommandControls {
  private bar:HTMLDivElement;
  private modeButton:HTMLButtonElement;
  private stopButton:HTMLButtonElement;
  private routes:SVGSVGElement;
  private routeGroup:SVGGElement;
  private signature='';
  constructor(stage:HTMLElement,callbacks:{settings:()=>void;stop:()=>void}) {
    this.routes=document.createElementNS('http://www.w3.org/2000/svg','svg');
    this.routes.id='command-routes';this.routes.setAttribute('aria-hidden','true');
    this.routes.innerHTML='<defs><marker id="command-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#137fb3"/></marker></defs><g></g>';
    this.routeGroup=this.routes.querySelector('g')!;
    stage.insertBefore(this.routes,stage.querySelector('#back'));
    this.bar=document.createElement('div');this.bar.id='command-controls';this.bar.hidden=true;
    this.bar.innerHTML='<button id="command-settings" aria-label="设置派兵方式"></button><button id="stop-orders" hidden>停止派兵</button>';
    stage.append(this.bar);
    this.modeButton=this.bar.querySelector('#command-settings')!;
    this.stopButton=this.bar.querySelector('#stop-orders')!;
    this.modeButton.addEventListener('click',callbacks.settings);
    this.stopButton.addEventListener('click',callbacks.stop);
  }
  update(state:GameState,selected:string|null,mode:DispatchMode,interactive:boolean,width:number,height:number) {
    this.bar.hidden=!interactive;
    this.routes.toggleAttribute('hidden',!interactive);
    const text=(mode==='continuous'?'持续派兵':'单次派兵')+' ▾';
    if(this.modeButton.textContent!==text)this.modeButton.textContent=text;
    this.stopButton.hidden=!interactive||!selected||!state.queues.some(q=>q.owner==='blue'&&q.sourceId===selected);
    this.routes.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const queues=interactive?state.queues.filter(q=>q.owner==='blue'&&q.mode==='continuous'):[];
    const signature=JSON.stringify([selected,width,height,queues.map(q=>[q.sourceId,q.targetId,q.path])]);
    if(signature===this.signature)return;
    this.signature=signature;this.routeGroup.replaceChildren();
    for(const q of queues){
      const line=document.createElementNS('http://www.w3.org/2000/svg','path');
      // Keep the arrow just before the destination glyph so the number remains legible.
      const points=q.path.map(p=>({...p}));
      if(points.length>1){const last=points.at(-1)!,prev=points.at(-2)!,d=Math.hypot(last.x-prev.x,last.y-prev.y);const inset=Math.min(28,d*.25);if(d){last.x-=(last.x-prev.x)/d*inset;last.y-=(last.y-prev.y)/d*inset;}}
      line.setAttribute('d',points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' '));
      line.setAttribute('marker-end','url(#command-arrow)');
      line.classList.toggle('selected-route',q.sourceId===selected);
      this.routeGroup.append(line);
    }
  }
}
