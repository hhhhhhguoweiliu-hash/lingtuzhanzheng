import {freshProfile,validateProfile,type Profile} from './progression';
export interface Save {version:1;wins:number;games:number;unlocked:number;muted:boolean;seenHelp:boolean;settled:string[];profile:Profile}
const key='lingtu-replica-v1';
const defaults:Save={version:1,wins:0,games:0,unlocked:1,muted:true,seenHelp:false,settled:[],profile:freshProfile()};
export function readSave():Save {
  try{const s=JSON.parse(localStorage.getItem(key)??'null');if(!s||s.version!==1)return structuredClone(defaults);
    const num=(v:unknown,max:number)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?Math.min(v,max):0;
    return{version:1,wins:num(s.wins,1e6),games:num(s.games,1e6),unlocked:Math.max(1,num(s.unlocked,2)),muted:s.muted!==false,seenHelp:s.seenHelp===true,settled:Array.isArray(s.settled)?s.settled.filter((v:unknown)=>typeof v==='string').slice(-100):[],profile:validateProfile(s.profile)};
  }catch{return structuredClone(defaults);}
}
export function writeSave(s:Save):boolean{try{localStorage.setItem(key,JSON.stringify(s));return true;}catch{return false;}}
export function settleSave(s:Save,id:string,won:boolean):boolean{if(s.settled.includes(id))return false;s.games++;if(won){s.wins++;s.unlocked=2;}s.settled.push(id);s.settled=s.settled.slice(-100);return writeSave(s);}
