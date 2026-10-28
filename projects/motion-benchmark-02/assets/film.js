(() => {
  'use strict';
  const M = window.framecraftMotion;
  const {lerp, clamp, progress, keyframes, apply, drawSvg, cursor, camera} = M;
  const snap = M.cubicBezier(.16, 1, .3, 1);
  const travel = M.cubicBezier(.65, 0, .25, 1);
  const offset = Number(document.body.dataset.offset);
  const $ = id => document.getElementById(id);
  const chars = text => Array.from(text).map(c => `<span>${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  const chrome = name => `<div class="chrome"><span class="mono">${name}</span><div class="chrome-controls"><i></i><i></i><i>×</i></div></div>`;
  const ledger = [
    ['SOURCE', 'HTML shots', 'Local typefaces', 'Scene manifest', 'Shot duration', 'Frame context', 'Motion curves', 'Vector geometry', 'Asset boundary'],
    ['PROCESS', 'Mask the type', 'Track the cursor', 'Focus the window', 'Drag the source', 'Resize the view', 'Route the signal', 'Seek the camera', 'Compose the frame'],
    ['VERIFY', 'First frame', 'Last frame', 'Backward seek', 'Random access', 'Click geometry', 'Focus order', 'Pixel identity', 'Visual review'],
    ['PUBLISH', 'Scene selection', 'Frame sequence', 'Local resources', 'Video encode', 'Native resolution', 'Frame cadence', 'Final hold', 'Film artifact']
  ];
  $('film').innerHTML = `
    <div class="layer" id="wake">
      <div class="wake-mask"><div class="wake-type" id="every-frame"><div class="type-line every">${chars('EVERY')}</div><div class="type-line frame">${chars('FRAME')}</div></div>
      <div class="wake-type" id="has-intent"><div class="type-line has">${chars('HAS')}</div><div class="type-line intent">${chars('INTENT.')}</div></div></div>
      <div class="wake-note" id="wake-note">Not just movement.<br>A reason to move.</div><div class="wake-mark" id="wake-mark"></div>
      <div class="wake-number mono" id="wake-number">01 / TYPE AS STRUCTURE</div><div class="system-copy" id="system-copy">A FRAME<br>IS A SYSTEM.</div><div class="type-frame" id="type-frame"></div>
    </div>
    <div class="layer" id="desktop">
      <div class="desk-label mono">02 / THE PRODUCTION DESK <span class="muted"> · SIMULATED INTERACTION</span></div><div class="desk-watermark">MAKE.<br>INSPECT.<br>REFINE.</div>
      <div class="window" id="source">${chrome('01 / Source · index.html')}
        <div class="source-body mono" id="source-code"></div><div class="source-file mono">film / wake / index.html <span class="accent">●</span> LOCAL</div>
      </div>
      <div class="window" id="inspector">${chrome('02 / Frame Inspector')}
        <div class="inspector-content"><div class="preview"><div class="preview-folio mono">FRAMECRAFT / MOTION STUDIES</div><div class="preview-copy">EVERY<br><b>FRAME.</b></div><div class="preview-corner"></div></div>
        <div class="inspector-bottom"><div class="timeline-label mono"><span id="preview-frame">FRAME 0000</span><span>1920 × 1080 / 30 FPS</span></div><div class="strips mono"><span>WAKE</span><span>DESKTOP</span><span>STORY</span><span>RESOLVE</span></div></div></div><div class="resize-handle" id="resize-target"></div>
      </div>
      <div class="window" id="publish">${chrome('03 / Publish')}
        <div class="publish-body"><div class="publish-kicker mono" id="publish-kicker">SELECTED SCENE / FILM</div><div class="publish-name" id="publish-name">motion-studies-02.mp4</div>
        <div class="publish-specs mono"><div>FRAME SIZE<br><b>1920 × 1080</b></div><div>CADENCE<br><b>30 FPS</b></div></div>
        <div class="publish-button" id="publish-target"><span id="publish-action">Publish scene</span><span class="publish-check" id="publish-check">↗</span></div></div>
      </div><div class="dock mono" id="publish-dock">03 / Publish</div>
      <div class="click-ring" id="click-ring"></div><svg class="cursor" id="cursor" viewBox="0 0 36 42"><path d="M1 1L3 32L11 24L18 39L24 36L17 22L29 22Z" fill="#F2F0E9" stroke="#101114" stroke-width="2" stroke-linejoin="round"/></svg>
    </div>
    <div class="graph-shell" id="graph-shell"><div class="graph-chrome mono" id="graph-chrome">03 / Frame provenance · film / wake</div>
      <div class="story-heading" id="story-heading"><small class="mono">03 / FOLLOW THE FRAME</small>FROM SOURCE TO CERTAINTY.</div>
      <div class="story-stage" id="story-stage"><svg class="connections" id="connections" viewBox="0 0 2300 1080"></svg>
        <div class="graph-node light" id="node-source" style="left:120px;top:340px;width:260px;height:340px"><div class="node-kicker mono">01 / SOURCE</div><div class="node-title">Intent,<br>in code.</div><div class="node-detail mono"><p>index.html</p><p>motion.js</p><p>fonts.woff2</p></div></div>
        <div class="graph-node" id="node-type" style="left:530px;top:250px;width:280px;height:160px"><div class="node-kicker mono">02A / PROCESS</div><div class="node-title">Type + space</div><div class="node-small mono">MASK / KERN / REVEAL</div></div>
        <div class="graph-node" id="node-geometry" style="left:530px;top:590px;width:280px;height:160px"><div class="node-kicker mono">02B / PROCESS</div><div class="node-title">Form + time</div><div class="node-small mono">PATH / FRAME / CURVE</div></div>
        <div class="graph-node light" id="node-render" style="left:950px;top:385px;width:300px;height:250px"><div class="node-kicker mono">02 / PROCESS</div><div class="node-title">One complete<br>frame.</div><div class="node-detail mono">renderFrame(ctx)<br>NO REPLAY REQUIRED</div></div>
        <div class="graph-node" id="node-verify" style="left:1410px;top:340px;width:290px;height:340px"><div class="node-kicker mono">03 / VERIFY</div><div class="node-title">Trust,<br>then publish.</div><div class="node-verify-list mono"><div class="node-verify-row">Seek <b id="check-seek">○</b></div><div class="node-verify-row">Hash <b id="check-hash">○</b></div><div class="node-verify-row">Inspect <b id="check-inspect">○</b></div></div></div>
        <div class="graph-node orange" id="node-publish" style="left:1870px;top:385px;width:300px;height:250px"><div class="node-kicker mono">04 / PUBLISH</div><div class="node-title">A film.<br>Not a promise.</div><div class="node-detail mono">HTML → H.264<br>FRAME BY FRAME</div></div>
        ${['SOURCE', 'PROCESS', 'VERIFY', 'PUBLISH'].map((s, i) => `<div class="stage-label mono" id="stage-label-${i}" style="left:${[120, 530, 1410, 1870][i]}px">${s}</div>`).join('')}
      </div><div class="story-footnote mono" id="story-footnote">Branch where the work branches.<br>Merge where the frame resolves.</div>
    </div>
    <div class="layer" id="resolve"><div class="resolve-heading" id="resolve-heading"><div>COMPLEXITY,</div><div>COMPOSED.</div></div>
      ${ledger.map((column, c) => `<div class="ledger-header mono" id="ledger-header-${c}" style="left:${104 + c * 430}px">0${c + 1} / ${column[0]}</div>` + column.slice(1).map((name, r) => `<div class="ledger-record" id="record-${c * 8 + r}" style="left:${104 + c * 430}px;top:${482 + r * 46}px"><span>${name}</span><span class="ordinal mono">${String(c * 8 + r + 1).padStart(2, '0')}</span></div>`).join('')).join('')}
      <div class="ledger-caption mono" id="ledger-caption">32 OPERATIONS. ONE COMPOSITION.</div>
      <div class="final-title" id="final-title">${chars('FRAMECRAFT')}</div><div class="final-subtitle"><span id="final-motion">MOTION,</span><span id="final-engineered">ENGINEERED.</span></div>
      <div class="final-rule" id="final-rule"></div><div class="final-note mono" id="final-note">HTML. FRAME BY FRAME.</div><div class="final-counter mono" id="final-counter">MOTION STUDIES / VOL. 02</div><div class="final-corner" id="final-corner"></div>
    </div>
    <header class="hud"><div class="brand">FRAMECRAFT <span class="muted">/</span> MOTION STUDIES</div><div class="hud-right mono"><span>VOL. 02</span><span>1920 × 1080</span><span>30 FPS</span></div></header>
    <div class="footer-line"><div class="footer-progress" id="footer-progress"></div></div><footer class="footer mono"><span id="chapter">01 / THE FRAME WAKES UP</span><span id="timecode"></span></footer>`;

  const edges = [
    {d:'M380 510 C450 510 450 330 530 330', start:858, end:902},
    {d:'M380 510 C450 510 450 670 530 670', start:880, end:924},
    {d:'M810 330 C880 330 880 475 950 475', start:938, end:980},
    {d:'M810 670 C880 670 880 545 950 545', start:951, end:993},
    {d:'M1250 510 L1410 510', start:1012, end:1052},
    {d:'M1700 510 L1870 510', start:1110, end:1150}
  ];
  $('connections').innerHTML = edges.map((e, i) => `<path class="connection-base" id="edge-${i}" d="${e.d}"/><path class="connection-signal" id="signal-${i}" d="${e.d}"/><path id="arrow-${i}" d="M${[530,530,950,950,1410,1870][i]-12} ${[330,670,475,545,510,510][i]-7}l12 7-12 7" fill="none" stroke="#FF623E" stroke-width="3"/><circle class="signal-dot" id="dot-${i}" r="6"/>`).join('');
  const lengths = edges.map((_, i) => $(`edge-${i}`).getTotalLength());
  const every = [...document.querySelectorAll('#every-frame .type-line span')];
  const intent = [...document.querySelectorAll('#has-intent .type-line span')];
  const finalLetters = [...$('final-title').children];
  const ease = (f, a, b, curve = snap) => curve(progress(f, a, b));
  const k = (f, values) => keyframes(f, values.map(([frame, value]) => ({frame, value, ease:travel})));
  const rect = (node, x, y, w, h) => {node.style.left=`${x}px`;node.style.top=`${y}px`;node.style.width=`${w}px`;node.style.height=`${h}px`;};
  const morph = f => {const t = ease(f,780,840,travel);return {x:lerp(1030,80,t),y:lerp(470,118,t),w:lerp(630,1760,t),h:lerp(400,820,t)};};
  const sourceLines = ['<!doctype html>', '<main class="frame">', '  EVERY FRAME', '</main>', '', 'framecraft.shot({', '  renderFrame(ctx) {', '    const t = ctx.frame;', '    compose(t);', '  }', '});'];
  const pointerStops = [
    [390,1720,895],[420,400,216],[444,480,216],[452,480,216],[500,430,381],
    [534,1587,837],[550,1587,837],[590,1727,937],[618,330,381],[648,823,381],
    [668,823,381],[700,1230,964],[730,1345,814],[746,1345,814],[780,1345,814]
  ];
  function pointerAt(f) {
    let i = pointerStops.findIndex(p => f <= p[0]);
    if (i < 1) i = i === 0 ? 1 : pointerStops.length-1;
    const a=pointerStops[i-1], b=pointerStops[i];
    const dragging = a[0] === 452 || a[0] === 550;
    return cursor(f,{from:{x:a[1],y:a[2]},to:{x:b[1],y:b[2]},control1:{x:lerp(a[1],b[1],dragging?1/3:.35),y:lerp(a[2],b[2],dragging?1/3:0)},control2:{x:lerp(a[1],b[1],dragging?2/3:.8),y:lerp(a[2],b[2],dragging?2/3:1)},start:a[0],duration:b[0]-a[0],ease:dragging ? travel : M.easing.easeInOut});
  }
  function render(f) {
    $('film').dataset.frame = String(f);
    const wakeOut = 1-ease(f,315,370);
    apply($('wake'), {opacity:wakeOut});
    every.forEach((n,i) => {const a=ease(f,12+i*3,40+i*3), b=ease(f,108+i*2,145+i*2,travel);apply(n,{x:Math.round(-45*b),y:Math.round(270*(1-a)-450*b),rotation:Math.round(-400*(1-a))/100,opacity:a*(1-b)});});
    intent.forEach((n,i) => {const a=ease(f,125+i*3,157+i*3), b=ease(f,228+i*2,267+i*2,travel);apply(n,{x:Math.round(-100*b),y:Math.round(280*(1-a)-400*b),rotation:Math.round(300*(1-a))/100,opacity:a*(1-b)});});
    apply($('wake-note'),{x:35*(1-ease(f,165,193)),opacity:ease(f,165,193)*(1-ease(f,235,258))});
    apply($('wake-mark'),{scale:Math.max(.001,k(f,[[0,.001],[38,1],[102,1],[143,.35],[230,.35],[280,.001]])),originX:0,originY:0,opacity:1-ease(f,260,290)});
    apply($('wake-number'),{opacity:ease(f,50,80)*(1-ease(f,272,294))});
    apply($('system-copy'),{y:80*(1-ease(f,260,292)),opacity:ease(f,260,292)*(1-ease(f,305,333))});
    const wm=ease(f,300,384,travel);
    const wr={x:lerp(100,690,wm),y:lerp(202,280,wm),w:lerp(1710,910,wm),h:lerp(622,570,wm)};
    rect($('type-frame'),wr.x,wr.y,wr.w,wr.h);
    apply($('type-frame'),{opacity:ease(f,221,251)*(1-ease(f,330,357))});

    apply($('desktop'),{opacity:ease(f,318,352)*(1-ease(f,820,846))});
    const drag=ease(f,452,500,travel), resize=ease(f,550,590,travel), minimize=ease(f,648,675,travel);
    const sourceX=180-50*drag,sourceY=190+165*drag;
    rect($('source'),sourceX,sourceY,790,540);
    apply($('source'),{x:(280-sourceX)*minimize,y:(990-sourceY)*minimize,scale:Math.max(.001,1-.97*minimize),opacity:ease(f,365,398)*(1-minimize),originX:0,originY:0});
    rect($('inspector'),wr.x,wr.y,wr.w+140*resize,wr.h+100*resize);
    apply($('inspector'),{opacity:ease(f,318,360)});
    const focused=f<420?'inspector':f<534?'source':f<618?'inspector':f<648?'source':f<700?'inspector':'publish';
    ['source','inspector','publish'].forEach((id,i)=>{const n=$(id);n.classList.toggle('focused',focused===id);n.style.zIndex=String(focused===id?8:i+2);});
    $('source-code').innerHTML=sourceLines.map((line,i)=>`<span class="source-number">${String(i+1).padStart(2,'0')}</span><span${i===5||i===7?' class="source-key"':''}>${line.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</span>`).join('\n');
    $('preview-frame').textContent=`FRAME ${String(Math.min(359,Math.max(0,f-360)*2)).padStart(4,'0')}`;
    const pr=morph(f);rect($('publish'),pr.x,pr.y,pr.w,pr.h);
    apply($('publish'),{y:24*(1-ease(f,381,412)),opacity:ease(f,381,412)});
    for(const n of $('publish').children)apply(n,{opacity:1-ease(f,797,810)});
    $('publish-target').classList.toggle('done',f>=746);
    $('publish-kicker').textContent=f>=746?'FRAME PROVENANCE / READY':'SELECTED SCENE / FILM';
    $('publish-name').textContent=f>=746?'Every frame has a source.':'motion-studies-02.mp4';
    $('publish-action').textContent=f>=746?'Follow the frame':'Publish scene';
    $('publish-check').textContent=f>=746?'✓':'↗';
    apply($('publish-dock'),{opacity:ease(f,395,420)*(1-ease(f,775,797))});
    $('publish-dock').classList.toggle('active',f>=700);
    const pointer=pointerAt(f), click=[420,534,618,648,700,746].some(c=>f>=c&&f<c+4)||(f>=452&&f<=500)||(f>=550&&f<=590);
    const cursorOpacity=ease(f,385,397)*(1-ease(f,776,793));
    apply($('cursor'),{x:pointer.x,y:pointer.y,scale:click?.87:1,opacity:cursorOpacity,originX:0,originY:0});
    apply($('click-ring'),{x:pointer.x,y:pointer.y,scale:click?1:.65,opacity:click?cursorOpacity*.8:0});

    const graph=$('graph-shell');rect(graph,pr.x,pr.y,pr.w,pr.h);
    apply(graph,{opacity:ease(f,810,825)*(1-ease(f,1257,1287))});
    const expand=ease(f,810,858,travel);graph.style.borderColor=`rgba(86,89,95,${1-expand})`;
    apply($('graph-chrome'),{opacity:1-expand,y:-52*expand});
    const full=ease(f,825,865,travel);graph.style.left=`${lerp(pr.x,0,full)}px`;graph.style.top=`${lerp(pr.y,0,full)}px`;graph.style.width=`${lerp(pr.w,1920,full)}px`;graph.style.height=`${lerp(pr.h,1080,full)}px`;
    apply($('story-heading'),{opacity:ease(f,839,872)*(1-ease(f,1232,1272)),y:25*(1-ease(f,839,872))});
    const cx=k(f,[[810,480],[870,480],[930,835],[995,1100],[1065,1545],[1110,1545],[1175,1960],[1236,1145]]);
    const cy=k(f,[[810,510],[1175,510],[1236,520]]);
    const zoom=k(f,[[810,1.03],[870,1.03],[930,1.02],[995,1.02],[1065,1.05],[1110,1.05],[1175,1.06],[1236,.76]]);
    const view=camera(f,{from:{x:cx,y:cy,zoom},to:{x:cx,y:cy,zoom},start:0,duration:1,viewport:{width:1920,height:1080}});
    apply($('story-stage'),{...view,originX:0,originY:0});
    ['source','type','geometry','render','verify','publish'].forEach((id,i)=>{const a=ease(f,[817,866,888,954,1034,1133][i],[849,898,920,986,1066,1165][i]);apply($(`node-${id}`),{y:20*(1-a),scale:lerp(.96,1,a),opacity:a});});
    edges.forEach((e,i)=>{const t=ease(f,e.start,e.end,M.easing.easeInOut);drawSvg($(`edge-${i}`),t,lengths[i]);drawSvg($(`signal-${i}`),t,lengths[i]);$(`signal-${i}`).style.opacity=String(1-ease(f,e.end+30,e.end+60));$(`arrow-${i}`).style.opacity=String(ease(f,e.end-5,e.end));const p=$(`edge-${i}`).getPointAtLength(lengths[i]*t);$(`dot-${i}`).setAttribute('cx',String(p.x));$(`dot-${i}`).setAttribute('cy',String(p.y));$(`dot-${i}`).style.opacity=String(f>e.start&&f<e.end?1:0);});
    ['seek','hash','inspect'].forEach((s,i)=>{$(`check-${s}`).textContent=f>=[1068,1080,1092][i]?'✓':'○';});
    for(let i=0;i<4;i++)apply($(`stage-label-${i}`),{opacity:ease(f,1195+i*4,1221+i*4)});
    apply($('story-footnote'),{opacity:ease(f,1199,1231)*(1-ease(f,1265,1295))});

    apply($('resolve'),{opacity:ease(f,1260,1287)});
    const titleOut=1-ease(f,1400,1440,travel);
    apply($('resolve-heading'),{y:-60*(1-titleOut),opacity:ease(f,1287,1317)*titleOut});
    for(let c=0;c<4;c++)apply($(`ledger-header-${c}`),{y:-10*(1-titleOut),opacity:ease(f,1306+c*5,1330+c*5)*titleOut});
    for(let i=0;i<32;i++){
      const c=Math.floor(i/8),r=i%8;
      const a=ease(f,1294+c*9+r*3,1333+c*9+r*3),b=ease(f,1415+r*3+c*4,1472+r*3+c*4,travel);
      const x0=[152,680,1285,1630][c]-(104+c*430), y0=540-(482+r*46);
      const destX=132+i*51-(104+c*430),destY=285-(482+r*46);
      apply($(`record-${i}`),{x:lerp(x0*(1-a),destX,b),y:lerp(y0*(1-a),destY,b),scale:lerp(.8+.2*a,.09,b),rotation:(1-a)*(r-3.5)*2,opacity:a*(1-ease(f,1490+i,1514+i)),originX:0,originY:0});
    }
    apply($('ledger-caption'),{opacity:ease(f,1360,1380)*(1-ease(f,1404,1424))});
    finalLetters.forEach((n,i)=>{const t=ease(f,1460+i*3,1494+i*3);apply(n,{y:170*(1-t),rotation:4*(1-t),opacity:t});});
    apply($('final-motion'),{y:95*(1-ease(f,1498,1530)),opacity:ease(f,1498,1530)});
    apply($('final-engineered'),{y:95*(1-ease(f,1510,1542)),opacity:ease(f,1510,1542)});
    apply($('final-rule'),{scale:Math.max(.001,ease(f,1514,1551,travel)),opacity:ease(f,1514,1530),originX:0,originY:0});
    apply($('final-note'),{opacity:ease(f,1532,1557)});apply($('final-counter'),{opacity:ease(f,1538,1563)});
    apply($('final-corner'),{x:30*(1-ease(f,1510,1550)),opacity:ease(f,1510,1550)});
    $('chapter').textContent=f<360?'01 / THE FRAME WAKES UP':f<810?'02 / THE DESKTOP PERFORMS':f<1260?'03 / THE SYSTEM TELLS A STORY':'04 / CONTROLLED COMPLEXITY';
    $('timecode').textContent=`${String(Math.floor(f/30)).padStart(2,'0')}:${String(f%30).padStart(2,'0')} / 00:55`;
    $('footer-progress').style.transform=`scaleX(${f/1649})`;
  }
  window.framecraft.shot({
    async prepare() {
      if (![0,360,810,1260].includes(offset)) throw new Error('Invalid film shot offset');
      if (document.querySelectorAll('.ledger-record').length!==32) throw new Error('The finale requires 32 operations');
      await document.fonts.ready;
      // Fractional flex glyph origins rasterize differently after reverse seeks in Chromium.
      for (const line of document.querySelectorAll('.type-line')) {
        let x=0;
        for (const n of line.children) {
          n.style.position='relative';n.style.left=`${Math.round(x)-x}px`;
          x+=parseFloat(getComputedStyle(n).width);
        }
      }
    },
    renderFrame(ctx) { render(ctx.frame + offset); }
  });
})();
