(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Sound ----------
     Everything is generated with the Web Audio API, so there are no audio files.
     Nothing plays until the visitor taps something, and the mute choice is remembered. */
  const sfx = (() => {
    let ctx = null, master = null, muted = false;
    try { muted = localStorage.getItem('uzio-muted') === '1'; } catch (e) {}
    const start = () => {
      if (muted) return null;
      if (!ctx){
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ctx = new C(); master = ctx.createGain(); master.gain.value = .7; master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    };
    function tone({f = 440, to = f, dur = .15, type = 'sine', vol = .2, at = 0, vib = 0, lp = 0, lpTo = lp}){
      const c = start(); if (!c) return;
      const t0 = c.currentTime + at, osc = c.createOscillator(), g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(to, 20), t0 + dur);
      g.gain.setValueAtTime(.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(.02, dur / 3));
      g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
      let out = osc;
      if (lp){
        const flt = c.createBiquadFilter(); flt.type = 'lowpass';
        flt.frequency.setValueAtTime(lp, t0); flt.frequency.exponentialRampToValueAtTime(Math.max(lpTo, 40), t0 + dur);
        osc.connect(flt); out = flt;
      }
      out.connect(g); g.connect(master);
      if (vib){
        const l = c.createOscillator(), lg = c.createGain();
        l.frequency.value = vib; lg.gain.value = f * .04; l.connect(lg); lg.connect(osc.frequency);
        l.start(t0); l.stop(t0 + dur + .05);
      }
      osc.start(t0); osc.stop(t0 + dur + .05);
    }
    function whoosh(){
      const c = start(); if (!c) return;
      const len = Math.floor(c.sampleRate * .5), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime;
      src.buffer = buf; bp.type = 'bandpass'; bp.Q.value = .8;
      bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(1800, t + .35);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.12, t + .12); g.gain.exponentialRampToValueAtTime(.0001, t + .5);
      src.connect(bp); bp.connect(g); g.connect(master); src.start(t);
    }
    return {
      bell: i => { const f = [523, 659, 784][i % 3]; tone({f, to: f * 1.01, dur: .5, type: 'triangle', vol: .2}); tone({f: f * 2, dur: .35, vol: .06}); },
      chime: () => [523, 659, 784, 1047].forEach((f, i) => tone({f, dur: .45, type: 'triangle', vol: .17, at: i * .09})),
      whoosh,
      pop: () => tone({f: 500, to: 900, dur: .09, vol: .18}),
      get muted(){ return muted; },
      toggle(){
        muted = !muted;
        try { localStorage.setItem('uzio-muted', muted ? '1' : '0'); } catch (e) {}
        if (!muted) this.pop();
        return muted;
      }
    };
  })();
  const soundBtn = document.getElementById('sound');
  const paintSound = () => {
    soundBtn.classList.toggle('off', sfx.muted);
    soundBtn.setAttribute('aria-pressed', String(sfx.muted));
    soundBtn.setAttribute('aria-label', sfx.muted ? 'Turn sound on' : 'Mute sound');
  };
  soundBtn.addEventListener('click', () => { sfx.toggle(); paintSound(); });
  paintSound();
  /* Full-surface water-drop refraction. One displacement pass per glass
     surface (instead of the original triple RGB passes), static maps generated
     only when geometry changes, with native-glass fallback in other browsers. */
  const defs = document.getElementById('defs');
  const canRefract = !reduce && !!defs && CSS.supports('backdrop-filter', 'url("#refraction-check")');
  const ns = 'http://www.w3.org/2000/svg';
  const mapCache = new Map();
  function lensMap(w, h, r, bezel) {
    const key = [w,h,r,bezel].map(Math.round).join(':');
    if (mapCache.has(key)) return mapCache.get(key);
    const down = Math.min(1, 192 / Math.max(w,h));
    const cw = Math.max(8, Math.round(w*down));
    const ch = Math.max(8, Math.round(h*down));
    const cr = Math.min(r*down,cw/2,ch/2);
    const cb = Math.max(2, Math.min(bezel*down, Math.min(cw,ch)/2));
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(cw,ch), bytes = img.data;
    // A convex lens bends the entire image, not only a narrow edge band.
    // Smooth center-to-rim refraction + a very subtle broad water ripple.
    // This map is calculated only at startup or on resize (never per frame).
    for(let y=0; y<ch; y++) for(let x=0; x<cw; x++) {
      const px=x+.5-cw/2, py=y+.5-ch/2;
      const ux=px/(cw/2), uy=py/(ch/2);
      const radial=Math.min(1,Math.sqrt(ux*ux*.54+uy*uy*.46));
      const qx=Math.abs(px)-(cw/2-cr), qy=Math.abs(py)-(ch/2-cr);
      const sd=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-cr;
      const inside=Math.max(0,-sd);
      const rim=Math.pow(1-Math.min(1,inside/cb),1.8);
      // Continuous refraction everywhere including center. Direction gently
      // changes across the field, with a slightly stronger bend at the rim.
      const field=.27+.30*Math.pow(radial,1.4)+.43*rim;
      const xWave=.075*Math.sin(uy*4.4+ux*2.1+.8);
      const yWave=.075*Math.sin(ux*4.1-uy*1.8+.5);
      const dx=Math.max(-.95,Math.min(.95,-ux*field+xWave));
      const dy=Math.max(-.95,Math.min(.95,-uy*field+yWave));
      const off=(y*cw+x)*4;
      bytes[off]=Math.round(128+112*dx);
      bytes[off+1]=Math.round(128+112*dy);
      bytes[off+2]=128; bytes[off+3]=255;
    }
    ctx.putImageData(img,0,0);
    const url=canvas.toDataURL('image/png');
    mapCache.set(key,url);
    return url;
  }
  function setLens(id,url,scale,blur=0) {
    let f=document.getElementById(id);
    if(!f){f=document.createElementNS(ns,'filter');f.setAttribute('id',id);defs.appendChild(f);}
    f.setAttribute('x','0');f.setAttribute('y','0');f.setAttribute('width','1');f.setAttribute('height','1');
    f.setAttribute('color-interpolation-filters','sRGB');
    // One full-surface displacement pass followed by a tiny frost softening.
    f.innerHTML=`<feImage href="${url}" preserveAspectRatio="none" result="map"/>
      <feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="bent"/>
      ${blur ? `<feGaussianBlur in="bent" stdDeviation="${blur}"/>` : ''}`;
  }
  let lensResizeTimer;
  const lensGeometry = new WeakMap();
  function buildLenses(){
    if(!canRefract) return;
    let i=0;
    for(const el of document.querySelectorAll('[data-lens]')) {
      if (!el.offsetWidth || !el.offsetHeight) continue;
      const [scale,bezel] = el.dataset.lens.split(',').map(Number);
      const w=Math.round(el.offsetWidth),h=Math.round(el.offsetHeight);
      let radius=parseFloat(getComputedStyle(el).borderTopLeftRadius)||20;
      radius=Math.min(radius,w/2,h/2);
      const geometry=`${w}:${h}:${Math.round(radius)}:${bezel}`;
      if(lensGeometry.get(el)===geometry) continue;
      lensGeometry.set(el,geometry);
      const id=el.dataset.lid || (el.dataset.lid=`uzioLens${++i}`);
      setLens(id,lensMap(w,h,radius,bezel),scale,2.0);
      const filter=`url("#${id}") saturate(1.6) brightness(1.04)`;
      el.style.backdropFilter=filter;
      el.style.webkitBackdropFilter=filter;
    }
    // Moving selector uses a reusable filter, no recomputation per animation frame.
    if(!document.getElementById('uzioPillLens')) {
      setLens('uzioPillLens',lensMap(160,54,27,18),22,1.5);
      const filter='url("#uzioPillLens") saturate(1.7) brightness(1.08)';
      pill.style.backdropFilter=filter;
      pill.style.webkitBackdropFilter=filter;
    }
  }
  // Resize is debounced so dragging the browser window doesn't regenerate maps.
  addEventListener('resize',()=>{
    clearTimeout(lensResizeTimer);
    lensResizeTimer=setTimeout(()=>{mapCache.clear();buildLenses();},280);
  },{passive:true});

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
  let lock = 0, tween = 0;
  const root = document.documentElement;
  const sceneList = [...document.querySelectorAll('.scene')];
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const stopTween = () => { if (tween){ cancelAnimationFrame(tween); tween = 0; root.style.scrollSnapType = ''; } };
  /* Eased glide to a section. Snap is switched off while it runs so the two don't fight. */
  function navigateTo(target){
    const from = scrollY, to = target.offsetTop, dist = to - from;
    go(+target.dataset.tab);
    if (!dist) return;
    sfx.whoosh();
    stopTween();
    if (reduce){ scrollTo({top: to, behavior: 'instant'}); return; }
    const ms = Math.min(1200, 650 + Math.abs(dist) / innerHeight * 170), t0 = performance.now();
    lock = Date.now() + ms + 200;
    root.style.scrollSnapType = 'none';
    const step = now => {
      const p = Math.min((now - t0) / ms, 1);
      scrollTo({top: from + dist * ease(p), behavior: 'instant'});
      if (p < 1) tween = requestAnimationFrame(step);
      else { tween = 0; root.style.scrollSnapType = ''; lock = Date.now() + 100; }
    };
    tween = requestAnimationFrame(step);
  }
  ['wheel', 'touchstart', 'keydown'].forEach(ev => addEventListener(ev, stopTween, {passive: true}));
  const here = () => { let bi = 0, bd = 1e9; sceneList.forEach((s, i) => { const d = Math.abs(s.getBoundingClientRect().top); if (d < bd){ bd = d; bi = i; } }); return bi; };

  /* ---------- Background crossfade ----------
     The five backgrounds are fixed behind the page. As a section rises into view,
     its background fades in over the previous one, and each layer drifts a little
     slower than the content. Position is read straight from scroll, so it also
     runs in reverse when scrolling back up. */
  const bgs = [...document.querySelectorAll('#backdrop .bg')];
  let bgQueued = false;
  function paintBackdrop(){
    bgQueued = false;
    const y = scrollY, vh = innerHeight;
    const op = sceneList.map((s, i) => {
      if (!i) return 1;
      const f = Math.min(1, Math.max(0, (vh * .8 - (s.offsetTop - y)) / (vh * .6)));
      return f * f * (3 - 2 * f);
    });
    bgs.forEach((b, i) => {
      const covered = op[i + 1] >= .999;
      b.style.visibility = op[i] > .001 && !covered ? 'visible' : 'hidden';
      b.style.opacity = op[i].toFixed(3);
      const drift = reduce ? 0 : Math.max(-vh * .08, Math.min(vh * .08, (sceneList[i].offsetTop - y) * .06));
      b.style.transform = `translate3d(0,${drift.toFixed(1)}px,0)`;
    });
  }
  const queueBackdrop = () => { if (!bgQueued){ bgQueued = true; requestAnimationFrame(paintBackdrop); } };
  addEventListener('scroll', queueBackdrop, {passive: true});
  addEventListener('resize', queueBackdrop, {passive: true});
  addEventListener('load', queueBackdrop);
  paintBackdrop();
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
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { go(current, true); buildLenses(); });
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

  /* Pause the landing atmosphere when its section leaves the viewport.
     Uses the browser observer, not a continuous JavaScript loop. */
  const landing = document.getElementById('home');
  if (landing && !reduce) {
    const landingVisibility = new IntersectionObserver(entries => {
      landing.classList.toggle('home-live', entries[0].isIntersecting && !document.hidden);
    }, {threshold: .08});
    landingVisibility.observe(landing);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) landing.classList.remove('home-live');
      else if (landing.getBoundingClientRect().bottom > 0 && landing.getBoundingClientRect().top < innerHeight)
        landing.classList.add('home-live');
    });
  }

  /* ---------- Pointer: parallax ---------- */
  // One update per rendered frame, for the visible scene only.
  // Pause on touch devices, in hidden tabs and with reduced motion.
  if (!reduce && matchMedia('(hover:hover) and (pointer:fine)').matches) {
    const backdrop = document.getElementById('backdrop');
    let pointerFrame = 0, pointerX = 0, pointerY = 0;
    addEventListener('pointermove', e => {
      pointerX = e.clientX / innerWidth - .5;
      pointerY = e.clientY / innerHeight - .5;
      if (pointerFrame || document.hidden) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        backdrop.style.setProperty('--px', pointerX.toFixed(3));
        backdrop.style.setProperty('--py', pointerY.toFixed(3));
      });
    }, {passive:true});
  }

  /* ---------- Demo ---------- */
  const say = {
    lion:  '<b>Leo the Lion:</b> Hi, I\'m Leo. I\'m counting stars tonight. Want to help me?',
    bear:  '<b>Benny the Bear:</b> Hi, I\'m Benny. I found some blackberries down by the creek. Come and see!',
    rabbit:'<b>Rosie the Rabbit:</b> Hi, I\'m Rosie. Can you hop like me? Let\'s do three hops. One, two, three!',
    fox:   '<b>Felix the Fox:</b> Hi, I\'m Felix. Here\'s a riddle for you: what has hands but can\'t clap?'
  };
  const bubble = document.getElementById('bubble');
  document.getElementById('pals').addEventListener('click', e => {
    const b = e.target.closest('.pal'); if (!b) return;
    document.querySelectorAll('.pal').forEach(p => p.classList.toggle('on', p === b));
    bubble.innerHTML = say[b.dataset.k];
    bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
  });
  document.querySelectorAll('.act').forEach((el, i) => {
    el.addEventListener('click', () => sfx.bell(i));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); sfx.bell(i); } });
  });
  document.getElementById('form').addEventListener('submit', e => {
    e.preventDefault();
    sfx.chime();
    document.getElementById('thanks').textContent = 'Thanks, you\'re on the list.';
    e.target.reset();
  });
})();
