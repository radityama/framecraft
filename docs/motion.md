# Optional frame-driven motion helpers

Copy `authoring/motion.js` into your project's assets and load that local file after `runtime.js`. It exposes `window.framecraftMotion`; no package, framework, timer or runtime extension is required. Raw CSS/JS/SVG and existing GSAP timelines remain supported. Never fetch helpers remotely.

```js
const m = window.framecraftMotion;
window.framecraft.shot({renderFrame(ctx) {
  const opacity = m.keyframes(ctx.frame, [
    {frame: 0, value: 0, ease: m.easing.easeOut},
    {frame: 12, value: 1}, {frame: 60, value: 1}, {frame: 72, value: 0}
  ]);
  m.apply(document.querySelector('h1'), {opacity, y: 20 * (1 - m.progress(ctx.frame, 0, 12))});
}});
```

All numeric inputs must be finite. Frames, starts, durations, indices and seeds are nonnegative safe integers; timing intervals must have positive duration. Pure calculations are seek-order independent. DOM helpers assign complete style state rather than accumulating transforms.

| API | Contract |
| --- | --- |
| `clamp(n,min=0,max=1)`, `lerp(a,b,t)` | Inclusive clamp, reversed bounds fail; interpolation deliberately allows unclamped `t`. |
| `progress(frame,start,end)` | Clamped 0..1 with exact endpoints, positive interval. |
| `easing.linear/easeIn/easeOut/easeInOut/cubic(t)` | Clamped input, exact 0/1 endpoints; quadratic in/out/in-out and symmetric cubic in-out. |
| `cubicBezier(x1,y1,x2,y2)(t)` | CSS-style time inversion; x controls 0..1, finite y may overshoot. |
| `keyframes(frame,points)` | Nonempty strictly increasing numeric keys. Before/after returns first/last value. Duplicate/nonmonotonic/invalid keys fail. A key's optional `ease` function controls its outgoing segment. |
| `stagger(frame,index,delay,duration,start=0)` | Progress from `start + index*delay` through that start plus duration. |
| `transform({x,y,scale,rotation})` | CSS translate(px), rotate(deg), positive scale. |
| `apply(node,{x,y,scale,rotation,opacity,originX,originY})` | Sets transform, clamped opacity and normalized origin; omitted values reset to defaults. |
| `drawSvg(node,amount,length)` | Explicit positive path length; sets dash array and clamped drawing offset. |
| `cursor(frame,options)` | Explicit from/to, control1/control2, start/duration/ease; returns x/y/visible/clicking. Click interval is half-open. Optional seed/humanize perturbs controls deterministically, not per-frame jitter. |
| `framing(rect,viewport)` | Positive rectangle/viewport fit; returns center x/y and zoom. |
| `camera(frame,{from,to,start,duration,viewport,ease})` | Interpolates focus centers and positive zoom to x/y/scale. Apply with origin 0,0. |
| `reveal(nodes,frame,{start,delay,duration,distance})` | Staggered opacity/vertical position, complete assignment, for word/character/line spans. |

Examples preserve configured fonts and actual DOM text. UI reduced-motion preferences do not rewrite project pixels; authors choose explicit alternatives when a deliverable needs them. Avoid unreadable jitter/flashing.

```sh
bun run validate --project projects/motion --scene examples
bun run snap --project projects/motion --scene examples --shot cursor --frame 55
bun run review --project projects/motion --scene examples --output output/motion-review
bun run render --project projects/motion --scene examples --output output/motion-examples.mp4
```

The silent 640×360, 30 fps fixture contains cursor, window, type and camera: four 90-frame shots, 360 frames/12 seconds. They demonstrate a controlled cursor click, translating/scaling browser panel, word/character/line reveals and overview-to-focus camera. Each is a standalone HTML shot using the current protocol and local assets. The test checks its helper copy against `authoring/motion.js`.
