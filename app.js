
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Use compositor-friendly native glass instead of per-element SVG
  // displacement maps; the original layered highlights stay in CSS.

  /* ---------- Liquid glass tab pill: two edges on springs so the drop stretches ---------- */
  const ul = document.getElementById('tabs'), pill = document.getElementById('pill'), nav = document.getElementById('nav');
  const links = [...ul.querySelectorAll('a')];
  const L = {x: 0, v: 0}, R = {x: 0, v: 0}; let tgt = {l: 0, r: 0}, kL = .12, kR = .12, running = false, current = 0;
  const measure = i => { const li = links[i].parentElement, o = ul.offsetLeft; pill.style.top = (ul.offsetTop - 3) + 'px'; pill.style.height = (ul.offsetHeight + 6) + 'px'; return {l: o + li.offsetLeft - 3, r: o + li.offsetLeft + li.offsetWidth + 3}; };
  function drawPill(){
    const w = Math.max(R.x - L.x, 20), sp = Math.min(Math.abs(L.v) + Math.abs(R.v), 40);
    const sy = 1 - sp * .0035, grow = 1 + Math.min(sp * .003, .07);
    pill.style.width = w + 'px';
    pill.style.transform = `translate3d(${L.x}px,0,0) scale(${grow},${sy * grow})`;
  }
  function tick(){
    if (document.hidden) { running = false; L.x = tgt.l; R.x = tgt.r; L.v = R.v = 0; drawPill(); return; }
    L.v = (L.v + (tgt.l - L.x) * kL) * .72; L.x += L.v;
    R.v = (R.v + (tgt.r - R.x) * kR) * .72; R.x += R.v;
    drawPill();
    if ([L, R].every(e => Math.abs(e.v) < .03) && Math.abs(tgt.l - L.x) < .3 && Math.abs(tgt.r - R.x) < .3){
      L.x = tgt.l; R.x = tgt.r; L.v = R.v = 0; drawPill(); running = false; return;
    }
    requestAnimationFrame(tick);
  }
  function go(i, instant){
    const goingRight = i >= current; current = i;
    links.forEach((l, n) => l.classList.toggle('active', n === i));
    tgt = measure(i);
    if (goingRight){ kR = .2; kL = .085; } else { kL = .2; kR = .085; }   // leading edge snaps, trailing edge drags
    if (instant || reduce){ L.x = tgt.l; R.x = tgt.r; L.v = R.v = 0; drawPill(); return; }
    if (!running){ running = true; requestAnimationFrame(tick); }
  }

  /* ---------- Navigation + scroll spy ---------- */
  let lock = 0, busy = false;
  const sceneList = [...document.querySelectorAll('.scene')];
  const veil = document.getElementById('veil'), panel = veil.firstElementChild;
  /* tint per destination: [deep, light] */
  const veilCols = [['#ff6a00','#ffc24d'], ['#e8247f','#ff9ccb'], ['#12a150','#8be8ae'], ['#5a2fe0','#a9b7ff'], ['#0a7bff','#8fe3ff']];
  const here = () => { let bi = 0, bd = 1e9; sceneList.forEach((s, i) => { const d = Math.abs(s.getBoundingClientRect().top); if (d < bd){ bd = d; bi = i; } }); return bi; };
  const slide = (axis, from, to, ms) => {
    const u = axis === 'x' ? innerWidth / 100 : innerHeight / 100, t = v => axis === 'x' ? `translate3d(${v * u}px,0,0)` : `translate3d(0,${v * u}px,0)`;
    return panel.animate([{transform: t(from)}, {transform: t(to)}], {duration: ms, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards'}).finished;
  };
  /* every click sweeps in from a different side: right -> bottom -> left -> top -> ... */
  const dirs = [
    {axis: 'x', X: [100, -60, -220],  angle: 100, box: 'left:0;top:-25vh;width:220vw;height:150vh'},
    {axis: 'y', X: [100, -60, -220],  angle: 180, box: 'left:-25vw;top:0;width:150vw;height:220vh'},
    {axis: 'x', X: [-220, -60, 100],  angle: 260, box: 'left:0;top:-25vh;width:220vw;height:150vh'},
    {axis: 'y', X: [-220, -60, 100],  angle: 0,   box: 'left:-25vw;top:0;width:150vw;height:220vh'}
  ];
  let dirIdx = 0;
  async function navigateTo(target){
    const to = sceneList.indexOf(target), from = here();
    if (busy || to < 0 || to === from) return;
    const jump = () => scrollTo({top: target.offsetTop, behavior: 'instant'});
    lock = Date.now() + 1500; go(+target.dataset.tab);
    if (reduce){ jump(); return; }
    busy = true;
    const d = dirs[dirIdx++ % dirs.length], [c1, c2] = veilCols[to], card = target.querySelector('.card');
    panel.style.cssText = d.box;
    panel.style.background = `linear-gradient(${d.angle}deg, ${c1}, ${c2})`;
    veil.style.visibility = 'visible';
    await slide(d.axis, d.X[0], d.X[1], 330);                   // wave sweeps in and covers the page
    if (card) card.classList.remove('in');
    jump();                                                     // swap the page while hidden
    setTimeout(() => card && card.classList.add('in'), 80);     // card re-blooms as the wave leaves
    await slide(d.axis, d.X[1], d.X[2], 370);                   // wave sweeps away  (330 + 370 = 0.7 s)
    veil.style.visibility = 'hidden'; busy = false; lock = Date.now() + 150;
  }
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); const t = document.querySelector(a.getAttribute('href')); if (t) navigateTo(t);
  }));
  const spy = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting && Date.now() > lock){ const i = +e.target.dataset.tab; if (i !== current) go(i); }
  }), {threshold: .55});
  document.querySelectorAll('.scene').forEach(s => spy.observe(s));

  let resizeFrame = 0;
  addEventListener('resize', () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; go(current, true); });
  }, {passive:true});
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => go(current, true));
  go(0, true);


  /* ---------- Scroll cue: jump to the next section, hide at the very bottom ---------- */
  const cue = document.getElementById('cue'), scenes = [...document.querySelectorAll('.scene')];
  cue.addEventListener('click', () => { const next = scenes[here() + 1]; if (next) navigateTo(next); });
  const cueState = () => cue.classList.toggle('hide', innerHeight + scrollY >= document.documentElement.scrollHeight - 60);
  addEventListener('scroll', cueState, {passive: true}); addEventListener('resize', cueState); cueState();

  /* ---------- Reveal + counters ---------- */
  const reveal = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    e.target.querySelectorAll('[data-count]').forEach(n => {
      const to = +n.dataset.count, t0 = performance.now();
      (function f(t){ const p = Math.min((t - t0) / 1200, 1); n.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + (to > 20 ? '+' : ''); if (p < 1) requestAnimationFrame(f); })(t0);
    });
    reveal.unobserve(e.target);
  }), {threshold: .25});
  document.querySelectorAll('.card').forEach(c => reveal.observe(c));

  /* ---------- Pointer: parallax ---------- */
  // One update per rendered frame, for the visible scene only.
  // Pause on touch devices, in hidden tabs and with reduced motion.
  if (!reduce && matchMedia('(hover:hover) and (pointer:fine)').matches) {
    let pointerFrame = 0, pointerX = 0, pointerY = 0;
    addEventListener('pointermove', e => {
      pointerX = e.clientX / innerWidth - .5;
      pointerY = e.clientY / innerHeight - .5;
      if (pointerFrame || document.hidden) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        const scene = sceneList[here()];
        if (!scene) return;
        scene.style.setProperty('--px', pointerX.toFixed(3));
        scene.style.setProperty('--py', pointerY.toFixed(3));
      });
    }, {passive:true});
  }

  /* ---------- Demo ---------- */
  const say = {
    lion:  '<b>Leo the Lion:</b> Roar-some to meet you! I love counting stars. Want to count with me?',
    bear:  '<b>Benny the Bear:</b> Hi hi! I know where the sweetest berries grow. Follow me!',
    rabbit:'<b>Rosie the Rabbit:</b> Hop hop hooray! Can you jump like me? One, two, three!',
    fox:   '<b>Felix the Fox:</b> Psst, I have a riddle for you. What has hills but no legs?'
  };
  const bubble = document.getElementById('bubble');
  document.getElementById('pals').addEventListener('click', e => {
    const b = e.target.closest('.pal'); if (!b) return;
    document.querySelectorAll('.pal').forEach(p => p.classList.toggle('on', p === b));
    bubble.innerHTML = say[b.dataset.k];
    bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
  });
  document.getElementById('form').addEventListener('submit', e => {
    e.preventDefault();
    document.getElementById('thanks').textContent = 'Yay! You are on the list. See you in the meadow 🌼';
    e.target.reset();
  });
})();
