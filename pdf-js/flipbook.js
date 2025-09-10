(function(){
  const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.10.111/pdf.worker.min.js';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.10.111/pdf.min.js';

  function dpr() { return Math.max(1, Math.min(2.5, window.devicePixelRatio || 1)); }

  function create(base) {
    const root = document.createElement('div');
    root.className = 'flipbook';
    root.innerHTML = '<div class="flipbook-stage"><div class="flipbook-wrapper"><div class="flipbook-book"><div class="flipbook-spread"><div class="flipbook-page left"><canvas></canvas></div><div class="flipbook-page right"><canvas></canvas></div></div><div class="flipbook-turn hidden"><div class="flipbook-turn-shadow"></div><canvas></canvas></div><button class="flipbook-nav left" aria-label="Previous"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="flipbook-nav right" aria-label="Next"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="flipbook-fullscreen" aria-label="Toggle Fullscreen">⤢</button><div class="flipbook-toolbar"><button class="flipbook-tool prev" aria-label="Previous"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="flipbook-page-indicator"></div><button class="flipbook-tool next" aria-label="Next"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div><button class="flipbook-toolbar-hint" aria-label="Show controls"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></div></div>';
    base.appendChild(root);
    return {
      root,
      wrapper: root.querySelector('.flipbook-wrapper'),
      book: root.querySelector('.flipbook-book'),
      spread: root.querySelector('.flipbook-spread'),
      leftCanvas: root.querySelector('.flipbook-page.left canvas'),
      rightCanvas: root.querySelector('.flipbook-page.right canvas'),
      turn: root.querySelector('.flipbook-turn'),
      turnShadow: root.querySelector('.flipbook-turn-shadow'),
      turnCanvas: root.querySelector('.flipbook-turn canvas'),
      navLeft: root.querySelector('.flipbook-nav.left'),
      navRight: root.querySelector('.flipbook-nav.right'),
      fsBtn: root.querySelector('.flipbook-fullscreen'),
      toolbar: root.querySelector('.flipbook-toolbar'),
      toolPrev: root.querySelector('.flipbook-tool.prev'),
      toolNext: root.querySelector('.flipbook-tool.next'),
      pageIndicator: root.querySelector('.flipbook-page-indicator'),
      toolbarHint: root.querySelector('.flipbook-toolbar-hint')
    };
  }

  function getPerPageClientSize(wrapper, isDouble){
    const r = wrapper.getBoundingClientRect();
    return { width: isDouble ? r.width/2 : r.width, height: r.height };
  }

  function fitScaleForPage(page, clientWidth, zoom){
    const unscaled = page.getViewport({ scale: 1 });
    return (clientWidth / unscaled.width) * zoom;
  }

  function setCoverState(els, isCover){
    els.spread.classList.toggle('flipbook-cover', isCover);
    els.wrapper.classList.toggle('cover', isCover);
  }

  function setupPdf(cb){
    function ready(){
      if (!window.pdfjsLib) return false;
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER;
      return true;
    }
    if (window.pdfjsLib) return cb();
    const s = document.createElement('script');
    s.src = PDFJS; s.onload = cb; document.head.appendChild(s);
  }

  function Flipbook(container, opts){
    this.els = create(container);
    this.zoom = 1; this.breakpoint = (opts && typeof opts.breakpoint === 'number') ? opts.breakpoint : 900;
    const hasSingleOpt = !!(opts && Object.prototype.hasOwnProperty.call(opts, 'single'));
    this.singleOverride = hasSingleOpt;
    this.single = hasSingleOpt ? !!opts.single : (window.innerWidth < this.breakpoint);
    this.isDouble = !this.single; this.currentRight = 1;
    this.pdf = null; this.total = 0; this.cache = new Map(); this.animating = false;
    this.iosFsActive = false; this.scrollYBeforeFs = 0;
    this.url = opts && opts.pdfUrl;
    setupPdf(() => this.load());
    this.els.navLeft.addEventListener('click', () => this.prev());
    this.els.navRight.addEventListener('click', () => this.next());
    if (this.els.toolPrev) this.els.toolPrev.addEventListener('click', () => this.prev());
    if (this.els.toolNext) this.els.toolNext.addEventListener('click', () => this.next());
    this.els.spread.addEventListener('click', (e) => {
      const r = this.els.spread.getBoundingClientRect();
      const x = e.clientX - r.left;
      if (x < r.width / 2) this.prev(); else this.next();
    });
    this.els.spread.addEventListener('touchstart', (e) => { if (e.touches.length!==1) return; const t = e.touches[0]; this._tsx = t.clientX; this._tsy = t.clientY; });
    this.els.spread.addEventListener('touchend', (e) => { if (this._tsx==null) return; const t = e.changedTouches[0]; const dx = t.clientX - this._tsx; const dy = t.clientY - this._tsy; const ax = Math.abs(dx), ay = Math.abs(dy); this._tsx = null; this._tsy = null; if (ax > 40 && ax > ay) { if (dx < 0) this.next(); else this.prev(); } });
    if (this.els.fsBtn) {
      this._fsClickGuard = false;
      this.els.fsBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this._fsClickGuard = true; this.toggleFullscreen(); setTimeout(() => { this._fsClickGuard = false; }, 300); });
      this.els.fsBtn.addEventListener('click', (e) => { if (this._fsClickGuard) { e.stopPropagation(); e.preventDefault(); return; } this.toggleFullscreen(); });
    }
    document.addEventListener('fullscreenchange', () => this.render());
    document.addEventListener('webkitfullscreenchange', () => this.render());
    window.addEventListener('resize', () => {
      if (!this.singleOverride) this.applyResponsiveSingle();
      this.updateVh();
      this.render();
    });
    window.addEventListener('orientationchange', () => { this.updateVh(); this.render(); });
    this.initToolbar();
  }

  Flipbook.prototype.load = async function(){
    if (!this.url) return;
    const buf = await (await fetch(this.url)).arrayBuffer();
    const task = pdfjsLib.getDocument({ data: buf });
    this.pdf = await task.promise; this.total = this.pdf.numPages;
    this.currentRight = 1; this.updateLayout(); await this.render();
  };

  Flipbook.prototype.updateLayout = function(){
    setCoverState(this.els, !this.single && this.currentRight === 1);
    this.els.spread.classList.toggle('flipbook-single', this.single);
    this.els.wrapper.classList.toggle('single', this.single);
    this.updateNav();
  };

  Flipbook.prototype.updateNav = function(){
    const canPrev = this.currentRight > 1;
    const canNext = this.currentRight < this.total;
    this.els.navLeft.disabled = !canPrev;
    this.els.navRight.disabled = !canNext;
  };

  Flipbook.prototype.cacheKey = function(pageNum, w, h){
    const r = dpr(); return pageNum+':'+Math.floor(w*r)+'x'+Math.floor(h*r)+'@z'+this.zoom.toFixed(2);
  };

  Flipbook.prototype.getOrRenderOff = async function(pageNum, cssW, cssH){
    const k = this.cacheKey(pageNum, cssW, cssH); const hit = this.cache.get(k); if (hit) return hit;
    const page = await this.pdf.getPage(pageNum);
    const scale = fitScaleForPage(page, cssW, this.zoom);
    const viewport = page.getViewport({ scale }); const r = dpr();
    const c = document.createElement('canvas'); c.width = Math.floor(viewport.width*r); c.height = Math.floor(viewport.height*r);
    const ctx = c.getContext('2d'); ctx.setTransform(r,0,0,r,0,0);
    await page.render({ canvasContext: ctx, viewport }).promise.catch(()=>{});
    this.cache.set(k, c); return c;
  };

  Flipbook.prototype.renderPageTo = async function(pageNum, canvas){
    if (!pageNum){ const ctx = canvas.getContext('2d'); canvas.width=10; canvas.height=10; ctx.clearRect(0,0,10,10); return; }
    const {width, height} = getPerPageClientSize(this.els.wrapper, this.isDouble);
    const off = await this.getOrRenderOff(pageNum, width, height);
    canvas.width = off.width; canvas.height = off.height; canvas.style.width='100%'; canvas.style.height='100%';
    const ctx = canvas.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(off,0,0);
  };

  Flipbook.prototype.render = async function(){
    if (!this.pdf) return;
    const right = this.currentRight; const left = (this.isDouble && right>1)? right-1 : null;
    await Promise.all([ this.renderPageTo(left, this.els.leftCanvas), this.renderPageTo(right, this.els.rightCanvas) ]);
    this.updateLayout();
    if (this.els.pageIndicator) { this.els.pageIndicator.textContent = this.currentRight + '/' + this.total; }
  };

  Flipbook.prototype.next = async function(){ if (this.animating) return; const t = this.isDouble? (this.currentRight===1?Math.min(3,this.total):Math.min(this.total,this.currentRight+2)) : Math.min(this.total,this.currentRight+1); if (t===this.currentRight) return; this.currentRight=t; await this.render(); };
  Flipbook.prototype.prev = async function(){ if (this.animating) return; const t = this.isDouble? (this.currentRight<=3?1:Math.max(1,this.currentRight-2)) : Math.max(1,this.currentRight-1); if (t===this.currentRight) return; this.currentRight=t; await this.render(); };

  Flipbook.prototype.applyResponsiveSingle = function(){ const desired = window.innerWidth < this.breakpoint; if (this.single !== desired) { this.single = desired; this.isDouble = !this.single; return true; } return false; };
  Flipbook.prototype.singleMode = async function(mode){ if (typeof mode === 'boolean') { this.singleOverride = true; if (this.single !== mode) { this.single = mode; this.isDouble = !this.single; } } else { this.singleOverride = false; this.applyResponsiveSingle(); } await this.render(); };
  Flipbook.prototype.setSingle = async function(single){ await this.singleMode(single); };
  Flipbook.prototype.toggleSingle = async function(){ await this.singleMode(!this.single); };
  Flipbook.prototype.updateVh = function(){ if (this.iosFsActive) { const h = window.innerHeight; this.els.root.style.setProperty('--fb-vh', h + 'px'); } else { this.els.root.style.removeProperty('--fb-vh'); } };
  Flipbook.prototype.enterFallbackFullscreen = function(){ if (this.iosFsActive) return; this.scrollYBeforeFs = window.scrollY || window.pageYOffset || 0; document.documentElement.classList.add('ios-fs-lock'); document.body.classList.add('ios-fs-lock'); this.els.root.classList.add('ios-fs'); this.iosFsActive = true; this.updateVh(); this.render(); };
  Flipbook.prototype.exitFallbackFullscreen = function(){ if (!this.iosFsActive) return; this.els.root.classList.remove('ios-fs'); document.documentElement.classList.remove('ios-fs-lock'); document.body.classList.remove('ios-fs-lock'); this.iosFsActive = false; this.updateVh(); window.scrollTo(0, this.scrollYBeforeFs || 0); this.render(); };
  Flipbook.prototype.isFullscreen = function(){ return !!(document.fullscreenElement || document.webkitFullscreenElement || this.iosFsActive); };
  Flipbook.prototype.enterFullscreen = function(){ const el = this.els.root; if (document.fullscreenElement || document.webkitFullscreenElement) return; let ret; if (el.requestFullscreen) { ret = el.requestFullscreen(); } else if (el.webkitRequestFullscreen) { ret = el.webkitRequestFullscreen(); } if (ret && typeof ret.then === 'function') { ret.catch(() => this.enterFallbackFullscreen()); } else { if (!document.fullscreenElement && !document.webkitFullscreenElement) this.enterFallbackFullscreen(); } };
  Flipbook.prototype.exitFullscreen = function(){ if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen(); } else if (document.webkitFullscreenElement) { if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } else if (this.iosFsActive) { this.exitFallbackFullscreen(); } };
  Flipbook.prototype.toggleFullscreen = function(){ if (this.isFullscreen()) this.exitFullscreen(); else this.enterFullscreen(); };
  Flipbook.prototype.initToolbar = function(){ if (!this.els.toolbar) return; this.els.toolbar.classList.add('hidden'); if (this.els.toolbarHint) { this.els.toolbarHint.classList.remove('hidden'); this.els.toolbarHint.addEventListener('click', () => this.showToolbar()); }
    const isCoarse = () => (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const showIfAppropriate = (e) => { if (!isCoarse()) return; const t = e && e.target; if (t && (t.closest && (t.closest('.flipbook-fullscreen') || t.closest('.flipbook-toolbar') || t.closest('.flipbook-toolbar-hint')))) return; this.showToolbar(); };
    this.els.root.addEventListener('touchstart', showIfAppropriate, { passive: true });
    this.els.root.addEventListener('pointerdown', showIfAppropriate);
    this.els.root.addEventListener('mousemove', showIfAppropriate);
  };
  Flipbook.prototype.showToolbar = function(){ if (!this.els.toolbar) return; this.els.toolbar.classList.remove('hidden'); if (this.els.toolbarHint) this.els.toolbarHint.classList.add('hidden'); if (this._tbTo) clearTimeout(this._tbTo); this._tbTo = setTimeout(() => { this.hideToolbar(); }, 2200); };
  Flipbook.prototype.hideToolbar = function(){ if (!this.els.toolbar) return; this.els.toolbar.classList.add('hidden'); if (this.els.toolbarHint) this.els.toolbarHint.classList.remove('hidden'); };

  window.Flipbook = {
    mount: function(opts){
      const container = (typeof opts.target === 'string') ? document.querySelector(opts.target) : opts.target;
      if (!container) throw new Error('Flipbook: target not found');
      return new Flipbook(container, { pdfUrl: opts.pdfUrl, single: opts.single, breakpoint: opts.breakpoint });
    }
  };
})();

