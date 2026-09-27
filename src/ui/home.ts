import { getInitialUnits, getProduction, getUpgradeCost, type Profile } from '../platform/progression';

export function quantity(n:number):string {return n>=10000?`${(n/1000).toFixed(2)}K`:Math.floor(n).toLocaleString('en-US');}
function icon(id:string):string {
 const shape=id==='home-wheel'?'<circle cx="32" cy="31" r="24" fill="#b46cdb"/><circle cx="32" cy="31" r="19" fill="#dd91ed"/><path d="M32 12v38M13 31h38M19 18l27 27M19 44l27-27" stroke="#fde867"/><circle cx="32" cy="31" r="7" fill="#ffe37a"/><path d="M25 5h14l-7 12z" fill="#ff647f"/>':
 id==='home-ranking'?'<path d="M6 56V30h17v26M24 56V12h17v44M42 56V38h17v18" fill="#ffbd39"/><path d="M30 21h6v24M12 36h7v9h-7v8M47 43h7v10h-7" stroke="#e5852e" fill="none"/>':
 id==='home-record'?'<rect x="8" y="23" width="48" height="34" rx="3" fill="#62a6e2"/><path d="M8 22l45-11 3 12-45 11z" fill="#7379ba"/><path d="M19 19l-5 11M33 16l-5 11M47 13l-5 11" stroke="white" stroke-width="5"/><path d="M28 36l14 8-14 8z" fill="white" stroke="none"/>':
 id==='home-skins'?'<path d="M20 12l-15 9 9 14 8-4v27h23V31l8 4 8-14-16-9q-13 12-25 0z" fill="#66bcec"/><path d="M25 14q7 7 15 0" stroke="#acdffa"/>':
 id==='home-cup'?'<path d="M18 10h28v12q0 20-14 20T18 22z" fill="#ffbf36"/><path d="M18 15H8v10q0 13 16 13M46 15h10v10q0 13-16 13" fill="none" stroke="#e99d19" stroke-width="5"/><path d="M29 41h6v11H21v6h23v-6H35" fill="#faba2e"/><path d="M32 19l3 6h7l-6 5 2 7-6-4-6 4 2-7-6-5h7z" fill="#fff2a0" stroke="none"/>':
 id==='home-tasks'?'<rect x="12" y="9" width="39" height="47" rx="5" fill="#80c8ec"/><rect x="18" y="15" width="27" height="34" fill="#b5e9ef"/><rect x="22" y="5" width="19" height="10" rx="3" fill="#8ba4e0"/><path d="M23 24h17M23 32h17" stroke="#a0b7c3"/><circle cx="47" cy="46" r="13" fill="#6bcb63"/><path d="M39 46l6 5 10-13" fill="none" stroke="#fff"/>':
 id==='home-gift'?'<rect x="8" y="18" width="48" height="39" rx="3" fill="#f6b235"/><path d="M8 18h48v13H8zM26 18h12v39H26z" fill="#ea6734"/><path d="M31 18C7 19 14-4 26 7l6 10C52-4 61 18 32 18" fill="#ffd168"/>':
 id==='home-how'?'<circle cx="21" cy="19" r="10" fill="#69b5ef"/><circle cx="43" cy="19" r="10" fill="#69b5ef"/><path d="M6 50q0-24 16-24t16 24M30 50q0-24 16-24t14 24" fill="#72baf0"/><path d="M44 38v18M37 47h16" stroke="#53c362" stroke-width="7"/>':
 '<path d="M18 32l29-17M18 32l29 17" fill="none" stroke="#f3b328" stroke-width="7"/><circle cx="15" cy="32" r="10" fill="#ffcb46"/><circle cx="47" cy="14" r="9" fill="#ffcb46"/><circle cx="47" cy="50" r="9" fill="#ffcb46"/>';
 return `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="#777da6" stroke-width="1.5" stroke-linejoin="round">${shape}</svg>`;
}
const badge=(id:string,_icon:string,label:string,color:string)=>`<button id="${id}" class="home-badge" style="--icon-color:${color}"><span>${icon(id)}</span><small>${label}</small></button>`;
export function homeMarkup(p:Profile):string {
  return `<div class="home-top"><button id="home-settings" class="gear" aria-label="设置">⚙</button><div class="wallet"><span class="energy">ϟ</span><b>${p.energy}</b><small>+</small></div><div class="wallet"><span class="gem">◆</span><b>${p.gems}</b></div><div class="wallet"><span class="coin">●</span><b>${quantity(p.coins)}</b></div></div>
  <div class="home-left">${badge('home-share','●','本机回放','#efa519')}${badge('home-how','♟','操作说明','#55bceb')}${badge('home-tasks','▣','任务','#4fa2cf')}${badge('home-gift','✣','新手目标','#ef9238')}</div>
  <div class="home-right">${badge('home-wheel','◉','幸运转盘','#ba69d8')}${badge('home-ranking','▥','战绩','#efa728')}${badge('home-record','▰','录屏','#568fd3')}${badge('home-skins','♜','皮肤','#5ab5e0')}${badge('home-cup','♜','联赛','#e79c2d')}</div>
  <div class="home-start"><button id="campaign-start" class="green-start"><strong>开战 <small>ϟ -5</small></strong><span>第${p.stage}关</span></button><button id="arena-start" class="pvp-start"><strong>⚔</strong><span>PVP</span><small>AI 演示</small></button></div>
  <div class="map-disclaimer">本游戏内使用地图均为虚拟地图</div>
  <div class="upgrade-list"><div class="upgrade-row"><div class="upgrade-icon">⚑</div><div class="upgrade-description"><b>初始单位 <em>Lv${p.unitLevel}</em></b><strong>${getInitialUnits(p)} <i>›</i> <span>${getInitialUnits(p)+1}</span></strong></div><button id="upgrade-units" class="upgrade-buy" ${p.coins<getUpgradeCost('units',p.unitLevel)?'disabled':''}><span>🟡 ${quantity(getUpgradeCost('units',p.unitLevel))}</span><strong>升级</strong></button></div>
  <div class="upgrade-row"><div class="upgrade-icon troops">♟♟</div><div class="upgrade-description"><b class="orange">生成速度 <em>Lv${p.productionLevel}</em></b><strong>${getProduction(p).toFixed(2)}<small>/秒</small> <i>›</i> <span>${(getProduction(p)+.07).toFixed(2)}<small>/秒</small></span></strong></div><button id="upgrade-production" class="upgrade-buy" ${p.coins<getUpgradeCost('production',p.productionLevel)?'disabled':''}><span>🟡 ${quantity(getUpgradeCost('production',p.productionLevel))}</span><strong>升级</strong></button></div></div>
  <nav class="home-nav"><button id="home-goals" aria-label="成长目标">▤</button><button id="home-save" aria-label="保存与读取回放">▣</button><button class="current" id="home-battle" aria-label="战斗">⚔<small>战斗</small></button><button id="home-info" aria-label="还原说明">ⓘ</button><button id="practice" aria-label="选择录像地图">◉</button></nav>
  <span class="local-badge">单机复刻 · 本机进度</span>`;
}
