/* Copy this optional file into your project's assets; all timing is frame-driven. */
(() => {
  const finite = (n, label = 'value') => { if (!Number.isFinite(n)) throw new Error(`${label} must be finite`); return n; };
  const integer = (n, label = 'frame') => { finite(n, label); if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${label} must be a nonnegative integer`); return n; };
  const clamp = (n, min = 0, max = 1) => { finite(n); finite(min); finite(max); if (min > max) throw new Error('Invalid clamp interval'); return Math.min(max, Math.max(min, n)); };
  const lerp = (a, b, t) => finite(a) + (finite(b) - a) * finite(t);
  const progress = (frame, start, end) => { integer(frame); integer(start); integer(end); if (end <= start) throw new Error('Range must have positive duration'); return clamp((frame - start) / (end - start)); };
  const easing = Object.freeze({linear: t => clamp(t), easeIn: t => clamp(t) ** 2, easeOut: t => 1 - (1 - clamp(t)) ** 2, easeInOut: t => (t = clamp(t)) < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2, cubic: t => (t = clamp(t)) < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2});
  const curve = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  function cubicBezier(x1, y1, x2, y2) {
    [x1, y1, x2, y2].forEach(n => finite(n));
    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) throw new Error('Bézier x controls must be in [0,1]');
    return value => {const t = clamp(value); if (t === 0 || t === 1) return t; let lo = 0, hi = 1; for (let i = 0; i < 40; i++) {const mid = (lo + hi) / 2; if (curve(mid, x1, x2) < t) lo = mid; else hi = mid;} return curve((lo + hi) / 2, y1, y2);};
  }
  function keyframes(frame, points) {
    integer(frame); if (!Array.isArray(points) || !points.length) throw new Error('Keyframes required');
    points.forEach((p, i) => {integer(p.frame); finite(p.value); if (i && p.frame <= points[i - 1].frame) throw new Error('Keyframes must be strictly increasing'); if (p.ease !== undefined && typeof p.ease !== 'function') throw new Error('Easing must be a function');});
    if (frame <= points[0].frame) return points[0].value;
    for (let i = 1; i < points.length; i++) if (frame <= points[i].frame) {const a = points[i - 1], b = points[i]; return lerp(a.value, b.value, finite((a.ease ?? easing.linear)(progress(frame, a.frame, b.frame)), 'easing result'));}
    return points[points.length - 1].value;
  }
  const stagger = (frame, index, delay, duration, start = 0) => {integer(index, 'index'); integer(delay, 'delay'); integer(duration, 'duration'); integer(start, 'start'); return progress(frame, start + index * delay, start + index * delay + duration);};
  function transform({x = 0, y = 0, scale = 1, rotation = 0} = {}) { [x, y, scale, rotation].forEach(n => finite(n)); if (scale <= 0) throw new Error('Scale must be positive'); return `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scale})`; }
  function apply(node, {x = 0, y = 0, scale = 1, rotation = 0, opacity = 1, originX = .5, originY = .5} = {}) { if (!node?.style) throw new Error('DOM node required'); node.style.transform = transform({x, y, scale, rotation}); node.style.opacity = String(clamp(opacity)); node.style.transformOrigin = `${clamp(originX) * 100}% ${clamp(originY) * 100}%`; }
  function drawSvg(node, amount, length) {finite(length); if (length <= 0 || !node?.style) throw new Error('SVG node and positive length required'); node.style.strokeDasharray = String(length); node.style.strokeDashoffset = String(length * (1 - clamp(amount))); }
  const point = p => {if (!p) throw new Error('Point required'); finite(p.x); finite(p.y); return p;};
  function cursor(frame, {from, to, control1 = from, control2 = to, start = 0, duration, ease = easing.easeInOut, clickFrame, clickDuration = 3, visible = true, seed = 0, humanize = 0}) {
    [from, to, control1, control2].forEach(point); integer(seed, 'seed'); finite(humanize); if (humanize < 0) throw new Error('Humanization must be nonnegative');
    const t = finite(ease(progress(frame, start, start + integer(duration, 'duration'))));
    const offset = (Math.imul(seed + 1, 1664525) >>> 0) / 4294967296 * 2 - 1;
    const axis = k => (1 - t) ** 3 * from[k] + 3 * (1 - t) ** 2 * t * (control1[k] + offset * humanize) + 3 * (1 - t) * t * t * (control2[k] - offset * humanize) + t ** 3 * to[k];
    if (clickFrame !== undefined) integer(clickFrame, 'clickFrame'); integer(clickDuration, 'clickDuration');
    return {x: axis('x'), y: axis('y'), visible: Boolean(visible), clicking: clickFrame !== undefined && frame >= clickFrame && frame < clickFrame + clickDuration};
  }
  function framing(rect, viewport) {point(rect); finite(rect.width); finite(rect.height); finite(viewport.width); finite(viewport.height); if (Math.min(rect.width, rect.height, viewport.width, viewport.height) <= 0) throw new Error('Framing dimensions must be positive'); return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, zoom: Math.min(viewport.width / rect.width, viewport.height / rect.height)};}
  function camera(frame, {from, to, start = 0, duration, viewport, ease = easing.easeInOut}) {point(from); point(to); finite(from.zoom); finite(to.zoom); finite(viewport.width); finite(viewport.height); if (Math.min(from.zoom, to.zoom, viewport.width, viewport.height) <= 0) throw new Error('Camera dimensions and zoom must be positive'); const t = finite(ease(progress(frame, start, start + integer(duration, 'duration')))); const zoom = lerp(from.zoom, to.zoom, t); return {x: viewport.width / 2 - lerp(from.x, to.x, t) * zoom, y: viewport.height / 2 - lerp(from.y, to.y, t) * zoom, scale: zoom};}
  function reveal(nodes, frame, {start = 0, delay = 2, duration = 12, distance = 20} = {}) {finite(distance); Array.from(nodes).forEach((node, i) => {const t = easing.easeOut(stagger(frame, i, delay, duration, start)); apply(node, {y: distance * (1 - t), opacity: t});});}
  globalThis.framecraftMotion = Object.freeze({clamp, lerp, progress, easing, cubicBezier, keyframes, stagger, transform, apply, drawSvg, cursor, framing, camera, reveal});
})();
