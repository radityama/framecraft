import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {sourceDigest} from '../../../src/review/artifacts.ts';

// The driver uses Studio's public controls; it never drives the iframe bridge.
const output = resolve(process.argv[2]);
await mkdir(output, {recursive:true});
const source = await sourceDigest(resolve('projects/motion-benchmark-02'));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages()[0];
const errors = [], external = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => {if(m.type()==='error')errors.push(m.text());});
page.on('request', r => {if(!r.url().startsWith('http://127.0.0.1:3000/')&&!r.url().startsWith('data:'))external.push(r.url());});
await page.setViewportSize({width:1920,height:1080});
await page.goto('http://127.0.0.1:3000/?project=motion-benchmark-02&scene=film');
await page.addStyleTag({content:'body{overflow:hidden!important}#stage{position:fixed!important;left:0!important;top:0!important;width:1920px!important;height:1080px!important;max-width:none!important;z-index:999!important;border:0!important;border-radius:0!important}'});
const samples = [], geometry = [];
async function seek(frame) {
  const start = performance.now();
  await page.getByRole('slider',{name:'Timeline frame',exact:true}).fill(String(frame),{force:true});
  await page.waitForFunction(f => {const s=document.querySelector('#stage');return s?.dataset.state==='ready'&&s.dataset.frame===String(f);},frame,{timeout:30000});
  const shot = page.frames().find(f => f.url().includes('/shots/'));
  assert(shot, 'active HTML shot exists');
  assert.equal(await shot.locator('#film').getAttribute('data-frame'),String(frame));
  samples.push(performance.now()-start);
  return shot;
}
async function capture(frame, pass) {
  await seek(frame);
  const path=resolve(output,`${pass}-${String(frame).padStart(4,'0')}.png`);
  const png=await page.locator('#stage').screenshot({path});
  return {frame,path,sha256:createHash('sha256').update(png).digest('hex')};
}
const frames=[0,89,179,269,359,360,420,452,476,500,534,550,570,590,618,648,700,746,809,810,922,1034,1146,1259,1260,1320,1357,1454,1490,1551,1649];
for(const [frame,target,focus] of [[420,'#source .chrome','source'],[452,'#source .chrome','source'],[476,'#source .chrome','source'],[500,'#source .chrome','source'],[534,'#resize-target','inspector'],[550,'#resize-target','inspector'],[570,'#resize-target','inspector'],[590,'#resize-target','inspector'],[618,'#source .chrome','source'],[648,'#source .chrome-controls i:first-child','inspector'],[700,'#publish-dock','publish'],[746,'#publish-target','publish']]) {
  const shot=await seek(frame);
  const result=await shot.evaluate(({target,focus})=>{
    const r=document.querySelector(target).getBoundingClientRect(),p=document.querySelector('#cursor').getBoundingClientRect();
    const z=Object.fromEntries(['source','inspector','publish'].map(id=>[id,+getComputedStyle(document.getElementById(id)).zIndex]));
    return {target,focus,pointer:{x:p.x,y:p.y},rect:{x:r.x,y:r.y,width:r.width,height:r.height},z,focused:document.querySelector('.window.focused')?.id,hit:document.elementFromPoint(p.x+1,p.y+1)?.closest('.window,.dock')?.id};
  },{target,focus});
  const {pointer:p,rect:r}=result;
  assert(p.x>=r.x-1&&p.x<=r.x+r.width+1&&p.y>=r.y-1&&p.y<=r.y+r.height+1,`cursor misses ${target} at ${frame}: ${JSON.stringify(result)}`);
  assert.equal(result.focused,focus);
  assert.equal(result.z[focus],Math.max(...Object.values(result.z)));
  geometry.push({frame,...result});
}
let shot=await seek(500);
assert.deepEqual(await shot.locator('#source').evaluate(n=>[n.offsetLeft,n.offsetTop,n.offsetWidth,n.offsetHeight]),[130,355,790,540]);
shot=await seek(590);
assert.deepEqual(await shot.locator('#inspector').evaluate(n=>[n.offsetLeft,n.offsetTop,n.offsetWidth,n.offsetHeight]),[690,280,1050,670]);
shot=await seek(1320);
const distinct=await shot.locator('.ledger-record').evaluateAll(ns=>new Set(ns.map(n=>n.style.transform)).size);
assert(distinct>=30,`only ${distinct} independently transformed records`);
const fonts=await shot.evaluate(()=>[...document.fonts].map(f=>({family:f.family,status:f.status,weight:f.weight})));
assert(fonts.length>=3&&fonts.every(f=>f.status==='loaded'));
const first=[];
for(const f of frames)first.push(await capture(f,'a'));
const second=[];
// Deliberately different capture order, including large backwards jumps.
for(const f of [...frames].reverse())second.push(await capture(f,'b'));
await writeFile(resolve(output,'hash-attempt.json'),JSON.stringify({source,first,second},null,2)+'\n');
for(const a of first)assert.equal(a.sha256,second.find(b=>b.frame===a.frame).sha256,`repeat pixels at ${a.frame}`);
assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
assert.equal(await sourceDigest(resolve('projects/motion-benchmark-02')),source);
const sorted=[...samples].sort((a,b)=>a-b);
const report={source,viewport:{width:1920,height:1080},first,second,geometry,distinct,fonts,errors,external,seekMs:{n:samples.length,median:sorted[Math.floor(sorted.length/2)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)}};
await writeFile(resolve(output,'browser-check.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({matched:first.length,geometry:geometry.length,distinct,fonts,seekMs:report.seekMs}));
// Disconnect only; the agent-browser session remains available for inspection.
await browser.close();
