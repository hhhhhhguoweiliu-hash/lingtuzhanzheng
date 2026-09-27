import {chromium} from '@playwright/test';
import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('research/verification',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page=await browser.newPage({viewport:{width:720,height:1372},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(resolve('dist/领土战争.html')).href);await page.screenshot({path:'research/verification/home.png'});
await page.locator('#practice').click();await page.locator('#start').click();
const snapshots=[];async function capture(name){const wasPlaying=await page.evaluate(()=>window.lingtu.getMode()==='playing');if(wasPlaying)await page.locator('#back').click();await page.waitForTimeout(50);const s=await page.evaluate(()=>window.lingtu.getState());const png=await page.locator('#battle').evaluate(c=>c.toDataURL('image/png'));await writeFile(`research/verification/${name}.png`,Buffer.from(png.split(',')[1],'base64'));if(wasPlaying)await page.locator('#resume').click();snapshots.push({name,tick:s.tick,seconds:s.tick/30,packets:s.packets.length,visualUnits:s.packets.reduce((a,p)=>a+p.units,0),nodes:s.nodes.map(n=>({id:n.id,owner:n.owner,garrison:n.garrison}))});}
await capture('opening');
await page.mouse.move(117,786);await page.mouse.down();await page.mouse.move(142,631,{steps:10});await page.mouse.up();
await page.keyboard.press('F2');await page.locator('#d-speed').click();await page.keyboard.press('F2');
let gotSingle=false,gotCapture=false,gotMixed=false,gotLate=false,auto=false;const end=Date.now()+80000;
while(Date.now()<end){const s=await page.evaluate(()=>window.lingtu.getState());
 if(!gotSingle&&s.tick>=150){await capture('single-stream');gotSingle=true;}
 if(!gotCapture&&s.nodes.find(n=>n.id==='L_W').owner==='blue'){await capture('capture');gotCapture=true;}
 if(!auto&&s.tick>=600){await page.keyboard.press('F2');await page.locator('#d-auto').click();await page.keyboard.press('F2');auto=true;}
 if(!gotMixed&&s.tick>=1350){await capture('multi-battle');gotMixed=true;}
 if(!gotLate&&s.tick>=2400){await capture('late-battle');gotLate=true;}
 const mode=await page.evaluate(()=>window.lingtu.getMode());if(mode==='result'){if(!gotLate){await capture('late-battle');gotLate=true;}break;}
 if(gotSingle&&gotCapture&&gotMixed&&gotLate)break;await page.waitForTimeout(70);
}
await writeFile('research/verification/visual-capture.json',JSON.stringify({errors,snapshots},null,2));console.log(JSON.stringify({errors,frames:snapshots.map(s=>({name:s.name,tick:s.tick,packets:s.packets}))}));await browser.close();
