/** Bounded same-process renderer comparison, with exact pixels and cache invalidation.
 * Usage: node tools/renderer-benchmark.mjs --baseline-ref=74e672f
 * Writes JSON evidence under research/verification and ignored images under test-results/renderer; never changes simulation code.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const baselineRef=process.argv.find(a=>a.startsWith('--baseline-ref='))?.split('=')[1]??'HEAD';
const dir=resolve('test-results/renderer');
const evidence=resolve('research/verification');
const visualOnly=process.argv.includes('--visual-only');
await mkdir(dir,{recursive:true});
await mkdir(evidence,{recursive:true});
await mkdir(resolve(dir,'tmp'),{recursive:true});
process.env.TEMP=resolve(dir,'tmp');process.env.TMP=process.env.TEMP;
const baseline=execFileSync('git',['show',`${baselineRef}:src/render/board.ts`],{encoding:'utf8'});
await writeFile(resolve(dir,'board-before.ts'),baseline);
await writeFile(resolve(dir,'index.html'),'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#ddd}canvas{display:block;width:390px;height:743px}</style><canvas id="before"></canvas><canvas id="after"></canvas>');
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});
await server.listen();
const address=server.httpServer.address();
const browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[];const report={baselineRef,baselineCommit:execFileSync('git',['rev-parse',baselineRef],{encoding:'utf8'}).trim(),baselineRendererSha256:createHash('sha256').update(baseline).digest('hex'),currentRendererSha256:createHash('sha256').update(await readFile('src/render/board.ts')).digest('hex'),browser:await browser.version(),platform:process.platform,visualBackend:'Canvas willReadFrequently=true on both implementations to prevent automatic readback-backend changes',timingBackend:'Fresh default Canvas contexts',scope:'Desktop synthetic Canvas draw CPU time and bounded requestAnimationFrame intervals; not Android FPS or long-run memory.',visual:[],timing:[],errors};
try {
  for(const dpr of [1,2]){
    const context=await browser.newContext({viewport:{width:810,height:844},deviceScaleFactor:dpr});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${address.port}/test-results/renderer/index.html`);
    await page.evaluate(async()=>{
      const [{BoardRenderer:Before},{BoardRenderer:After},{GameEngine},{longMap,longWater},{shortMap,shortBackground},{arabiaMap},{homeMap}]=await Promise.all([
        import('/test-results/renderer/board-before.ts'),import('/src/render/board.ts'),import('/src/sim/engine.ts'),import('/src/maps/long.ts'),import('/src/maps/short.ts'),import('/src/maps/arabia.ts'),import('/src/maps/home.ts')]);
      // Readback switches Chromium canvases from GPU to CPU after repeated reads.
      // Use one explicit CPU backend for exact-pixel checks, then fresh default
      // canvases for timing so cache/GPU readback artifacts do not bias either.
      const getContext=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(type,options){return getContext.call(this,type,type==='2d'?{...options,willReadFrequently:true}:options);};
      window.resetReadbackBackend=()=>{HTMLCanvasElement.prototype.getContext=getContext;for(const id of ['before','after']){const old=document.getElementById(id);old.replaceWith(old.cloneNode());}};
      const options={selected:null,target:null,hovered:null,time:1234,tutorial:false,skillReady:true,skillTargeting:false};
      function fixture(map,count=0){
        const state=structuredClone(new GameEngine(structuredClone(map),{aiEnabled:false},731).state);
        const owners=['blue','brown','magenta','green','red'];
        state.packets=Array.from({length:count},(_,i)=>{
          const a=map.nodes[(i*7)%map.nodes.length].anchor,b=map.nodes[(i*7+5)%map.nodes.length].anchor;
          const progress=((i*71)%997+1)/999;
          return{id:i,sequenceId:i,owner:owners[Math.floor(i/13)%owners.length],units:1,sourceId:map.nodes[(i*7)%map.nodes.length].id,targetId:map.nodes[(i*7+5)%map.nodes.length].id,path:[a,b],pathLength:Math.hypot(b.x-a.x,b.y-a.y),departTick:0,arrivalTick:1000,subTick:0,travelTicks:1000,progress,distanceTravelled:0,x:a.x+(b.x-a.x)*progress,y:a.y+(b.y-a.y)*progress};
        });
        return state;
      }
      function setup(map=longMap,count=0){
        const state=fixture(map,count);
        const a=new Before(document.querySelector('#before'),map),b=new After(document.querySelector('#after'),map);
        a.setWater(longWater);b.setWater(longWater);
        window.rendererBench={a,b,state,map,options:{...options},fixture,setup,scenes:{longMap,shortMap,shortBackground,arabiaMap,homeMap}};
      }
      setup();
    });
    const checks=await page.evaluate(()=>{
      const results=[];let b=window.rendererBench;
      function compare(label){
        const unchanged=JSON.stringify(b.state);b.a.draw(b.state,b.options);b.b.draw(b.state,b.options);
        const a=b.a.ctx.getImageData(0,0,b.a.canvas.width,b.a.canvas.height).data,c=b.b.ctx.getImageData(0,0,b.b.canvas.width,b.b.canvas.height).data;
        let changed=0,max=0;for(let i=0;i<a.length;i+=4){let delta=0;for(let k=0;k<4;k++)delta=Math.max(delta,Math.abs(a[i+k]-c[i+k]));if(delta){changed++;max=Math.max(max,delta);}}
        // Both coordinate conversion and polygon/near-node paths at the real scale.
        const box=b.b.canvas.getBoundingClientRect();let hitMismatch=0,pointError=0;
        for(const n of b.map.nodes){const p=n.anchor;const q=b.b.point(box.left+p.x/b.map.width*box.width,box.top+p.y/b.map.height*box.height);pointError=Math.max(pointError,Math.abs(q.x-p.x),Math.abs(q.y-p.y));if(b.a.hit(p)!==b.b.hit(p))hitMismatch++;}
        for(let y=0;y<b.map.height;y+=43)for(let x=0;x<b.map.width;x+=37)if(b.a.hit({x,y})!==b.b.hit({x,y}))hitMismatch++;
        results.push({images:changed?{before:b.a.canvas.toDataURL(),after:b.b.canvas.toDataURL()}:undefined,label,pixels:b.a.canvas.width*b.a.canvas.height,changedPixels:changed,maxChannelDelta:max,hitMismatch,maxPointError:pointError,stateUnchanged:unchanged===JSON.stringify(b.state)});
      }
      compare('long-initial');compare('long-cache-reuse');
      b.state.nodes.find(n=>n.kind==='special_unknown').owner='blue';compare('special-capture');
      b.state.nodes[0].owner='magenta';compare('ordinary-capture');
      const special=b.state.nodes.find(n=>n.kind==='special_unknown');special.coverageRadius=(special.coverageRadius??115)+15;special.anchor.x+=3;special.anchor.y-=2;compare('coverage-geometry-change');
      const skin={blue:{land:'#51bebc',unit:'#009ca6'},magenta:{unit:'#a37323'}};
      b.a.setPalette(skin);b.b.setPalette(skin);compare('palette-jade');
      const water=[[{x:0,y:0},{x:35,y:0},{x:35,y:1000},{x:0,y:1000}]];b.a.setWater(water);b.b.setWater(water);compare('water-change');
      const bg=[[{x:500,y:900},{x:650,y:950},{x:500,y:1000}]];b.a.setBackground(bg);b.b.setBackground(bg);compare('background-change');
      b.state.packets=b.fixture(b.map,120).packets;b.state.packets[0].units=12;compare('mixed-units-with-12-unit-packet');
      b.options.selected=b.state.nodes[0].id;b.options.target={x:370,y:630};compare('selection-first');b.options.time+=100;compare('selection-next');
      b.options.selected=null;b.options.target=null;b.state.tick=4;compare('dynamic-ray');
      for(const r of [b.a,b.b]){r.canvas.style.width='333px';r.canvas.style.height='700px';}compare('resize');
      const originalDpr=window.devicePixelRatio;
      Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:originalDpr===1?2:1});compare('same-instance-dpr-change');
      Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:originalDpr});compare('same-instance-dpr-restore');
      const scenes=b.scenes;
      for(const name of ['shortMap','arabiaMap','homeMap']){b.setup(scenes[name],90);b=window.rendererBench;if(name==='shortMap'){b.a.setBackground(scenes.shortBackground);b.b.setBackground(scenes.shortBackground);b.options.fourPlayers=true;}if(name==='homeMap')b.options.hud=false;compare(name);compare(`${name}-cached`);}
      b.setup(scenes.longMap,1000);
      return results;
    });
    for(const check of checks){if(check.images){for(const [which,data] of Object.entries(check.images))await writeFile(resolve(dir,`${check.label}-${which}-dpr${dpr}.png`),Buffer.from(data.split(',')[1],'base64'));delete check.images;}}
    report.visual.push(...checks.map(c=>({dpr,...c})));
    if(visualOnly){await context.close();continue;}
    const timing=await page.evaluate(async()=>{
      window.resetReadbackBackend();
      const records=[];let b=window.rendererBench;
      const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
      for(const count of [200,1000,5000]){
        b.setup(b.scenes.longMap,count);b=window.rendererBench;
        // Alternate old/new rounds to reduce JIT, thermal and background-load bias.
        for(const round of [0,1])for(const which of round?['after','before']:['before','after']){
          const renderer=which==='before'?b.a:b.b;
          for(const r of [b.a,b.b]){r.canvas.style.width='390px';r.canvas.style.height='743px';}
          renderer.canvas.style.display='block';(which==='before'?b.b:b.a).canvas.style.display='none';
          // Warm-up is bounded and flushes both cached and uncached canvases.
          for(let i=0;i<12;i++){await nextFrame();renderer.draw(b.state,b.options);}
          const times=[],intervals=[];let last=null;
          for(let i=0;i<48;i++){
            const now=await nextFrame();if(last!==null)intervals.push(now-last);last=now;
            const start=performance.now();renderer.draw(b.state,b.options);times.push(performance.now()-start);
          }
          const sum=a=>a.reduce((s,x)=>s+x,0),pct=(a,p)=>[...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*p)];
          records.push({packets:count,visualUnits:count,which,round,samples:times.length,meanDrawMs:sum(times)/times.length,p95DrawMs:pct(times,.95),meanFrameMs:sum(intervals)/intervals.length,p95FrameMs:pct(intervals,.95)});
        }
      }
      return records;
    });
    report.timing.push(...timing.map(t=>({dpr,...t})));
    await context.close();
  }
  await writeFile(resolve(evidence,'renderer-comparison.json'),JSON.stringify(report,null,2));
  assert.equal(errors.length,0,JSON.stringify(errors));
  for(const c of report.visual){assert.equal(c.changedPixels,0,`${c.label}, DPR${c.dpr} differs`);assert.equal(c.hitMismatch,0,`${c.label}: hit differs`);assert(c.maxPointError<1e-9);assert(c.stateUnchanged,`${c.label}: state mutated`);}
  const summary=[];
  if(!visualOnly)for(const dpr of [1,2])for(const packets of [200,1000,5000]){
    const matches=report.timing.filter(t=>t.dpr===dpr&&t.packets===packets);
    const mean=which=>matches.filter(t=>t.which===which).reduce((s,t)=>s+t.meanDrawMs,0)/2;
    summary.push({dpr,packets,beforeMs:mean('before'),afterMs:mean('after'),reductionPercent:100*(1-mean('after')/mean('before'))});
  }
  await writeFile(resolve(evidence,'renderer-summary.json'),JSON.stringify({visualChecks:report.visual.length,exactPixelMatches:true,errors,summary},null,2));
  console.log(JSON.stringify({visualChecks:report.visual.length,exactPixelMatches:true,summary},null,2));
} finally {await browser.close();await server.close();}
