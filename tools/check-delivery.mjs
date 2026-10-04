import {chromium} from '@playwright/test';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const delivery=resolve(process.argv[2]??'dist');
const file=join(delivery,'领土战争.html');
const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try{
  const context=await browser.newContext({viewport:{width:390,height:844},offline:true});
  const page=await context.newPage(), errors=[],remote=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url());});
  await page.goto(pathToFileURL(file).href);
  await page.locator('#campaign-start').waitFor({state:'visible'});
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('lingtu-replica-v1')).profile);
  await page.locator('#campaign-start').click();
  await page.waitForFunction(()=>window.lingtu.getMode()==='playing'&&window.lingtu.getState().tick>10);
  const actual=await page.evaluate(()=>({tick:window.lingtu.getState().tick,mode:window.lingtu.getMode(),profile:JSON.parse(localStorage.getItem('lingtu-replica-v1')).profile}));
  if(before.stage!==1||actual.profile.energy!==before.energy-5||errors.length||remote.length)throw Error('Delivered game readback failed');
  const result={file,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),offline:true,requestsToHttp:remote.length,errors,initialStage:before.stage,startEnergy:before.energy,battleEnergy:actual.profile.energy,battleTick:actual.tick};
  await page.reload();
  await page.locator('#home-settings').click();
  if(await page.locator('#dispatch-mode').inputValue()!=='budget')throw Error('Default dispatch mode changed');
  await page.locator('#dispatch-mode').selectOption('continuous');
  await page.locator('#close').click();
  await page.locator('#practice').click();await page.locator('#start').click();
  const points=await page.evaluate(()=>{
    const map=window.lingtu.getScene(),box=document.querySelector('#battle').getBoundingClientRect();
    return [map.nodes.find(n=>n.owner==='blue'),map.nodes.find(n=>n.id==='L_W')].map(n=>({x:box.x+n.anchor.x/map.width*box.width,y:box.y+n.anchor.y/map.height*box.height}));
  });
  await page.mouse.click(points[0].x,points[0].y);await page.mouse.click(points[1].x,points[1].y);
  await page.waitForFunction(()=>window.lingtu.getState().packets.some(p=>p.owner==='blue'));
  if(await page.locator('#command-routes g path').count()!==1)throw Error('Offline continuous route missing');
  await page.mouse.click(points[0].x,points[0].y);await page.locator('#stop-orders').click();
  const stopped=await page.evaluate(()=>window.lingtu.getState());
  if(stopped.queues.some(q=>q.owner==='blue')||!stopped.packets.some(p=>p.owner==='blue'))throw Error('Offline stop altered travelling troops');
  result.continuousDispatchAndStop=true;
  result.requestsToHttp=remote.length;
  if(remote.length||errors.length)throw Error('Offline continuous check attempted network or errored');
  try{
    const review=await context.newPage();
    review.on('pageerror',e=>errors.push(e.message));
    await review.goto(pathToFileURL(join(delivery,'对照与验收.html')).href);
    await review.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
    result.reviewImages=await review.locator('img').count();
    await review.screenshot({path:'research/verification/delivery-review.png',fullPage:false});
    await review.goto(pathToFileURL(join(delivery,'本轮更新-2026-10-05.html')).href);
    await review.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
    result.updateImages=await review.locator('img').count();
    if(result.updateImages!==2)throw Error('Update screenshots missing');
  }catch(e){if(process.argv[2])throw e;}
  if(errors.length)throw Error(errors.join('\n'));
  await writeFile('research/verification/delivery-readback.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}finally{await browser.close();}
