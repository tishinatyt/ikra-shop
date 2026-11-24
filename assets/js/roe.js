(() => {
  const canvas = document.querySelector('#roe');
  const context = canvas?.getContext('2d', { alpha: false });
  if (!context) return;

  const hero = canvas.closest('.hero');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const light = { x: .72, y: .25 };
  const target = { ...light };
  let width = 0;
  let height = 0;
  let dpr = 1;
  let grains = [];
  let intersects = false;
  let frame = 0;
  let lastPaint = 0;
  let painted = false;
  let introDone = false;
  let mode = '';
  let startedAt = 0;
  let activeUntil = 0;

  function measure() {
    const nextWidth = canvas.clientWidth;
    const nextHeight = canvas.clientHeight;
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!nextWidth || !nextHeight ||
        (nextWidth === width && nextHeight === height && nextDpr === dpr)) return;
    width = nextWidth;
    height = nextHeight;
    dpr = nextDpr;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const radius = width <= 760 ? 15 : Math.max(17, Math.min(24, width / 62));
    const dx = radius * 1.9;
    const dy = radius * 1.65;
    grains = [];
    for (let row = 0, y = -radius; y < height + radius * 2; row++, y += dy) {
      for (let x = (row % 2 ? dx / 2 : 0) - radius; x < width + radius * 2; x += dx) {
        const r = radius * (.86 + random() * .24);
        grains.push({
          x: x + (random() - .5) * radius * .5,
          y: y + (random() - .5) * radius * .5,
          r, eye: random() * Math.PI * 2, tint: random() * .12,
          distance: Math.hypot(x - width * .6, y - height * .5)
        });
      }
    }
    grains.sort((a, b) => a.y - b.y);
    painted = false;
  }

  function dot(x, y, r, fill) {
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
  }

  function paint(age) {
    painted = true;
    const lx = light.x * width;
    const ly = light.y * height;
    const maxDistance = Math.hypot(width, height) * .75;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const background = context.createRadialGradient(lx, ly, 0, lx, ly, Math.max(width, height));
    background.addColorStop(0, '#c2410f');
    background.addColorStop(1, '#5a1405');
    context.fillStyle = background;
    context.fillRect(0, 0, width + 1, height + 1);

    for (const grain of grains) {
      const { x, y, tint, eye } = grain;
      const reveal = Math.min(1, Math.max(0, (age - grain.distance * .9) / 420));
      if (!reveal) continue;
      const r = grain.r * (.6 + .4 * (1 - (1 - reveal) ** 3));
      const distance = Math.hypot(lx - x, ly - y) || 1;
      const ux = (lx - x) / distance;
      const uy = (ly - y) / distance;
      const near = 1 - Math.min(1, distance / maxDistance);

      // Translucent body, with light passing through the far side.
      const body = context.createRadialGradient(x + ux * r * .35, y + uy * r * .35, r * .05, x, y, r);
      body.addColorStop(0, 'hsl(' + (30 + tint * 40) + ',100%,' + (66 + near * 12) + '%)');
      body.addColorStop(.55, 'hsl(' + (18 + tint * 30) + ',90%,' + (47 + near * 8) + '%)');
      body.addColorStop(1, 'hsl(' + (10 + tint * 20) + ',85%,' + (27 + near * 6) + '%)');
      context.globalAlpha = reveal;
      dot(x, y, r, body);
      const gx = x - ux * r * .42;
      const gy = y - uy * r * .42;
      const glow = context.createRadialGradient(gx, gy, 0, gx, gy, r * .55);
      glow.addColorStop(0, 'rgba(255,200,110,' + (.22 + near * .22) + ')');
      glow.addColorStop(1, 'rgba(255,200,110,0)');
      dot(x, y, r, glow);
      dot(x + Math.cos(eye) * r * .3, y + Math.sin(eye) * r * .3, r * .15, 'rgba(120,30,6,.22)');

      context.beginPath();
      context.ellipse(x + ux * r * .5, y + uy * r * .5, r * .24, r * .12,
        Math.atan2(uy, ux) + Math.PI / 2, 0, Math.PI * 2);
      context.fillStyle = 'rgba(255,255,255,' + (.55 + near * .4) + ')';
      context.fill();
      context.globalAlpha = 1;
    }
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  function tick(now) {
    const delta = lastPaint ? now - lastPaint : 1000 / 30;
    if (delta < 1000 / 30 - 1) {
      frame = requestAnimationFrame(tick);
      return;
    }
    lastPaint = now;
    if (mode === 'intro') {
      const progress = Math.min(1, (now - startedAt) / 900);
      paint(progress * (Math.max(width, height) * 1.5 + 500));
      if (progress >= 1) {
        introDone = true;
        mode = '';
        stop();
        paint(Infinity);
        return;
      }
    } else if (mode === 'interactive') {
      if (now >= activeUntil) {
        mode = '';
        stop();
        paint(Infinity);
        return;
      }
      light.x += (target.x - light.x) * .12;
      light.y += (target.y - light.y) * .12;
      paint(Infinity);
    }
    if (mode) frame = requestAnimationFrame(tick);
  }

  function sync() {
    if (!intersects || document.hidden || motion.matches) {
      if (mode === 'intro') introDone = true;
      mode = '';
      stop();
      lastPaint = 0;
      if (intersects && !document.hidden) paint(Infinity);
      return;
    }
    measure();
    if (!painted) paint(Infinity);
    if (!introDone && !mode) {
      mode = 'intro';
      startedAt = performance.now();
      frame = requestAnimationFrame(tick);
    } else if (mode === 'interactive' && !frame) {
      frame = requestAnimationFrame(tick);
    }
  }

  new IntersectionObserver(([entry]) => {
    intersects = entry.isIntersecting;
    sync();
  }).observe(hero);
  new ResizeObserver(sync).observe(hero);
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', () => {
    light.x = target.x = .72;
    light.y = target.y = .25;
    mode = '';
    stop();
    if (intersects && !document.hidden) paint(Infinity);
    sync();
  });
  hero.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || motion.matches || mode !== 'interactive') return;
    const bounds = hero.getBoundingClientRect();
    target.x = (event.clientX - bounds.left) / bounds.width;
    target.y = (event.clientY - bounds.top) / bounds.height;
  });
  const activate = () => {
    if (!intersects || document.hidden || motion.matches) return;
    mode = 'interactive';
    activeUntil = performance.now() + 6000;
    if (!frame) {
      lastPaint = 0;
      frame = requestAnimationFrame(tick);
    }
  };
  window.addEventListener('pointermove', event => { if (event.pointerType === 'mouse') activate(); }, { passive: true });
  window.addEventListener('touchstart', activate, { passive: true });
  window.addEventListener('scroll', activate, { passive: true });
})();
