import {freshProfile,validateProfile,type Profile} from './progression';
import type {DispatchMode} from '../sim/types';
export interface Save {version:1;wins:number;games:number;unlocked:number;muted:boolean;seenHelp:boolean;settled:string[];profile:Profile;dispatchMode:DispatchMode;dispatchFraction:number}
const key='lingtu-replica-v1';
const defaults:Save={version:1,wins:0,games:0,unlocked:1,muted:true,seenHelp:false,settled:[],profile:freshProfile(),dispatchMode:'budget',dispatchFraction:1};
const baselines=new WeakMap<Save,string|null>();
const uninitialized=new WeakSet<Save>();
let failure:'conflict'|'unavailable'|null=null;
export function getSaveFailure(){return failure;}
export function needsSaveInitialization(s:Save){return uninitialized.has(s);}
function freshSave(raw:string|null){const fresh=structuredClone(defaults);baselines.set(fresh,raw);uninitialized.add(fresh);return fresh;}
export function readSave():Save {
  let raw:string|null=null;
  try{raw=localStorage.getItem(key);const s=JSON.parse(raw??'null');if(!s||s.version!==1)return freshSave(raw);
    const num=(v:unknown,max:number)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?Math.min(v,max):0;
    const save:Save={version:1,wins:num(s.wins,1e6),games:num(s.games,1e6),unlocked:Math.max(1,num(s.unlocked,2)),muted:s.muted!==false,seenHelp:s.seenHelp===true,settled:Array.isArray(s.settled)?s.settled.filter((v:unknown)=>typeof v==='string').slice(-100):[],profile:validateProfile(s.profile),dispatchMode:s.dispatchMode==='continuous'?'continuous':'budget',dispatchFraction:[1,.75,.5].includes(s.dispatchFraction)?s.dispatchFraction:1};
    baselines.set(save,raw);return save;
  }catch{return freshSave(raw);}
}
/** Refuse stale-tab writes rather than combining balances or silently losing a newer save. */
export function writeSave(s:Save):boolean{
  failure=null;
  try{
    const current=localStorage.getItem(key);
    if(!baselines.has(s)||current!==baselines.get(s)){failure='conflict';return false;}
    const next=JSON.stringify(s);
    if(current!==next)localStorage.setItem(key,next);
    baselines.set(s,next);uninitialized.delete(s);return true;
  }catch{failure='unavailable';return false;}
}
export function settleSave(s:Save,id:string,won:boolean):boolean{if(s.settled.includes(id))return false;s.games++;if(won){s.wins++;s.unlocked=2;}s.settled.push(id);s.settled=s.settled.slice(-100);return writeSave(s);}
