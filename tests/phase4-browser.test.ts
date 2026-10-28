import {afterAll, beforeAll, expect, test} from 'bun:test';
import {chromium, type Browser, type Page} from 'playwright-core';
import {mkdtemp, mkdir, readFile, writeFile, rm, cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {startStudio} from './fixtures/studio-server';

let base: string, root: string, workspace: string, before: string, after: string;
let browser: Browser, studio: Awaited<ReturnType<typeof startStudio>>;
let startupMs: number;
const evidence = process.env.FRAMECRAFT_EVIDENCE;
const errors: string[] = [];
const ready = (p: Page, f: number) => p.waitForFunction(n => document.querySelector('#stage')?.getAttribute('data-frame') === String(n) && document.querySelector('#stage')?.getAttribute('data-state') === 'ready', f);
const seek = async (p: Page, f: number) => {await p.getByLabel('Timeline frame', {exact:true}).fill(String(f)); await ready(p,f);};
async function page() {const p=await browser.newPage({viewport:{width:1440,height:1000}}); p.on('pageerror', e=>errors.push(e.message)); p.on('console', m=>{if(m.type()==='error') errors.push(m.text());}); await p.goto(studio.url); await ready(p,0); return p;}
async function capture(output: string) {
  const proc=Bun.spawn([process.execPath,'scripts/review.ts','--project',root,'--scene','intro','--output',output],{stdout:'pipe',stderr:'pipe'});
  const out=new Response(proc.stdout).text(), err=new Response(proc.stderr).text(); const code=await proc.exited;
  if(code) throw new Error(`${await out}\n${await err}`); await out; await err;
}
beforeAll(async()=>{
  base=await mkdtemp(join(tmpdir(),'framecraft-phase4-browser-')); root=join(base,'project'); workspace=join(base,'workspace'); before=join(base,'before'); after=join(base,'after'); await mkdir(root);
  await cp('projects/demo/runtime.js',join(root,'runtime.js'));
  await writeFile(join(root,'project.json'),JSON.stringify({schemaVersion:1,id:'review-study',title:'Review study',video:{width:640,height:360,fps:30},scenes:[{id:'intro',path:'scene.json'}],audio:[]}));
  await writeFile(join(root,'scene.json'),JSON.stringify({id:'intro',shots:['a','b'].map(id=>({id,entry:'a.html',durationFrames:30,overlapFrames:0})),audio:[]}));
  const html=(color:string)=>`<!doctype html><html><style>html,body{margin:0;width:100%;height:100%;background:${color};color:white;font:32px sans-serif}main{padding:40px}</style><main></main><script src="runtime.js"></script><script>framecraft.shot({renderFrame(c){document.querySelector('main').textContent='Frame '+c.frame;}});</script></html>`;
  await writeFile(join(root,'a.html'),html('#212023')); await writeFile(join(root,'b.html'),html('#212023')); await capture(before);
  await writeFile(join(root,'a.html'),html('#243c50')); await capture(after);
  const still=Bun.spawn([process.execPath,'scripts/spike.ts','still','--project','projects/motion','--scene','examples','--shot','cursor','--frame','45','--output',join(base,'motion-render.png')],{stdout:'pipe',stderr:'pipe'});
  const stillOut=new Response(still.stdout).text(), stillErr=new Response(still.stderr).text();
  if(await still.exited) throw new Error(`${await stillOut}\n${await stillErr}`); await stillOut; await stillErr;
  const startup=performance.now(); studio=await startStudio(['--project',root,'--workspace',workspace,'--review',before,'--review',after]); startupMs=performance.now()-startup;
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN||resolve('node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell'),args:['--font-render-hinting=none']});
  if(evidence) await mkdir(evidence,{recursive:true});
},180000);
afterAll(async()=>{
  await browser?.close(); await studio?.stop();
  if(evidence && base) {for(const name of ['before','after','workspace']) await cp(join(base,name),join(evidence,name),{recursive:true}); await writeFile(join(evidence,'browser-errors.json'),JSON.stringify(errors));}
  if(base) await rm(base,{recursive:true,force:true});
});

test('timeline controls, rates, zoom, exact boundaries, inspector and keyboard share one frame',async()=>{
  const p=await page();
  try {
    await p.getByLabel('Project',{exact:true}).selectOption('demo'); await ready(p,0);
    await seek(p,59); await p.getByRole('button',{name:'Next frame',exact:true}).click(); await ready(p,60);
    expect(await p.getByTestId('inspector-shot').innerText()).toBe('diagram'); expect(await p.getByTestId('inspector-frame').innerText()).toBe('60');
    await p.getByRole('button',{name:'Previous frame',exact:true}).click(); await ready(p,59);
    await p.getByRole('button',{name:'Next shot',exact:true}).click(); await ready(p,60);
    await p.getByRole('button',{name:'Previous shot',exact:true}).click(); await ready(p,0);
    await p.getByRole('button',{name:'Jump to end'}).click(); await ready(p,329);
    await p.getByRole('button',{name:'Next frame',exact:true}).click(); await ready(p,329);
    await p.getByRole('button',{name:'Stop',exact:true}).click(); await ready(p,0);
    for(const speed of ['0.25','0.5','1','2']) {await p.getByLabel('Playback speed').selectOption(speed); await p.getByRole('button',{name:'Play',exact:true}).click(); await p.waitForFunction(()=>Number(document.querySelector('#stage')?.getAttribute('data-frame'))>0); await p.getByRole('button',{name:'Pause',exact:true}).click(); await p.waitForFunction(()=>document.querySelector('#stage')?.getAttribute('data-state')==='ready'); await p.getByRole('button',{name:'Stop',exact:true}).click(); await ready(p,0);}
    await p.getByRole('button',{name:'Zoom in',exact:true}).click(); expect(await p.locator('.timeline-scroll').evaluate(n=>n.scrollWidth>n.clientWidth)).toBe(true);
    await p.getByRole('button',{name:'Fit scene',exact:true}).click(); expect(await p.locator('.timeline-scroll').evaluate(n=>n.scrollWidth===n.clientWidth)).toBe(true);
    await p.locator('body').click({position:{x:2,y:2}}); await p.keyboard.press('Shift+ArrowRight'); await ready(p,60); await p.keyboard.press('End'); await ready(p,329); await p.keyboard.press('Home'); await ready(p,0); await p.keyboard.press('+'); expect(await p.locator('.timeline-toolbar output').innerText()).toBe('2×'); await p.keyboard.press('0');
    await p.getByLabel('Issue description').fill('Typing space and arrows'); await p.keyboard.press('End'); await p.keyboard.press('Space'); expect(await p.locator('#stage').getAttribute('data-frame')).toBe('0');
    await p.getByLabel('Project',{exact:true}).selectOption('showcase'); await ready(p,0); await p.getByLabel('Scene',{exact:true}).selectOption('signal'); await ready(p,0); await seek(p,48); expect(await p.getByTestId('inspector-shot').innerText()).toBe('receive');
    if(evidence) await p.screenshot({path:join(evidence,'timeline-desktop.png'),fullPage:true});
    expect(errors).toEqual([]);
  } finally {await p.close();}
},120000);

test('reused HTML entries acknowledge the selected shot rather than the first matching URL',async()=>{
  const p=await page();
  try {
    for(const frame of [30,59,29,45]) {await seek(p,frame);expect(await p.getByTestId('inspector-shot').innerText()).toBe(frame<30?'a':'b');}
    expect(errors).toEqual([]);
  } finally {await p.close();}
},60000);

test('spatial feedback edits, reload persistence, portable exports, staleness and deletion are explicit',async()=>{
  const p=await page();
  try {
    await seek(p,14); await p.getByLabel('Issue description').fill('Move the title away from this region'); await p.getByLabel('Issue severity').selectOption('major'); await p.getByLabel('Annotation region',{exact:true}).selectOption('rectangle');
    const r=(await p.locator('#stage').boundingBox())!; await p.mouse.move(r.x+r.width*.2,r.y+r.height*.3); await p.mouse.down(); await p.mouse.move(r.x+r.width*.6,r.y+r.height*.7); await p.mouse.up();
    expect(Number(await p.getByLabel('Region x',{exact:true}).inputValue())).toBeCloseTo(.2,2);
     await p.getByRole('button',{name:'Add issue',exact:true}).click(); await p.locator('.issue-list button').waitFor();
     const stale=await browser.newPage(); await stale.goto(studio.url); await ready(stale,0); await stale.locator('.issue-list button').click(); await ready(stale,14);
     await p.locator('.issue-list button').click(); await p.getByLabel('Issue description').fill('Revised: increase title spacing'); await p.getByRole('button',{name:'Save issue',exact:true}).click(); await p.getByText('Revised: increase title spacing',{exact:true}).waitFor();
     await stale.getByLabel('Issue description').fill('Unsaved conflicting edit'); await stale.getByRole('button',{name:'Save issue',exact:true}).click(); await stale.getByRole('alert').filter({hasText:'changed in another window'}).waitFor(); expect(await stale.getByLabel('Issue description').inputValue()).toBe('Unsaved conflicting edit'); await stale.close();
    await p.reload(); await ready(p,0); await p.locator('.issue-list button').click(); await ready(p,14); expect(await p.getByLabel('Issue description').inputValue()).toBe('Revised: increase title spacing');
    const exportResponse=await fetch(`${studio.url}/api/feedback-export?project=review-study&scene=intro&format=json`); const doc=await exportResponse.json(); expect(doc.issues[0].geometry.width).toBeCloseTo(.4,2); expect(doc.issues[0].frame).toBe(14); expect(doc.issues[0].localFrame).toBe(14);
    const [download]=await Promise.all([p.waitForEvent('download'),p.getByRole('link',{name:'Export Markdown'}).click()]); expect(download.suggestedFilename()).toBe('review-study-intro-feedback.md');
    if(evidence) {await download.saveAs(join(evidence,'feedback.md')); await writeFile(join(evidence,'feedback.json'),JSON.stringify(doc,null,2)); await p.screenshot({path:join(evidence,'annotation-desktop.png'),fullPage:true});}
    await p.setViewportSize({width:390,height:844}); expect(await p.locator('.annotation-overlay rect').count()).toBeGreaterThan(0); expect(await p.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    if(evidence) await p.screenshot({path:join(evidence,'annotation-phone.png'),fullPage:true});
    await writeFile(join(root,'new-source-note.txt'),'Revision changed deliberately in this isolated fixture');
    const oldFrame=await p.locator('#stage iframe').elementHandle();
    p.on('dialog',d=>d.accept()); await p.evaluate(()=>window.dispatchEvent(new Event('focus'))); await p.locator('.issue-list button').getByText(/STALE source/).waitFor();
    await ready(p,14); expect(await oldFrame!.evaluate(n=>n.isConnected)).toBe(false);
    await p.locator('.issue-list button').click(); await p.getByRole('button',{name:'Revalidate source',exact:true}).click(); await p.waitForFunction(()=>!document.querySelector('.issue-list')?.textContent?.includes('STALE'));
    await p.locator('.issue-list button').click(); await p.getByLabel('Issue status').selectOption('resolved'); await p.getByRole('button',{name:'Save issue',exact:true}).click(); await p.locator('.issue-list button').getByText(/resolved/).waitFor();
    await p.locator('.issue-list button').click(); await p.getByRole('button',{name:'Delete issue',exact:true}).click(); await p.getByText('No feedback yet.',{exact:false}).waitFor(); expect(errors).toEqual([]);
  } finally {await p.close();}
},120000);

test('comparison loads two verified images at matched frames and preserves history',async()=>{
  const original=await readFile(join(before,'manifest.json')); const p=await page();
  try {
    const section=p.getByRole('region',{name:'Revision comparison'}); await section.getByRole('img').first().waitFor(); expect(await section.getByRole('img').count()).toBe(2);
    await p.getByLabel('Comparison frame').selectOption('14'); expect(await section.getByRole('img').first().getAttribute('alt')).toBe('Before: a frame 14');
    if(evidence) await section.screenshot({path:join(evidence,'comparison-side.png')});
    await p.getByLabel('Comparison view').selectOption('split'); await p.getByLabel('Comparison split').fill('35'); expect(await section.getByRole('img').last().getAttribute('style')).toContain('35%');
    if(evidence) await section.screenshot({path:join(evidence,'comparison-split.png')});
    expect(await readFile(join(before,'manifest.json'))).toEqual(original); expect(errors).toEqual([]);
  } finally {await p.close();}
});

test('native-size Studio frames match production PNG pixels, including motion primitives',async()=>{
  const p=await page();
  const pixels=async(bytes:Uint8Array)=>p.evaluate(async encoded=>{
    const image=new Image(); image.src=`data:image/png;base64,${encoded}`; await image.decode();
    const canvas=document.createElement('canvas'); canvas.width=image.naturalWidth; canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d')!; context.drawImage(image,0,0);
    const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
    return {width:canvas.width,height:canvas.height,sha:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))).map(b=>b.toString(16).padStart(2,'0')).join('')};
  },Buffer.from(bytes).toString('base64'));
  try {
    for(const sample of [{project:'review-study',frame:14,file:join(after,'screenshots/a-local-0014-global-0014.png')},{project:'motion',frame:45,file:join(base,'motion-render.png')}]) {
      await p.getByLabel('Project',{exact:true}).selectOption(sample.project); await ready(p,0);
      await p.locator('#stage').evaluate(n=>{Object.assign((n as HTMLElement).style,{position:'fixed',left:'0',top:'0',width:'640px',height:'360px',maxWidth:'none',zIndex:'100'});});
      await seek(p,sample.frame);
      await p.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const preview=await p.locator('#stage').screenshot(), rendered=await readFile(sample.file);
      if(evidence) {await writeFile(join(evidence,`${sample.project}-preview.png`),preview); await writeFile(join(evidence,`${sample.project}-render.png`),rendered);}
      expect(await pixels(preview)).toEqual(await pixels(rendered));
    }
    expect(errors).toEqual([]);
  } finally {await p.close();}
},120000);

test('seeking stays bounded and stable under repeated scrubbing with recorded latency and heap',async()=>{
  const p=await page(); const cdp=await p.context().newCDPSession(p); const timings:number[]=[];
  try {
    await p.getByLabel('Project',{exact:true}).selectOption('showcase'); await ready(p,0);
    for(let i=0;i<10;i++) await seek(p,i%2?95:0);
     await cdp.send('HeapProfiler.collectGarbage'); const heapBefore=await cdp.send('Runtime.getHeapUsage'); const start=performance.now();
     for(let i=0;i<180;i++) {const t=performance.now(); await seek(p,[70,10,95,0,48][i%5]!); timings.push(performance.now()-t);}
     await cdp.send('HeapProfiler.collectGarbage');
    const heapAfter=await cdp.send('Runtime.getHeapUsage');
    for(const f of [80,2,94,10,71]) await p.getByLabel('Timeline frame',{exact:true}).fill(String(f)); await ready(p,71);
    const t=performance.now(); await p.getByRole('button',{name:'Next frame',exact:true}).click(); await ready(p,72);
     const result={startupMs,seeks:180,elapsedMs:performance.now()-start,seekMedianMs:timings.sort((a,b)=>a-b)[90],seekMaxMs:Math.max(...timings),frameStepMs:performance.now()-t,heapBefore,heapAfter,environment:{bun:Bun.version,chromium:browser.version(),platform:process.platform}};
    if(evidence) await writeFile(join(evidence,'performance.json'),JSON.stringify(result,null,2));
    expect(await p.locator('#stage').getAttribute('data-frame')).toBe('72'); expect(errors).toEqual([]);
  } finally {await cdp.detach(); await p.close();}
},120000);
