import type { Point } from '../sim/types';
import type { BoardRenderer } from '../render/board';

export interface InputCallbacks {
  enabled:()=>boolean; owned:(id:string)=>boolean;
  command:(source:string,target:string)=>void;
  select:(id:string|null,p:Point|null,hover:string|null)=>void;
  skill:(target:string)=>boolean;
}
export class PointerInput {
  selected:string|null=null;
  down:{id:number;clientX:number;clientY:number;source:string|null;previous:string|null}|null=null;
  abort=new AbortController();
  constructor(public board:BoardRenderer,public cb:InputCallbacks){
    const canvas=board.canvas,opts={signal:this.abort.signal};
    canvas.addEventListener('pointerdown',e=>{if(!cb.enabled()||this.down||e.button>0)return;e.preventDefault();const p=board.point(e.clientX,e.clientY),hit=board.hit(p);
      if(hit&&cb.skill(hit)){this.clear();return;}
      canvas.setPointerCapture(e.pointerId);const previous=this.selected;const source=hit&&cb.owned(hit)?hit:null;
      this.down={id:e.pointerId,clientX:e.clientX,clientY:e.clientY,source,previous};
      if(source){this.selected=source;cb.select(source,p,hit);}
    },opts);
    canvas.addEventListener('pointermove',e=>{if(!this.down||!cb.enabled()||this.down.id!==e.pointerId)return;const p=board.point(e.clientX,e.clientY);if(this.down.source)cb.select(this.down.source,p,board.hit(p));},opts);
    canvas.addEventListener('pointerup',e=>{
      if(!this.down||this.down.id!==e.pointerId)return;const d=this.down;this.down=null;
      if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
      if(!cb.enabled()){this.clear();return;}
      const p=board.point(e.clientX,e.clientY),hit=board.hit(p),dragged=Math.hypot(e.clientX-d.clientX,e.clientY-d.clientY)>7;
      const from=!dragged&&d.previous&&hit!==d.previous?d.previous:d.source??(!dragged?d.previous:null);
      if(from&&hit&&from!==hit){cb.command(from,hit);this.clear();}
      else if(!dragged&&d.source){this.selected=d.source;cb.select(d.source,null,null);}
      else this.clear();
    },opts);
    canvas.addEventListener('pointercancel',e=>{if(this.down?.id===e.pointerId)this.clear();},opts);
    canvas.addEventListener('lostpointercapture',e=>{if(this.down?.id===e.pointerId)this.clear();},opts);
  }
  clear(){const id=this.down?.id;this.selected=null;this.down=null;if(id!==undefined&&this.board.canvas.hasPointerCapture(id))this.board.canvas.releasePointerCapture(id);this.cb.select(null,null,null);}
  destroy(){this.abort.abort();this.clear();}
}
