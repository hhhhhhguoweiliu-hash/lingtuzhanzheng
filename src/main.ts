import './style.css';
import './ui/home.css';
import {homeMarkup,quantity} from './ui/home';
import {beginBattle,settleBattle,buyUpgrade,getInitialUnits,getProduction,refreshEnergy,claimTask,TASKS,spin,equipSkin,type BattleMode,type SkinId} from './platform/progression';
import {arabiaMap,arabiaAppearance} from './maps/arabia';
import {homeMap} from './maps/home';
import { GameEngine, stableHash } from './sim/engine';
import type { GameMap, OwnerId, Point, Replay, SimConfig } from './sim/types';
import { longMap, longWater } from './maps/long';
import { shortMap, shortBackground } from './maps/short';
import { BoardRenderer } from './render/board';
import { PointerInput } from './input/pointer';
import { readSave, writeSave, settleSave } from './platform/save';

interface Scene { id:string; title:string; description:string; map:GameMap; water:Point[][]; background?:Point[][]; fourPlayers:boolean; players?:OwnerId[]; playerY?:number; colors?:Partial<Record<OwnerId,{land:string;unit:string;bar:string}>>; config:Partial<SimConfig> }
const scenes:Scene[]=[{id:'long',title:'三方战役',description:'长录像地图 · 蓝 / 棕 / 紫三方争夺',map:longMap,water:longWater,fourPlayers:false,
  config:{productionPerSecond:11,productionByOwner:{blue:13.7},neutralProductionPerSecond:7,neutralProductionCap:125,emitUnitsPerSecond:16,packetUnits:5,movementSpeed:80,routeMode:'any-visible',aiThinkSeconds:1.8,aiReserveMargin:12}},
{id:'short',title:'四方争霸',description:'短录像地图 · 四阵营 AI 对战',map:shortMap,water:[],background:shortBackground,fourPlayers:true,config:{productionPerSecond:8,productionByOwner:{blue:9},neutralProductionPerSecond:4,neutralProductionCap:70,productionCap:150,emitUnitsPerSecond:16,packetUnits:5,movementSpeed:80,routeMode:'any-visible',aiThinkSeconds:1.8,aiReserveMargin:8}}];
scenes.push({id:'arabia',title:'三方竞技',description:'补发录像地图 · 三方 AI 对战',map:arabiaMap,water:[],fourPlayers:true,players:['blue','brown','magenta'],playerY:290,colors:{brown:{land:'#a46cf0',unit:'#8757cf',bar:'#a46cf0'},magenta:{land:'#ee4b9b',unit:'#c9257a',bar:'#ee4b9b'}},config:{productionPerSecond:12.5,productionByOwner:{blue:13.09,brown:13.58,magenta:12.04},neutralProductionPerSecond:6.5,neutralProductionCap:80,productionCap:160,emitUnitsPerSecond:16,packetUnits:5,movementSpeed:80,routeMode:'any-visible',aiThinkSeconds:1.8,aiReserveMargin:8}});
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<section id="stage" aria-label="领土战争游戏"><canvas id="battle" aria-label="战场：拖动蓝色据点向目标派兵"></canvas><button id="back" aria-label="暂停与菜单"><span></span></button><button id="skill" aria-label="空投增援演示"></button><div id="battle-note"></div><div id="selection-note"></div><div id="toast" role="status"></div><button id="record" hidden>录制</button><button id="chat" aria-label="发送本机表情" hidden>•••</button><div id="emote" aria-live="polite" hidden></div><div id="home-view" hidden></div><div id="overlay"></div></section><aside id="dev-panel" hidden></aside>`;
const canvas=document.querySelector<HTMLCanvasElement>('#battle')!;
const overlay=document.querySelector<HTMLDivElement>('#overlay')!;
const devPanel=document.querySelector<HTMLDivElement>('#dev-panel')!;
const note=document.querySelector<HTMLDivElement>('#selection-note')!;
const battleNote=document.querySelector<HTMLDivElement>('#battle-note')!;
const skillButton=document.querySelector<HTMLButtonElement>('#skill')!;
const recordButton=document.querySelector<HTMLButtonElement>('#record')!;
const save=readSave();
const homeView=document.querySelector<HTMLDivElement>('#home-view')!;
const homeRenderer=new BoardRenderer(canvas,homeMap);
const homeState=new GameEngine(homeMap,{aiEnabled:false}).state;
let runKind:BattleMode='reference';
let activeStage=1;
let mode: 'home'|'playing'|'paused'|'result'|'info'|'settings'='home';
let chosen=0,scene=scenes[0],seed=731,runId='',engine:GameEngine,renderer:BoardRenderer,input:PointerInput;
let selected:string|null=null,target:Point|null=null,hovered:string|null=null;
let skillReady=true,skillTargeting=false,seenAction=false,settled=false,spectating=false;
let fraction=1,lastTime=0,accumulator=0,toastUntil=0,dev=false,speed=1;
let previousOwners=new Map<string,OwnerId>();
let audio:AudioContext|null=null,recorder:MediaRecorder|null=null,recordChunks:Blob[]=[];
let frameSamples:number[]=[],lastDebug=0,playback:Replay|null=null,replayIndex=0;
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const button=(id:string,label:string,kind='secondary')=>`<button id="${id}" class="${kind}">${label}</button>`;
const on=(id:string,fn:()=>void)=>document.getElementById(id)?.addEventListener('click',fn);
function modal(html:string){homeView.hidden=true;overlay.hidden=false;overlay.innerHTML=`<section class="panel">${html}</section>`;}
function toast(text:string){document.querySelector('#toast')!.textContent=text;document.querySelector('#toast')!.classList.add('visible');toastUntil=performance.now()+2600;}
function sound(kind:'send'|'capture'){
  if(save.muted)return;
  try{audio??=new AudioContext();void audio.resume();const t=audio.currentTime;const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.setValueAtTime(kind==='send'?410:650,t);osc.frequency.exponentialRampToValueAtTime(kind==='send'?560:990,t+.1);gain.gain.setValueAtTime(.07,t);gain.gain.exponentialRampToValueAtTime(.001,t+.16);osc.connect(gain);gain.connect(audio.destination);osc.start(t);osc.stop(t+.18);}catch{/* Audio is optional. */}
}
function newEngine(index:number,newSeed=731,config:Partial<SimConfig>={},mapOverride?:GameMap){
  scene=scenes[index];chosen=index;seed=newSeed;engine=new GameEngine(mapOverride??scene.map,{...scene.config,...config},seed);
  renderer=new BoardRenderer(canvas,engine.map);renderer.setWater(scene.water);renderer.setBackground(scene.background??[]);renderer.setPalette(scene.colors??{});
  if(save.profile.skin==='jade')renderer.setPalette({blue:{unit:'#009ca6'}});if(save.profile.skin==='gold')renderer.setPalette({blue:{unit:'#c9a323'}});
  input?.destroy();input=new PointerInput(renderer,{
    enabled:()=>mode==='playing'&&!playback&&!spectating,
    owned:id=>engine.getNode(id)?.owner==='blue',
    command:(from,to)=>{const r=engine.dispatch('blue',from,to,fraction);if(r.accepted){seenAction=true;save.seenHelp=true;writeSave(save);sound('send');note.textContent='';}else toast(({no_available_units:'部队正在出发，请稍候',route_unavailable:'当前规则下无法到达该目标',source_not_owned:'该区域已经易主'}as Record<string,string>)[r.reason]??'暂时无法派兵');},
    select:(id,p,h)=>{selected=id;target=p;hovered=h;note.textContent=id?'拖向目标派兵 · 点空白取消':'';},
    skill:id=>{if(!skillTargeting)return false;const n=engine.getNode(id);if(n?.owner!=='blue'){toast('请选择一个蓝色据点');return true;}if(engine.grantReward(`${runId}-airdrop`,'blue',id,100)){skillReady=false;skillTargeting=false;toast('演示增援 +100');sound('capture');}return true;},
  });
  skillReady=true;skillTargeting=false;seenAction=save.seenHelp;settled=false;spectating=false;playback=null;replayIndex=0;
  accumulator=0;previousOwners=new Map(engine.state.nodes.map(n=>[n.id,n.owner]));runId=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  skillButton.hidden=scene.fourPlayers;document.querySelector<HTMLButtonElement>('#chat')!.hidden=!scene.fourPlayers;document.querySelector<HTMLDivElement>('#emote')!.hidden=true;battleNote.textContent='';note.textContent='';frameSamples=[];
}
function persist(){save.games=save.profile.games;save.wins=save.profile.wins;if(!writeSave(save))toast('浏览器无法保存进度，本次仍可继续游戏');}
function home(){stopRecording();mode='home';newEngine(chosen);recordButton.hidden=true;skillButton.hidden=true;document.querySelector<HTMLButtonElement>('#chat')!.hidden=true;document.querySelector<HTMLButtonElement>('#back')!.hidden=true;refreshEnergy(save.profile);persist();overlay.hidden=true;homeView.hidden=false;homeView.innerHTML=homeMarkup(save.profile);for(const n of homeState.nodes)if(n.owner==='blue')n.garrison=getInitialUnits(save.profile);
  on('campaign-start',()=>start('campaign'));on('arena-start',matchmaking);on('practice',practice);on('home-battle',()=>toast('选择「开战」开始下一关'));
  on('home-settings',()=>settings('home'));on('home-how',help);on('home-info',()=>info('home'));on('home-tasks',tasks);on('home-gift',tasks);on('home-goals',tasks);on('home-wheel',wheel);on('home-skins',skins);on('home-ranking',ranking);on('home-cup',ranking);on('home-record',()=>{mode='info';modal(`<h2>录制你的战斗</h2><p class="sub">进入战斗后点击右下角「录制」。结束后保存为本机视频，也可以在暂停菜单导出可重放的指令文件。</p>${button('close','返回','primary')}`);on('close',home);});on('home-save',()=>settings('home'));on('home-share',()=>settings('home'));
  for(const kind of ['units','production']as const)on(`upgrade-${kind}`,()=>{const result=buyUpgrade(save.profile,kind);if(result.ok){persist();sound('capture');home();}else toast(result.reason??'无法升级');});
}
function practice(){mode='info';modal(`<p class="eyebrow">录像场景 · 独立挑战</p><h2>选择战场</h2><p class="sub">按录像参数开局，不消耗体力。成长数值不影响这些对照场景。</p>${scenes.map((s,i)=>`<button class="mode ${chosen===i?'active':''}" id="scene-${i}"><span class="mode-icon">${i+1}</span><span><strong>${s.title}</strong><small>${s.description}</small></span></button>`).join('')}${button('start','开始战斗','primary')}${button('close','返回首页')}`);scenes.forEach((_,i)=>on(`scene-${i}`,()=>{chosen=i;practice();}));on('start',()=>start('reference'));on('close',home);}
function campaignSetup(index:number){const map=structuredClone(scenes[index].map),p=save.profile,units=getInitialUnits(p),baseRate=getProduction(p),difficulty=1+Math.min(p.stage-1,30)*.025;map.id+=`-stage${p.stage}-u${p.unitLevel}-p${p.productionLevel}`;
  for(const n of map.nodes){n.garrison=n.owner==='blue'?units:n.owner==='neutral'?Math.max(5,Math.round(4+difficulty*(p.stage-1)*.5)):Math.max(9,Math.round((9+(p.stage-1)*.8)*difficulty));n.productionCap=undefined;n.productionPerSecond=undefined;}
  return{map,config:{productionPerSecond:Math.min(baseRate*.9,.9+(p.stage-1)*.09),productionByOwner:{blue:baseRate},neutralProductionPerSecond:Math.max(.45,baseRate*.45),neutralProductionCap:Math.max(5,Math.round(4+difficulty*(p.stage-1)*.5)),productionCap:Math.max(25,Math.ceil(units*1.5)),packetUnits:1,emitUnitsPerSecond:Math.max(8,Math.min(16,units*.8)),aiReserveMargin:1,aiThinkSeconds:2.6} as Partial<SimConfig>};}
function start(kind:BattleMode=runKind){runKind=kind;activeStage=save.profile.stage;const index=kind==='campaign'?[2,0,1][(save.profile.stage-1)%3]:kind==='pvp'?2:chosen;
  const prepared=kind==='campaign'?campaignSetup(index):null;
  let map=prepared?.map,config=prepared?.config??{};
  if(kind==='pvp'){const preparedPvp=campaignSetup(2);map=preparedPvp.map;config=preparedPvp.config;map.id+='-pvp';}
  newEngine(index,731+save.profile.games,config,map);
  const cost=beginBattle(save.profile,runId,Date.now(),kind);if(!cost.ok){home();toast(cost.reason??'无法开战');return;}persist();mode='playing';homeView.hidden=true;overlay.hidden=true;document.querySelector<HTMLButtonElement>('#back')!.hidden=false;recordButton.hidden=false;battleNote.textContent=kind==='reference'?'录像参数 · AI 对战':kind==='pvp'?'AI 竞技 · 本机对战':`第 ${activeStage} 关`;lastTime=performance.now();
}
function matchmaking(){mode='info';const p=save.profile;modal(`<p class="eyebrow">PVP 外观 · AI 竞技</p><h2>玩家 VS 玩家</h2><div class="rank-list"><div class="rank-row me"><span>● 我</span><span>⚑ ${getInitialUnits(p)} · ${getProduction(p).toFixed(2)}/秒</span></div><div class="rank-row"><span>● 电脑 1</span><span>准备就绪</span></div><div class="rank-row"><span>● 电脑 2</span><span>准备就绪</span></div></div><p class="sub">当前对手是本机 AI，无需联网匹配。</p>${button('pvp-confirm','进入竞技','primary')}${button('close','返回')}`);on('pvp-confirm',()=>start('pvp'));on('close',home);}
function tasks(){mode='info';modal(`<h2>任务</h2>${TASKS.map(t=>{const current=t.id==='play1'?save.profile.games:save.profile.wins,claimed=save.profile.taskClaims.includes(t.id);return `<div class="task-row"><div><b>${t.label}</b><br><small>${Math.min(current,t.target)}/${t.target} · 🟡 ${t.reward}</small></div><button id="task-${t.id}" ${claimed||current<t.target?'disabled':''}>${claimed?'已领取':'领取'}</button></div>`;}).join('')}<p class="tiny">本机成长目标。原录像未展示任务内页，奖励为当前版本设定。</p>${button('close','返回','primary')}`);for(const t of TASKS)on(`task-${t.id}`,()=>{const r=claimTask(save.profile,t.id);if(r.ok){persist();tasks();toast(`金币 +${r.coins}`);}else toast(r.reason??'暂不可领取');});on('close',home);}
function wheel(){mode='info';modal(`<h2>幸运转盘</h2><div class="wheel"><span>每日一次</span></div><p class="sub">金币或外观奖励</p>${button('spin','免费抽取','primary')}<p class="tiny">本机演示规则：100金币60%，200金币30%，500金币5%，翡翠外观5%（已拥有时250金币）。原版奖池未在录像展示。</p>${button('close','返回')}`);on('spin',()=>{const r=spin(save.profile);if(r.ok){persist();toast(r.skin?'获得翡翠外观':`金币 +${r.coins}`);document.querySelector<HTMLButtonElement>('#spin')!.disabled=true;}else toast(r.reason??'抽取未完成');});on('close',home);}
function skins(){mode='info';const entries:[SkinId,string,string,string][]=[['blue','经典蓝','●','默认'],['jade','翡翠','◆','累计3胜或转盘'],['gold','鎏金','●','累计10胜']];modal(`<h2>部队皮肤</h2><div class="skin-list">${entries.map(([id,name,icon,condition])=>`<button class="skin-choice ${save.profile.skin===id?'active':''}" id="skin-${id}"><b>${icon}</b><span>${name}</span><br><small>${save.profile.ownedSkins.includes(id)?save.profile.skin===id?'使用中':'已拥有':condition}</small></button>`).join('')}</div><p class="tiny">仅改变单位外观，不增加战斗属性。</p>${button('close','返回','primary')}`);for(const [id]of entries)on(`skin-${id}`,()=>{const r=equipSkin(save.profile,id);if(r.ok){persist();skins();}else toast(r.reason??'尚未解锁');});on('close',home);}
function ranking(){mode='info';modal(`<p class="eyebrow">本机战绩</p><h2>联赛</h2><div class="stats"><div class="stat"><strong>${save.profile.stars}</strong><small>竞技星数</small></div><div class="stat"><strong>${save.profile.wins}</strong><small>胜利</small></div><div class="stat"><strong>${save.profile.games}</strong><small>已完成对局</small></div></div><p class="sub">每场 AI 竞技胜利获得 5 星。<br>当前没有联网排行榜。</p>${button('close','返回','primary')}`);on('close',home);}
function pause(){if(mode!=='playing')return;input.clear();skillTargeting=false;mode='paused';accumulator=0;
  modal(`<p class="eyebrow">${scene.title}</p><h2>已暂停</h2><p class="sub">${formatTime(engine.seconds)} · 己方 ${engine.state.nodes.filter(n=>n.owner==='blue').length} 处领地</p>${button('resume','继续战斗','primary')}${button('retry','重新开始')}${button('return','返回首页')}<div class="actions">${button('settings','设置','text-button')}${button('export','导出回放','text-button')}${button('about','还原说明','text-button')}</div>`);
  on('resume',resume);on('retry',()=>{stopRecording();start();});on('return',home);on('export',exportReplay);on('about',()=>info('paused'));on('settings',()=>settings('paused'));
}
function resume(){mode='playing';homeView.hidden=true;overlay.hidden=true;accumulator=0;lastTime=performance.now();}
function backTo(where:'home'|'paused'){if(where==='home')home();else{mode='playing';pause();}}
function help(){mode='info';modal(`<h2>指挥你的部队</h2><div class="instructions"><p><strong>拖动派兵</strong><br>按住蓝色据点，拖到目标区域后松开。部队逐批出发，陆续抵达并消耗守军。</p><p><strong>扩张与增援</strong><br>占领新区域可增加产兵点；向自己的区域派兵，就是增援。也可以先点己方，再点目标。</p><p><strong>取消与暂停</strong><br>拖到空白处松开会取消指令。左上角按钮暂停。电脑可按 <span class="key">空格</span> 暂停/继续。</p><p>蓝色代表你；其他有色阵营为电脑。灰色中立据点不主动出兵，但会恢复驻军。</p></div>${button('close','知道了','primary')}`);on('close',home);}
function info(where:'home'|'paused') {mode='info';modal(`<h2>还原说明</h2><div class="instructions"><p><strong>已依据原录像实现</strong><br>地图轮廓与据点位置、三方配色、连续兵流、逐包交战、占领改色、250 附近停止自然生产，以及可超过上限的增援。</p><p><strong>仍是待验证的规则</strong><br>发兵采用一次预算分批发射；初始有色据点按200恢复。产兵、速度、AI及兵力比例条根据可见片段拟合，尚不等同原版公式。</p><p><strong>特殊据点与空投</strong><br>覆盖圈目前只有视觉；空投是每局一次的 +100 演示，未接广告。默认不会让未知覆盖圈暗中造成伤害。</p><p><strong>素材缺口</strong><br>L/S录像从战斗中途开始；补发A包含首页与完整竞技。补发录像已还原首页布局、两种升级、竞技入口及胜利结算。视频账号在第88关，早期关卡、升级成本曲线与任务/转盘/皮肤内页未完整展示；当前从第1关开始的成长与这些内页是明确的候选实现。</p><p>当前是本机 AI 对战，没有真人联机。源码与差异报告随试玩包提供。</p></div>${button('close','返回','primary')}`);on('close',()=>backTo(where));}
function settings(where:'home'|'paused') {mode='settings';modal(`<h2>设置</h2><label class="setting">音效<input id="mute" type="checkbox" ${save.muted?'':'checked'}></label><label class="setting">派兵比例<select id="fraction"><option value="1">全部可用兵力</option><option value="0.75">75%</option><option value="0.5">50%</option></select></label><p class="tiny">比例选择是辅助操作。默认全部派出，数值尚未由原版输入录像证实。</p>${button('import','读取本机回放')}<input id="replay-file" type="file" accept="application/json,.json" hidden>${button('close','返回','primary')}`);
  (document.querySelector('#fraction')as HTMLSelectElement).value=String(fraction);
  document.querySelector('#fraction')!.addEventListener('change',e=>{fraction=Number((e.target as HTMLSelectElement).value);});
  document.querySelector('#mute')!.addEventListener('change',e=>{save.muted=!(e.target as HTMLInputElement).checked;writeSave(save);sound('send');});
  on('close',()=>backTo(where));on('import',()=>document.querySelector<HTMLInputElement>('#replay-file')!.click());
  document.querySelector('#replay-file')!.addEventListener('change',async e=>{const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;try{if(file.size>2_000_000)throw Error('回放文件过大');const data=JSON.parse(await file.text());if(!Number.isInteger(data.endTick)||data.endTick<0||data.endTick>108000)throw Error('回放时长超出60分钟限制');const index=data.sceneId?scenes.findIndex(s=>s.id===data.sceneId):scenes.findIndex(s=>stableHash(s.map)===data.mapHash);if(index<0)throw Error('回放的场景版本不匹配');const replayMap=data.map??scenes[index].map;if(!Array.isArray(replayMap.nodes)||replayMap.nodes.length>200||stableHash(replayMap)!==data.mapHash)throw Error('回放地图校验失败');GameEngine.fromReplay(replayMap,data);newEngine(index,data.seed,data.config,replayMap);playback=data;document.querySelector<HTMLButtonElement>('#back')!.hidden=false;mode='playing';homeView.hidden=true;overlay.hidden=true;recordButton.hidden=false;battleNote.textContent='回放中 · 不接受操作';}catch(error){toast(error instanceof Error?error.message:'无法读取回放');}});
}
function formatTime(seconds:number){return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;}
function result(won:boolean){if(settled)return;settled=true;mode='result';input.clear();stopRecording();recordButton.hidden=true;const award=settleBattle(save.profile,runId,won,{captured:engine.state.nodes.filter(n=>n.owner==='blue').length});persist();
  modal(`<div class="ribbon">${won?'你赢了':'再接再厉'}</div><p class="eyebrow">${scene.title}</p><h2>${runKind==='pvp'?'AI 竞技':runKind==='campaign'?`第 ${activeStage} 关`:'录像挑战'}</h2><p class="sub">${won?'你的部队掌控了战局。':'调整扩张路线，再来一次。'}</p><div class="stats"><div class="stat"><strong>${formatTime(engine.seconds)}</strong><small>战斗用时</small></div><div class="stat"><strong>${engine.state.nodes.filter(n=>n.owner==='blue').length}</strong><small>己方领地</small></div><div class="stat"><strong>${engine.state.stats.commands}</strong><small>各方指令</small></div></div><div class="reward-strip">当前获得： ★ ${award.stars??0}　🟡 ${quantity(award.coins??0)}</div>${button('again',won&&runKind==='campaign'?'下一关':'再来一局','primary')}${!won&&!engine.state.winner?button('watch','继续观战'):''}${button('return','返回首页')}<div class="actions">${button('export','保存本局回放','text-button')}</div>`);
  on('again',()=>start(runKind));on('return',home);on('export',exportReplay);on('watch',()=>{spectating=true;mode='playing';overlay.hidden=true;battleNote.textContent='观战中 · AI 对战';});
}
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportReplay(){const data={...engine.exportReplay(),map:engine.map,sceneId:scene.id};download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),`领土战争-${scene.id}-${seed}-回放.json`);}
function startRecording(){try{const type=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));if(!type)throw Error();recordChunks=[];recorder=new MediaRecorder(canvas.captureStream(30),{mimeType:type});recorder.ondataavailable=e=>{if(e.data.size)recordChunks.push(e.data);};recorder.onstop=()=>{download(new Blob(recordChunks,{type:'video/webm'}),`领土战争-${Date.now()}.webm`);recorder=null;recordButton.textContent='录制';};recorder.start();recordButton.textContent='停止录制';toast('正在录制本次游戏画面（无音轨）');}catch{toast('当前浏览器不支持录制，可保存指令回放');}}
function stopRecording(){if(recorder?.state==='recording')recorder.stop();}
recordButton.onclick=()=>recorder?.state==='recording'?stopRecording():startRecording();
document.querySelector('#back')!.addEventListener('click',()=>{if(mode==='playing')pause();else if(mode==='paused')resume();else home();});
skillButton.addEventListener('click',()=>{if(mode!=='playing'||playback||spectating)return;if(!skillReady){toast('本局演示空投已使用');return;}skillTargeting=!skillTargeting;input.clear();toast(skillTargeting?'演示空投：点击己方据点增援 100 人':'已取消空投');});
document.querySelector('#chat')!.addEventListener('click',()=>{
  if(mode!=='playing')return;mode='paused';input.clear();accumulator=0;
  modal(`<h2>表情</h2><div class="skin-list">${['🙂','😎','👍','⚔️'].map((emoji,i)=>`<button class="skin-choice" id="emoji-${i}" aria-label="表情 ${emoji}"><b>${emoji}</b></button>`).join('')}</div><p class="tiny">本机表情，不发送到网络。</p>${button('close','返回战斗')}`);
  ['🙂','😎','👍','⚔️'].forEach((emoji,i)=>on(`emoji-${i}`,()=>{const e=document.querySelector<HTMLDivElement>('#emote')!;e.textContent=emoji;e.hidden=false;resume();setTimeout(()=>e.hidden=true,2600);}));on('close',resume);
});
document.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;if(e.key===' '||e.key==='Escape'){e.preventDefault();if(mode==='playing')pause();else if(mode==='paused')resume();}if(e.key==='F2'){e.preventDefault();dev=!dev;devPanel.hidden=!dev;renderDev();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')pause();lastTime=performance.now();accumulator=0;});
window.addEventListener('blur',()=>{input?.clear();if(mode==='playing')pause();});
function renderDev(){if(!dev)return;devPanel.innerHTML=`<strong>研究面板 · 不影响原版结论</strong><pre id="debug-data"></pre><button id="d-auto">${engine.config.playerAI?'关闭':'开启'}蓝方AI</button><button id="d-speed">速度 ${speed}×</button><button id="d-cancel">取消蓝方待发队列</button><button id="d-shot">保存战场截图</button><button id="d-export">导出回放</button><p>地图描摹来自原帧；参考截图未作为游戏背景。配置为待校准候选。</p>`;
  on('d-auto',()=>{engine.setPlayerAI(!engine.config.playerAI);renderDev();});on('d-speed',()=>{speed=speed===1?3:speed===3?10:1;renderDev();});on('d-cancel',()=>{for(const n of engine.state.nodes)if(n.owner==='blue')engine.cancel(n.id);});on('d-export',exportReplay);on('d-shot',()=>canvas.toBlob(b=>b&&download(b,`战场-${engine.state.tick}.png`)));}
function applyPlayback(){if(!playback)return;while(replayIndex<playback.commands.length&&playback.commands[replayIndex].tick===engine.state.tick){const c=playback.commands[replayIndex++];if(c.kind==='dispatch')engine.dispatch(c.owner,c.sourceId,c.targetId,c.fraction);else if(c.kind==='cancel')engine.cancel(c.sourceId);else if(c.kind==='reward')engine.grantReward(c.id,c.owner,c.targetId,c.units);else engine.setPlayerAI(c.enabled);}}
function finishPlayback(){mode='paused';accumulator=0;modal(`<h2>回放结束</h2><p class="sub">已重放至 ${formatTime(engine.seconds)}</p>${button('replay-home','返回首页','primary')}`);on('replay-home',home);}
function loop(now:number){const dt=lastTime?Math.min(100,now-lastTime):0;lastTime=now;
  if(mode==='playing'){
    if(dt>0){frameSamples.push(dt);if(frameSamples.length>18000)frameSamples.shift();}accumulator+=dt*speed;
    while(accumulator>=1000/engine.config.tickRate&&mode==='playing'){
      applyPlayback();
      if(playback&&engine.state.tick>=playback.endTick){finishPlayback();break;}
      engine.step();accumulator-=1000/engine.config.tickRate;
      if(playback&&engine.state.tick>=playback.endTick){applyPlayback();finishPlayback();break;}
      if(!spectating&&!playback&&engine.state.eliminated.includes('blue'))result(false);
      else if(engine.state.winner){if(spectating){mode='result';modal(`<h2>战斗结束</h2><p class="sub">${({blue:'蓝方',brown:'棕方',magenta:'紫方',green:'绿方',red:'红方',neutral:'中立'})[engine.state.winner]}获胜</p>${button('return','返回首页','primary')}`);on('return',home);}else if(!playback)result(engine.state.winner==='blue');break;}
    }
    for(const n of engine.state.nodes){if(previousOwners.get(n.id)!==n.owner){if(n.owner==='blue')sound('capture');previousOwners.set(n.id,n.owner);}}
  }
  if(mode==='home')homeRenderer.draw(homeState,{selected:null,target:null,hovered:null,time:now,skillReady:false,skillTargeting:false,tutorial:false,hud:false});
  else renderer.draw(engine.state,{selected,target,hovered,time:now,skillReady,skillTargeting,tutorial:mode==='playing'&&!seenAction&&!playback&&!spectating,fourPlayers:scene.fourPlayers,players:scene.players,playerY:scene.playerY,showLabels:dev});
  if(toastUntil&&now>toastUntil){document.querySelector('#toast')!.classList.remove('visible');toastUntil=0;}
  if(dev&&now-lastDebug>400){lastDebug=now;const p=document.querySelector('#debug-data');if(p)p.textContent=JSON.stringify({tick:engine.state.tick,time:formatTime(engine.seconds),seed,config:stableHash(engine.config),map:stableHash(engine.map),packets:engine.state.packets.length,queued:engine.state.queues.length,fps:frameSamples.length?+(1000/(frameSamples.reduce((a,b)=>a+b,0)/frameSamples.length)).toFixed(1):0,stats:engine.state.stats,commands:engine.state.ledger.filter(e=>e.kind==='ai').slice(-3)},null,2);}
  requestAnimationFrame(loop);
}
newEngine(0);home();requestAnimationFrame(loop);
// Read-only diagnostics let browser checks inspect actual state, never silently mutate it.
(window as unknown as {lingtu:unknown}).lingtu={getState:()=>engine.snapshot(),getMode:()=>mode,getReplay:()=>engine.exportReplay(),getPerformance:()=>({frames:frameSamples.length,meanMs:frameSamples.reduce((a,b)=>a+b,0)/(frameSamples.length||1),p95Ms:[...frameSamples].sort((a,b)=>a-b)[Math.floor(frameSamples.length*.95)]??0}),getScene:()=>engine.map};
