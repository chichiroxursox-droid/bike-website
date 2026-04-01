/**
 * POISE Balance Bike — app.js
 * Lenis + GSAP ScrollTrigger + Canvas frame playback
 * ORYZO-inspired: thermal shader, horizontal scroll, engineering labels
 */

/* ============================================================
   CONFIG
   ============================================================ */
const FRAME_COUNT  = 151;
const FRAME_SPEED  = 1.85;   // animation completes at ~54% scroll
const IMAGE_SCALE  = 0.95;   // contain: always fully visible, 5% breathing room
const BG_COLOR     = '#0D1418';
const TOTAL_HEIGHT = '1000vh';

/* ============================================================
   DOM REFS
   ============================================================ */
const loader        = document.getElementById('loader');
const loaderBar     = document.getElementById('loader-bar');
const loaderPercent = document.getElementById('loader-percent');
const canvasWrap    = document.getElementById('canvas-wrap');
const mainCanvas    = document.getElementById('main-canvas');
const thermalCanvas = document.getElementById('thermal-canvas');
const darkOverlay   = document.getElementById('dark-overlay');
const marqueeEl     = document.getElementById('marquee');
const marqueeText   = marqueeEl.querySelector('.marquee-text');
const rainbowBorder = document.getElementById('rainbow-border');
let progressFill     = null; // assigned after DOM ready
const scrollContainer = document.getElementById('scroll-container');
const heroSection   = document.getElementById('hero');
const chapterIndicator = document.getElementById('chapter-indicator');
const chapterNum    = document.getElementById('chapter-num');
const chapterName   = document.getElementById('chapter-name');
const headerLogo    = document.querySelector('.header-logo');
const headerNav     = document.querySelector('.header-nav');

const ctx = mainCanvas.getContext('2d');

/* ============================================================
   RESIZE
   ============================================================ */
let DPR = Math.min(window.devicePixelRatio || 1, 2);
let VW, VH;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW  = window.innerWidth;
  VH  = window.innerHeight;

  mainCanvas.width    = VW * DPR;
  mainCanvas.height   = VH * DPR;
  mainCanvas.style.width  = VW + 'px';
  mainCanvas.style.height = VH + 'px';

  thermalRenderer.resize(VW * DPR, VH * DPR);
  thermalCanvas.style.width  = VW + 'px';
  thermalCanvas.style.height = VH + 'px';

  ctx.scale(DPR, DPR);
  if (currentFrame >= 0) drawFrame(currentFrame);
  ScrollTrigger.refresh();
}

window.addEventListener('resize', resize);

/* ============================================================
   THERMAL RENDERER (declared first, init after DOM ready)
   ============================================================ */
const thermalRenderer = new ThermalRenderer(thermalCanvas, mainCanvas);

/* ============================================================
   FRAME LOADER
   ============================================================ */
const frames = new Array(FRAME_COUNT).fill(null);
let loadedCount  = 0;
let currentFrame = 0;
let bgColor      = BG_COLOR;
let loaderDone   = false;

function pad(n, digits) { return String(n).padStart(digits, '0'); }
function framePath(i)   { return `frames/frame_${pad(i, 4)}.jpg`; }

function loadFrame(index) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload  = () => { frames[index] = img; loadedCount++; resolve(); };
    img.onerror = () => { loadedCount++; resolve(); };
    img.src = framePath(index + 1); // files are 1-indexed
  });
}

async function preloadFrames() {
  // Phase 1: first 15 frames immediately (fast first paint)
  const phase1 = [];
  for (let i = 0; i < Math.min(15, FRAME_COUNT); i++) phase1.push(loadFrame(i));
  await Promise.all(phase1);
  updateLoaderUI();
  drawFrame(0);

  // Phase 2: remaining frames in batches of 20
  const BATCH = 20;
  for (let i = 15; i < FRAME_COUNT; i += BATCH) {
    const batch = [];
    for (let j = i; j < Math.min(i + BATCH, FRAME_COUNT); j++) batch.push(loadFrame(j));
    await Promise.all(batch);
    updateLoaderUI();
  }

  finishLoader();
}

function updateLoaderUI() {
  const pct = Math.round((loadedCount / FRAME_COUNT) * 100);
  loaderBar.style.width     = pct + '%';
  loaderPercent.textContent = pct + '%';
}

function finishLoader() {
  if (loaderDone) return;
  loaderDone = true;
  // Wait briefly so user sees 100%, then hide
  setTimeout(() => {
    loader.classList.add('hidden');
    // Trigger rainbow border on reveal
    setTimeout(() => {
      rainbowBorder.classList.add('active');
      setTimeout(() => rainbowBorder.classList.remove('active'), 3000);
    }, 400);
    headerLogo.classList.add('visible');
    headerNav.classList.add('visible');
    initScrollSystem();
  }, 600);
}

/* ============================================================
   CANVAS DRAW
   ============================================================ */
function sampleBgColor(img) {
  // Sample a corner pixel to get background color
  const offscreen = document.createElement('canvas');
  offscreen.width  = 4;
  offscreen.height = 4;
  const c = offscreen.getContext('2d');
  c.drawImage(img, 0, 0, 4, 4);
  const d = c.getImageData(0, 0, 1, 1).data;
  bgColor = `rgb(${d[0]},${d[1]},${d[2]})`;
}

function drawFrame(index) {
  const img = frames[index];
  ctx.save();
  ctx.scale(1 / DPR, 1 / DPR); // undo DPR scale for raw pixel math
  const cw = mainCanvas.width;
  const ch = mainCanvas.height;

  if (img) sampleBgColor(img);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, cw, ch);

  if (img) {
    const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight) * IMAGE_SCALE;
    const dw = img.naturalWidth  * scale;
    const dh = img.naturalHeight * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  ctx.restore();
}

/* ============================================================
   LENIS
   ============================================================ */
let lenis;

function initLenis() {
  lenis = new Lenis({
    duration: 1.25,
    easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  // Expose globally for debugging / Playwright tests
  window.lenis = lenis;
}

/* ============================================================
   SECTION ANIMATION SYSTEM
   ============================================================ */
function setupSection(section) {
  const enter   = parseFloat(section.dataset.enter) / 100;
  const leave   = parseFloat(section.dataset.leave) / 100;
  const persist = section.dataset.persist === 'true';
  const type    = section.dataset.animation || 'fade-up';
  const mid     = (enter + leave) / 2;
  const height  = parseInt(TOTAL_HEIGHT) / 100; // 10vh

  // Position section absolutely at the midpoint of its range
  section.style.top = (mid * parseInt(TOTAL_HEIGHT)) + 'vh';
  section.style.transform = 'translateY(-50%)';

  const children = Array.from(section.querySelectorAll(
    '.section-label, .section-heading, .section-body, .section-italic,' +
    '.cta-heading, .cta-button, .cta-note, .stat, .thermal-copy .section-label,' +
    '.thermal-copy .section-heading, .thermal-copy .section-body'
  ));

  if (!children.length) return;

  const tl = gsap.timeline({ paused: true });
  const FROM = { opacity: 0 };
  const TO   = { opacity: 1, stagger: 0.12, ease: 'power3.out' };

  switch (type) {
    case 'slide-left':
      tl.fromTo(children,
        { x: -60, opacity: 0 },
        { x: 0, opacity: 1, stagger: 0.12, duration: 0.9, ease: 'power3.out' });
      break;
    case 'slide-right':
      tl.fromTo(children,
        { x: 60, opacity: 0 },
        { x: 0, opacity: 1, stagger: 0.12, duration: 0.9, ease: 'power3.out' });
      break;
    case 'fade-up':
      tl.fromTo(children,
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.12, duration: 0.9, ease: 'power3.out' });
      break;
    case 'scale-up':
      tl.fromTo(children,
        { scale: 0.88, opacity: 0 },
        { scale: 1, opacity: 1, stagger: 0.12, duration: 1.0, ease: 'power2.out' });
      break;
    case 'clip-reveal':
      tl.fromTo(children,
        { clipPath: 'inset(100% 0 0 0)', opacity: 0 },
        { clipPath: 'inset(0% 0 0 0)', opacity: 1, stagger: 0.15, duration: 1.2, ease: 'power4.inOut' });
      break;
    case 'stagger-up':
      tl.fromTo(children,
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.14, duration: 0.85, ease: 'power3.out' });
      break;
  }

  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end:   'bottom bottom',
    scrub: false,
    onUpdate: self => {
      const p = self.progress;
      if (p >= enter && p < leave) {
        if (tl.progress() === 0) tl.play();
      } else if (!persist) {
        if (p < enter && tl.progress() > 0) tl.reverse();
        if (p >= leave && tl.progress() > 0) tl.reverse();
      }
    }
  });
}

/* ============================================================
   HERO TRANSITION (circle-wipe)
   — Triggers on hero section scrolling off screen
   ============================================================ */
function initHeroTransition() {
  // Hero fades as it scrolls off the top
  ScrollTrigger.create({
    trigger: heroSection,
    start: 'top top',
    end:   'bottom top',
    scrub: true,
    onUpdate: self => {
      const p = self.progress;
      heroSection.style.opacity = Math.max(0, 1 - p * 2.5);
      heroSection.style.pointerEvents = p < 0.1 ? 'auto' : 'none';
    }
  });

  // Canvas circle-wipe expands as hero scrolls away
  ScrollTrigger.create({
    trigger: heroSection,
    start: 'top top',
    end:   'bottom top',
    scrub: true,
    onUpdate: self => {
      const wipe = Math.min(1, self.progress * 1.3);
      const r    = wipe * 85;
      canvasWrap.style.clipPath = `circle(${r}% at 50% 50%)`;
    }
  });
}

/* ============================================================
   FRAME SCRUBBING
   ============================================================ */
function initFrameScrub() {
  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end:   'bottom bottom',
    scrub: true,
    onUpdate: self => {
      const accelerated = Math.min(self.progress * FRAME_SPEED, 1);
      const index = Math.min(
        Math.floor(accelerated * FRAME_COUNT),
        FRAME_COUNT - 1
      );
      if (index !== currentFrame) {
        currentFrame = index;
        requestAnimationFrame(() => drawFrame(currentFrame));
      }

      // Update progress spine
      if (progressFill) progressFill.style.height = (self.progress * 100) + '%';
    }
  });
}


/* ============================================================
   THERMAL SHADER TRIGGER (activates hard at 45%)
   ============================================================ */
function initThermalTrigger() {
  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end:   'bottom bottom',
    onUpdate: self => {
      const p = self.progress;
      // ORYZO-style: instantaneous, no fade
      thermalRenderer.toggle(p >= 0.45 && p < 0.62);
    }
  });
}

/* ============================================================
   DARK OVERLAY (stats section)
   ============================================================ */
function initDarkOverlay() {
  // Fades in around 70–74%, holds through 85%, fades out by 90%
  const enterStart = 0.70, enterEnd = 0.74;
  const leaveStart = 0.86, leaveEnd = 0.90;

  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end:   'bottom bottom',
    scrub: true,
    onUpdate: self => {
      const p = self.progress;
      let opacity = 0;
      if (p >= enterStart && p <= enterEnd) {
        opacity = (p - enterStart) / (enterEnd - enterStart) * 0.92;
      } else if (p > enterEnd && p < leaveStart) {
        opacity = 0.92;
      } else if (p >= leaveStart && p <= leaveEnd) {
        opacity = 0.92 * (1 - (p - leaveStart) / (leaveEnd - leaveStart));
      }
      darkOverlay.style.opacity = opacity;
    }
  });
}

/* ============================================================
   MARQUEE
   ============================================================ */
function initMarquee() {
  // Show marquee from 25–70% scroll
  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end:   'bottom bottom',
    onUpdate: self => {
      const p = self.progress;
      marqueeEl.style.opacity = (p >= 0.22 && p <= 0.70)
        ? Math.min(1, (p - 0.22) / 0.04) * Math.min(1, (0.70 - p) / 0.04)
        : 0;
    }
  });

  // Scroll-driven x position
  gsap.to(marqueeText, {
    xPercent: -30,
    ease: 'none',
    scrollTrigger: {
      trigger: scrollContainer,
      start: 'top top',
      end:   'bottom bottom',
      scrub: true,
    }
  });
}

/* ============================================================
   HORIZONTAL SCROLL SECTION
   ============================================================ */
function initHorizontalScroll() {
  const hSection = document.getElementById('section-horizontal');
  const hContainer = hSection.querySelector('.h-container');
  const hTrack  = hSection.querySelector('.h-track');
  const panels  = hSection.querySelectorAll('.h-panel');

  // Position the section at its scroll range (62–72%)
  hSection.style.top = '62%';

  // Reveal panel content on enter
  panels.forEach(panel => {
    const inner = panel.querySelectorAll('.h-panel-inner > *');
    gsap.set(inner, { opacity: 0, y: 30 });
  });

  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end:   'bottom bottom',
    scrub: true,
    onUpdate: self => {
      const p = self.progress;
      if (p >= 0.62 && p <= 0.72) {
        // How far through the horizontal section (0→1)
        const hp = (p - 0.62) / (0.72 - 0.62);
        const totalSlide = hTrack.scrollWidth - window.innerWidth;
        hTrack.style.transform = `translateX(-${hp * totalSlide}px)`;

        // Reveal content in current panel
        const panelIdx = Math.min(
          Math.floor(hp * panels.length),
          panels.length - 1
        );
        panels.forEach((panel, i) => {
          const inner = panel.querySelectorAll('.h-panel-inner > *');
          if (i === panelIdx) {
            gsap.to(inner, {
              opacity: 1, y: 0,
              duration: 0.6,
              stagger: 0.08,
              ease: 'power2.out',
              overwrite: true,
            });
          }
        });
      }
    }
  });
}

/* ============================================================
   STATS COUNTERS
   ============================================================ */
function initCounters() {
  document.querySelectorAll('.stat-number').forEach(el => {
    const target   = parseFloat(el.dataset.value);
    const decimals = parseInt(el.dataset.decimals || '0');
    let counted    = false;

    ScrollTrigger.create({
      trigger: scrollContainer,
      start: 'top top',
      end:   'bottom bottom',
      onUpdate: self => {
        const p = self.progress;
        if (p >= 0.72 && !counted) {
          counted = true;
          gsap.to({ val: 0 }, {
            val: target,
            duration: 1.8,
            ease: 'power1.out',
            onUpdate() {
              el.textContent = this.targets()[0].val.toFixed(decimals);
            },
          });
        } else if (p < 0.68 && counted) {
          counted = false;
          el.textContent = decimals > 0 ? '0.0' : '0';
        }
      }
    });
  });
}

/* ============================================================
   CHAPTER INDICATOR
   ============================================================ */
function initChapterIndicator() {
  const sections = document.querySelectorAll('[data-chapter-num]');

  // Show after hero
  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end:   'bottom bottom',
    onUpdate: self => {
      const p = self.progress;
      // Show indicator after hero (> 8%), hide in CTA (> 90%)
      const visible = p > 0.08 && p < 0.90;
      gsap.to(chapterIndicator, {
        opacity: visible ? 1 : 0,
        duration: 0.4,
        overwrite: true,
      });
    }
  });

  let currentChapter = '';
  function setChapter(num, name) {
    if (currentChapter === num) return;
    currentChapter = num;
    gsap.to([chapterNum, chapterName], {
      opacity: 0, duration: 0.2,
      onComplete() {
        chapterNum.textContent  = num;
        chapterName.textContent = name;
        gsap.to([chapterNum, chapterName], { opacity: 1, duration: 0.3 });
      }
    });
  }

  sections.forEach(section => {
    const num  = section.dataset.chapterNum;
    const name = section.dataset.chapterName;
    const enterPct = parseFloat(section.dataset.enter || 0) / 100;

    ScrollTrigger.create({
      trigger: scrollContainer,
      start: 'top top',
      end:   'bottom bottom',
      onUpdate: self => {
        if (self.progress >= enterPct) setChapter(num, name);
      }
    });
  });
}

/* ============================================================
   PROGRESS SPINE
   ============================================================ */
function initProgressSpine() {
  // Already handled in frame scrub onUpdate
  // Just ensure the element exists
  if (!document.getElementById('progress-spine')) {
    const spine = document.createElement('div');
    spine.id = 'progress-spine';
    const fill = document.createElement('div');
    fill.id = 'progress-fill';
    spine.appendChild(fill);
    document.body.appendChild(spine);
  }
}

/* ============================================================
   CUSTOM CURSOR
   ============================================================ */
function initCursor() {
  let cx = 0, cy = 0;
  window.addEventListener('mousemove', e => {
    cx = e.clientX;
    cy = e.clientY;
    document.body.style.setProperty('--cx', cx + 'px');
    document.body.style.setProperty('--cy', cy + 'px');
  });

  // We'll use a separate div since body::after is tricky to animate
  const dot = document.createElement('div');
  dot.style.cssText = `
    position: fixed; width: 8px; height: 8px;
    border-radius: 50%; background: var(--orange);
    pointer-events: none; z-index: 9999;
    transform: translate(-50%,-50%);
    transition: transform 0.08s ease, background 0.2s;
    mix-blend-mode: normal;
  `;
  document.body.appendChild(dot);

  const ring = document.createElement('div');
  ring.style.cssText = `
    position: fixed; width: 28px; height: 28px;
    border-radius: 50%; border: 1px solid rgba(74,124,136,0.5);
    pointer-events: none; z-index: 9998;
    transform: translate(-50%,-50%);
    transition: transform 0.18s ease, opacity 0.2s;
  `;
  document.body.appendChild(ring);

  let rx = 0, ry = 0;
  function animateCursor() {
    rx += (cx - rx) * 0.12;
    ry += (cy - ry) * 0.12;
    dot.style.left = cx + 'px';
    dot.style.top  = cy + 'px';
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    requestAnimationFrame(animateCursor);
  }
  animateCursor();
}

/* ============================================================
   MAIN INIT
   ============================================================ */
function initScrollSystem() {
  gsap.registerPlugin(ScrollTrigger);

  // Set section positions
  document.querySelectorAll('.scroll-section').forEach(setupSection);

  // Special positioning for horizontal section
  initHorizontalScroll();

  // All scroll-driven systems
  initHeroTransition();
  initFrameScrub();
  initThermalTrigger();
  initDarkOverlay();
  initMarquee();
  initCounters();
  initChapterIndicator();
  initProgressSpine();

  ScrollTrigger.refresh();
}

/* ============================================================
   BOOT
   ============================================================ */
window.addEventListener('DOMContentLoaded', () => {
  // Initial resize (sets canvas dimensions before lenis/gsap)
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW  = window.innerWidth;
  VH  = window.innerHeight;

  mainCanvas.width  = VW * DPR;
  mainCanvas.height = VH * DPR;
  mainCanvas.style.width  = VW + 'px';
  mainCanvas.style.height = VH + 'px';
  ctx.scale(DPR, DPR);

  thermalRenderer.resize(VW * DPR, VH * DPR);
  thermalCanvas.style.width  = VW + 'px';
  thermalCanvas.style.height = VH + 'px';

  progressFill = document.getElementById('progress-fill');

  initLenis();
  initCursor();
  preloadFrames();

  window.addEventListener('resize', resize);
});
