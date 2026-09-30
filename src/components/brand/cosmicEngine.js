/* Cosmic atmosphere engine: one canvas, one requestAnimationFrame loop (30fps), no dependencies.
   Colors come from CSS custom properties so light and dark themes share one implementation. */
const TAU = Math.PI * 2;

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Text that sits directly on the page background. Content inside solid surfaces is skipped because
// those surfaces already hide the canvas, which keeps each measurement pass cheap.
const TEXT_SELECTOR = ':is(h1,h2,h3,h4,h5,p,label,li,input,select,textarea,button,a,.status-badge,.page-header,[data-cosmic-text]):not(.card *, table *, .sidebar *, .ai-chat-shell *, [data-cosmic-solid] *)';
const SOLID_SELECTOR = '.card,.sidebar,.topbar,.ai-chat-shell,.ai-chat-widget,table,dialog,[role="dialog"],[data-cosmic-solid]';

export class CosmicEngine {
  constructor(canvas, { root, mode = 'viewport', intensity = 1, seed = 11, dark = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.root = root || document.body;
    this.mode = mode;
    this.intensity = intensity;
    this.seed = seed;
    this.dark = dark;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.running = false;
    this.px = 0; this.py = 0; this.tx = 0; this.ty = 0;
    this.shots = [];
    this.frame = this.frame.bind(this);
    this.lastDraw = 0;
    this.t0 = performance.now();
  }

  readPalette() {
    const cs = getComputedStyle(this.root);
    const v = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
    return {
      far: v('--cosmic-particle-far', '183, 166, 255'),
      primary: v('--cosmic-particle-primary', '86, 56, 216'),
      secondary: v('--cosmic-particle-secondary', '40, 198, 229'),
      spark: v('--cosmic-spark', '255, 201, 60'),
      line: v('--cosmic-line', '86, 56, 216'),
    };
  }

  cell(x, y) {
    if (!this.mask) return 0;
    const i = Math.floor(x / 8), j = Math.floor(y / 8);
    if (i < 0 || j < 0 || i >= this.mw || j >= this.mh) return 0;
    return this.mask[j * this.mw + i];
  }

  measure() {
    const W = this.W, H = this.H;
    this.mw = Math.ceil(W / 8); this.mh = Math.ceil(H / 8);
    this.mask = new Uint8Array(this.mw * this.mh);
    const origin = this.mode === 'container' ? this.canvas.getBoundingClientRect() : { left: 0, top: 0 };
    const scope = this.mode === 'container' ? this.canvas.parentElement : this.root;
    const fill = (selector, value, pad) => {
      scope.querySelectorAll(selector).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom < 0 || r.top > H + origin.top) return;
        const x0 = Math.max(0, Math.floor((r.left - origin.left - pad) / 8));
        const x1 = Math.min(this.mw - 1, Math.floor((r.right - origin.left + pad) / 8));
        const y0 = Math.max(0, Math.floor((r.top - origin.top - pad) / 8));
        const y1 = Math.min(this.mh - 1, Math.floor((r.bottom - origin.top + pad) / 8));
        for (let j = y0; j <= y1; j += 1) {
          for (let i = x0; i <= x1; i += 1) {
            const k = j * this.mw + i;
            if (this.mask[k] < value) this.mask[k] = value;
          }
        }
      });
    };
    fill(TEXT_SELECTOR, 1, 10);
    fill(SOLID_SELECTOR, 2, 0);
  }

  free(x, y, w, h) {
    for (let yy = y; yy < y + h; yy += 8) for (let xx = x; xx < x + w; xx += 8) if (this.cell(xx, yy) !== 0) return false;
    return true;
  }

  resize() {
    const rect = this.mode === 'container' ? this.canvas.parentElement.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    const W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
    this.W = W; this.H = H;
    this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(W * this.dpr);
    this.canvas.height = Math.round(H * this.dpr);
    const tier = W < 640 ? 'mobile' : W < 1024 ? 'tablet' : 'desktop';
    this.tier = tier;
    this.build();
  }

  build() {
    const { W, H } = this;
    this.pal = this.readPalette();
    this.measure();
    const R = rng(this.seed);
    const tierScale = this.tier === 'mobile' ? 0.35 : this.tier === 'tablet' ? 0.6 : 1;
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4 ? 0.7 : 1;
    const area = Math.max(0.2, (W * H) / (1440 * 900));
    const d = this.intensity * tierScale * lowPower * Math.min(area, 1.6);
    const counts = this.dark ? [60, 22, 6] : [32, 12, 3];
    const P = this.pal;
    const place = () => {
      for (let k = 0; k < 14; k += 1) {
        const x = R() * W, y = R() * H;
        if (this.cell(x, y) !== 2) return [x, y];
      }
      return [R() * W, R() * H];
    };
    this.parts = [];
    const add = (layer, n) => {
      for (let i = 0; i < n; i += 1) {
        const [x, y] = place();
        const p = { x, y, layer, ph: R() * TAU, wp: 15 + R() * 25, wa: 3 + R() * (layer === 0 ? 6 : 12), tp: 3 + R() * 5, tw: 0.4 + R() * 0.5 };
        if (layer === 0) Object.assign(p, { r: 0.5 + R() * 0.6, c: P.far, a: this.dark ? 0.14 + R() * 0.28 : 0.16 + R() * 0.18 });
        if (layer === 1) Object.assign(p, { r: 0.9 + R() * 0.8, c: R() < 0.18 ? P.secondary : P.primary, a: this.dark ? 0.22 + R() * 0.28 : 0.08 + R() * 0.12, wp: 18 + R() * 22 });
        if (layer === 2) Object.assign(p, { r: 1.2 + R() * 0.9, c: R() < 0.55 ? P.spark : P.secondary, a: this.dark ? 0.9 : 0.75, star: R() < 0.55, tp: 5 + R() * 4 });
        this.parts.push(p);
      }
    };
    add(0, Math.round(counts[0] * d));
    add(1, Math.round(counts[1] * d));
    add(2, Math.max(1, Math.round(counts[2] * d)));

    const want = this.tier === 'mobile' ? 1 : this.tier === 'tablet' ? 2 : 3;
    const sizes = this.tier === 'mobile' ? [[96, 64], [80, 56]] : [[170, 110], [140, 90], [112, 72], [96, 60]];
    const cands = [];
    for (const [bw, bh] of sizes) {
      for (let y = 8; y < H - bh; y += 24) for (let x = 8; x < W - bw; x += 24) if (this.free(x, y, bw, bh)) cands.push([x, y, bw, bh]);
      if (cands.length > 20) break;
    }
    for (let i = cands.length - 1; i > 0; i -= 1) { const j = Math.floor(R() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    this.clusters = [];
    for (const [x, y, bw, bh] of cands) {
      if (this.clusters.length >= Math.round(want * Math.min(1, this.intensity + 0.2))) break;
      if (this.clusters.some((c) => Math.abs(c.x - x) < 220 && Math.abs(c.y - y) < 160)) continue;
      const n = 3 + Math.floor(R() * 4);
      const nodes = [];
      for (let k = 0; k < n; k += 1) nodes.push([x + 14 + (k / (n - 1)) * (bw - 28) + (R() - 0.5) * 14, y + 14 + R() * (bh - 28)]);
      const edges = [];
      for (let k = 0; k < n - 1; k += 1) edges.push([k, k + 1]);
      if (n > 4) edges.push([1, n - 1]);
      this.clusters.push({ x, y, nodes, edges, hub: Math.floor(R() * n), p1: 20 + R() * 30, p2: 24 + R() * 26, ring: 5 + R() * 3, pulse: 10 + R() * 6, off: R() * 10, rs: nodes.map(() => 1.2 + R() * 1.2) });
    }
    this.orbits = this.tier === 'mobile'
      ? [[W * 0.85, H * 0.12, W * 0.7, 90, -0.1, Math.PI * 1.1, Math.PI * 1.8]]
      : [[W * 0.72, H * 0.28, W * 0.42, H * 0.22, -0.06, Math.PI * 1.04, Math.PI * 1.92], [W * 0.2, H * 1.1, W * 0.55, H * 0.3, 0.08, Math.PI * 1.12, Math.PI * 1.7]];
    this.orbits = this.orbits.map((o) => ({ cx: o[0], cy: o[1], rx: o[2], ry: o[3], rot: o[4], a0: o[5], a1: o[6], p: 35 + R() * 25, ph: R() }));
    this.nextShot = 20 + R() * 25;
    this.draw(12, true);
  }

  setPointer(nx, ny) { this.tx = nx; this.ty = ny; }

  start() {
    if (this.reduced) { this.draw(12, true); return; }
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  frame(now) {
    if (!this.running) return;
    if (now - this.lastDraw >= 32) {
      this.lastDraw = now;
      this.draw((now - this.t0) / 1000, false);
    }
    this.raf = requestAnimationFrame(this.frame);
  }

  dot(X, Y, r, c, a, glow) {
    const x = this.ctx;
    if (glow) {
      const g = x.createRadialGradient(X, Y, 0, X, Y, r * 5);
      g.addColorStop(0, `rgba(${c},${a * 0.4 * glow})`);
      g.addColorStop(1, `rgba(${c},0)`);
      x.fillStyle = g;
      x.fillRect(X - r * 5, Y - r * 5, r * 10, r * 10);
    }
    x.fillStyle = `rgba(${c},${a})`;
    x.beginPath(); x.arc(X, Y, r, 0, TAU); x.fill();
  }

  star(X, Y, s, c, a) {
    const x = this.ctx;
    x.fillStyle = `rgba(${c},${a})`;
    x.beginPath();
    x.moveTo(X, Y - s);
    x.quadraticCurveTo(X, Y, X + s, Y); x.quadraticCurveTo(X, Y, X, Y + s);
    x.quadraticCurveTo(X, Y, X - s, Y); x.quadraticCurveTo(X, Y, X, Y - s);
    x.fill();
  }

  draw(t, still) {
    const x = this.ctx;
    if (!this.parts) return;
    const P = this.pal;
    const glow = this.dark ? 1 : 0.45;
    const lineA = this.dark ? 0.16 : 0.1;
    const nodeA = this.dark ? 0.6 : 0.3;
    const orbitA = this.dark ? 0.2 : 0.12;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.clearRect(0, 0, this.W, this.H);
    if (!still) { this.px += (this.tx - this.px) * 0.06; this.py += (this.ty - this.py) * 0.06; }
    const sway = still ? 0 : Math.sin((TAU * t) / 90) * 0.03;

    for (const o of this.orbits) {
      x.save(); x.translate(o.cx, o.cy); x.rotate(o.rot + sway);
      x.setLineDash([2, 7]); x.lineWidth = 1.2; x.strokeStyle = `rgba(${P.line},${orbitA})`;
      x.beginPath(); x.ellipse(0, 0, o.rx, o.ry, 0, o.a0, o.a1); x.stroke(); x.restore();
      if (!still) {
        const f = (t / o.p + o.ph) % 1, ang = o.a0 + (o.a1 - o.a0) * f, fade = Math.sin(Math.PI * f), rr = o.rot + sway;
        const lx = Math.cos(ang) * o.rx, ly = Math.sin(ang) * o.ry;
        const X = o.cx + lx * Math.cos(rr) - ly * Math.sin(rr), Y = o.cy + lx * Math.sin(rr) + ly * Math.cos(rr);
        if (this.cell(X, Y) === 0) this.dot(X, Y, 2.2, P.secondary, 0.75 * fade, glow);
      }
    }
    x.setLineDash([]);

    const par = [2, 4, 6];
    const parallaxOn = !still && this.tier === 'desktop';
    for (const p of this.parts) {
      const ox = parallaxOn ? -this.px * par[p.layer] : 0, oy = parallaxOn ? -this.py * par[p.layer] : 0;
      const X = p.x + (still ? 0 : Math.sin((TAU * t) / p.wp + p.ph) * p.wa) + ox;
      const Y = p.y + (still ? 0 : Math.cos(((TAU * t) / p.wp) * 0.8 + p.ph) * p.wa * 0.7) + oy;
      const m = this.cell(X, Y);
      if (m === 2) continue;
      let a = p.layer < 2
        ? p.a * (still ? 0.85 : 1 - p.tw * 0.5 + p.tw * 0.5 * Math.sin((TAU * t) / p.tp + p.ph))
        : p.a * (still ? 0.45 : 0.3 + 0.7 * Math.pow(Math.max(0, Math.sin((TAU * t) / p.tp + p.ph)), 6));
      if (m === 1) a *= 0.1;
      if (p.layer === 2) {
        if (m === 0) {
          const g = x.createRadialGradient(X, Y, 0, X, Y, p.r * 7);
          g.addColorStop(0, `rgba(${p.c},${a * 0.35 * glow})`); g.addColorStop(1, `rgba(${p.c},0)`);
          x.fillStyle = g; x.fillRect(X - p.r * 7, Y - p.r * 7, p.r * 14, p.r * 14);
        }
        if (p.star) this.star(X, Y, p.r * 2.6, p.c, a);
        else { x.fillStyle = `rgba(${p.c},${a})`; x.beginPath(); x.arc(X, Y, p.r, 0, TAU); x.fill(); }
      } else {
        x.fillStyle = `rgba(${p.c},${a})`; x.beginPath(); x.arc(X, Y, p.r, 0, TAU); x.fill();
      }
    }

    for (const c of this.clusters) {
      const ox = still ? 0 : Math.sin((TAU * t) / c.p1) * 5 - (parallaxOn ? this.px * 3 : 0);
      const oy = still ? 0 : Math.cos((TAU * t) / c.p2) * 4 - (parallaxOn ? this.py * 3 : 0);
      const N = c.nodes.map((n) => [n[0] + ox, n[1] + oy]);
      x.lineWidth = 0.9; x.strokeStyle = `rgba(${P.line},${lineA})`;
      x.beginPath();
      for (const [a, b] of c.edges) { x.moveTo(N[a][0], N[a][1]); x.lineTo(N[b][0], N[b][1]); }
      x.stroke();
      let lit = -1;
      if (!still) {
        const u = ((t + c.off) % c.pulse) / 2.4;
        if (u < 1) {
          const seg = c.nodes.length - 1, pos = u * seg, k = Math.min(seg - 1, Math.floor(pos)), f = pos - k;
          const X = N[k][0] + (N[k + 1][0] - N[k][0]) * f, Y = N[k][1] + (N[k + 1][1] - N[k][1]) * f;
          lit = Math.round(pos);
          this.dot(X, Y, 1.8, P.secondary, 0.9 * Math.sin(Math.PI * u), glow * 1.4);
        }
      }
      N.forEach((n, i) => {
        const r = i === c.hub ? c.rs[i] + 1.1 : c.rs[i];
        x.fillStyle = `rgba(${P.line},${i === lit ? Math.min(1, nodeA * 1.6) : nodeA})`;
        x.beginPath(); x.arc(n[0], n[1], r, 0, TAU); x.fill();
      });
      if (!still) {
        const h = N[c.hub], ph = (t / c.ring) % 1;
        x.strokeStyle = `rgba(${P.line},${nodeA * 0.55 * (1 - ph)})`; x.lineWidth = 1;
        x.beginPath(); x.arc(h[0], h[1], 3 + ph * 11, 0, TAU); x.stroke();
      }
    }

    if (!still && this.tier !== 'mobile') {
      if (t > this.nextShot) { this.shoot(t); this.nextShot = t + 20 + Math.random() * 25; }
      this.shots = this.shots.filter((s) => {
        const u = (t - s.t0) / 0.9;
        if (u > 1) return false;
        const e = 1 - Math.pow(1 - u, 3), L = 130 * e, hx = s.x + s.dx * L, hy = s.y + s.dy * L, tl = Math.min(48, L), fade = 1 - Math.pow(u, 3);
        if (this.cell(hx, hy) === 0) {
          const g = x.createLinearGradient(hx - s.dx * tl, hy - s.dy * tl, hx, hy);
          g.addColorStop(0, `rgba(${s.c},0)`); g.addColorStop(1, `rgba(${s.c},${0.7 * fade})`);
          x.strokeStyle = g; x.lineWidth = 1.3;
          x.beginPath(); x.moveTo(hx - s.dx * tl, hy - s.dy * tl); x.lineTo(hx, hy); x.stroke();
          this.star(hx, hy, 3.4, s.c, 0.95 * fade);
        }
        return true;
      });
    }
  }

  shoot(t) {
    for (let k = 0; k < 30; k += 1) {
      const x = Math.random() * this.W * 0.8, y = Math.random() * this.H * 0.9 + 20;
      const ang = -0.32 - Math.random() * 0.25, dx = Math.cos(ang), dy = Math.sin(ang);
      if (this.free(x, y - 40, 160, 60) && this.cell(x + dx * 130, y + dy * 130) === 0) {
        this.shots.push({ x, y, dx, dy, t0: t, c: Math.random() < 0.6 ? this.pal.spark : this.pal.secondary });
        return;
      }
    }
  }
}
