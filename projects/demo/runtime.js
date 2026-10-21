(() => {
  let shot;
  let settings;
  let preparation;
  const timelines = [];
  let milliseconds = 0;
  const requestFrame = window.requestAnimationFrame.bind(window);
  const epoch = 1700000000000;
  Date.now = () => epoch + milliseconds;
  Object.defineProperty(performance, 'now', {value: () => milliseconds, configurable: true});
  window.requestAnimationFrame = callback => requestFrame(() => callback(milliseconds));
  const send = (type, data = {}) => parent.postMessage({v: 1, type, ...data}, location.origin);
  const failure = (error) => send('error', {message: error instanceof Error ? error.stack || error.message : String(error)});
  const randomFor = (name, frame) => {
    let seed = frame + 1;
    for (const ch of name) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
    return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  };
  window.framecraft = {
    timeline(timeline) { timelines.push(timeline); },
    shot(definition) {
      if (shot || typeof definition?.renderFrame !== 'function') throw new Error('Register exactly one shot with renderFrame(ctx)');
      shot = definition;
      preparation = Promise.resolve().then(() => shot.prepare?.());
      preparation.catch(failure);
    },
  };
  addEventListener('message', async ({source, origin, data}) => {
    if (source !== parent || origin !== location.origin || data?.v !== 1) return;
    if (data.type === 'init') {
      const {fps, durationFrames, width, height, id} = data.ctx || {};
      if (![fps, durationFrames, width, height].every(n => Number.isSafeInteger(n) && n > 0) || typeof id !== 'string') return failure(new Error('Invalid init context'));
      settings = data.ctx;
      if (!preparation) return failure(new Error('Shot is not registered'));
      preparation.then(() => send('ready')).catch(failure);
    } else if (data.type === 'seek') {
      try {
        if (!shot || !settings) throw new Error('Shot is not ready');
        const frame = data.frame;
        if (!Number.isSafeInteger(frame) || frame < 0 || frame >= settings.durationFrames) throw new Error(`Invalid shot frame: ${frame}`);
        const seconds = frame / settings.fps;
        milliseconds = seconds * 1000;
        Math.random = randomFor(settings.id, frame);
        const ctx = {...settings, frame, seconds, progress: settings.durationFrames === 1 ? 1 : frame / (settings.durationFrames - 1), random: Math.random};
        await shot.renderFrame(ctx);
        for (const animation of document.getAnimations()) {
          animation.pause();
          animation.currentTime = seconds * 1000;
        }
        for (const timeline of [...timelines, ...(shot.timelines || [])]) timeline.time(seconds, false);
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, image => image.decode()));
        await new Promise(resolve => requestFrame(resolve));
        await new Promise(resolve => requestFrame(resolve));
        send('rendered', {frame});
      } catch (error) { failure(error); }
    }
  });
  addEventListener('pagehide', () => shot?.dispose?.());
})();
