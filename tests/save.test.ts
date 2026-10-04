import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {readSave,writeSave,getSaveFailure,needsSaveInitialization} from '../src/platform/save';

let values:Map<string,string>;
beforeEach(()=>{values=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)});});
afterEach(()=>vi.unstubAllGlobals());

it('keeps legacy progression and defaults missing/invalid control preferences to single dispatch',()=>{
  const original=readSave();expect(needsSaveInitialization(original)).toBe(true);original.profile.coins=1234;original.profile.unitLevel=8;writeSave(original);
  expect(needsSaveInitialization(original)).toBe(false);
  const legacy=JSON.parse(values.get('lingtu-replica-v1')!);delete legacy.dispatchMode;delete legacy.dispatchFraction;
  values.set('lingtu-replica-v1',JSON.stringify(legacy));
  const loaded=readSave();expect(needsSaveInitialization(loaded)).toBe(false);expect(loaded.dispatchMode).toBe('budget');expect(loaded.dispatchFraction).toBe(1);
  expect(loaded.profile).toMatchObject({coins:1234,unitLevel:8});
  loaded.dispatchMode='continuous';loaded.dispatchFraction=.5;expect(writeSave(loaded)).toBe(true);
  expect(readSave()).toMatchObject({dispatchMode:'continuous',dispatchFraction:.5});
});

it('rejects a stale page without overwriting a newer balance or preferences',()=>{
  const first=readSave();writeSave(first);const stale=readSave();
  first.profile.coins-=100;first.profile.unitLevel++;first.dispatchMode='continuous';expect(writeSave(first)).toBe(true);
  stale.profile.coins+=50;expect(writeSave(stale)).toBe(false);expect(getSaveFailure()).toBe('conflict');
  expect(readSave()).toMatchObject({dispatchMode:'continuous',profile:{coins:150,unitLevel:2}});
  const fresh=readSave();fresh.muted=false;expect(writeSave(fresh)).toBe(true);expect(getSaveFailure()).toBeNull();
});

it('reports unavailable storage separately and can recover once storage is writable',()=>{
  const saved=readSave();const set=localStorage.setItem;
  localStorage.setItem=()=>{throw new Error('quota');};
  expect(writeSave(saved)).toBe(false);expect(getSaveFailure()).toBe('unavailable');
  localStorage.setItem=set;expect(writeSave(saved)).toBe(true);
});
