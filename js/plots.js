/* Minimal dependency-free canvas plotting (line charts, bar charts, phasor diagrams). */
(function (root) {
  'use strict';
  const PS = (root.PS = root.PS || {});

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function setup(canvas, aspect) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = aspect ? Math.round(w * aspect) : canvas.clientHeight || 240;
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = `12px ${css('--font-ui') || 'system-ui'}`;
    return { ctx, w, h };
  }
  function niceStep(range, target) {
    const raw = range / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }
  const fmtNum = (v) => {
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1000 || a < 0.01) return v.toExponential(0);
    return +v.toFixed(a < 1 ? 2 : a < 10 ? 1 : 0) + '';
  };

  /**
   * opts: { x: array, series: [{ y, color, label }], xlabel, ylabel,
   *         vlines: [{ x, color, label, dash }], spans: [{ x0, x1, color, label }], aspect }
   */
  function line(canvas, opts) {
    const { ctx, w, h } = setup(canvas, opts.aspect || 0.42);
    const m = { l: 52, r: 12, t: 26, b: 34 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    const xs = opts.x;
    const x0 = xs[0], x1 = xs[xs.length - 1];
    let ymin = Infinity, ymax = -Infinity;
    for (const s of opts.series) for (const v of s.y) { if (v < ymin) ymin = v; if (v > ymax) ymax = v; }
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    const pad = (ymax - ymin) * 0.06; ymin -= pad; ymax += pad;
    const X = (v) => m.l + ((v - x0) / (x1 - x0)) * pw;
    const Y = (v) => m.t + (1 - (v - ymin) / (ymax - ymin)) * ph;
    const grid = css('--grid'), axis = css('--muted'), txt = css('--text');
    // spans
    for (const s of opts.spans || []) {
      ctx.fillStyle = s.color;
      ctx.fillRect(X(s.x0), m.t, X(s.x1) - X(s.x0), ph);
      if (s.label) { ctx.fillStyle = axis; ctx.textAlign = 'center'; ctx.fillText(s.label, (X(s.x0) + X(s.x1)) / 2, m.t + ph - 6); }
    }
    // grid + ticks
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = axis;
    const ys = niceStep(ymax - ymin, 5);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = Math.ceil(ymin / ys) * ys; v <= ymax; v += ys) {
      ctx.beginPath(); ctx.moveTo(m.l, Y(v)); ctx.lineTo(m.l + pw, Y(v)); ctx.stroke();
      ctx.fillText(fmtNum(v), m.l - 6, Y(v));
    }
    const xsStep = niceStep(x1 - x0, Math.max(3, Math.floor(pw / 80)));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let v = Math.ceil(x0 / xsStep) * xsStep; v <= x1 + 1e-12; v += xsStep) {
      ctx.beginPath(); ctx.moveTo(X(v), m.t); ctx.lineTo(X(v), m.t + ph); ctx.stroke();
      ctx.fillText(fmtNum(v * (opts.xscale || 1)), X(v), m.t + ph + 6);
    }
    // series
    ctx.lineJoin = 'round';
    for (const s of opts.series) {
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.6;
      ctx.beginPath();
      s.y.forEach((v, i) => (i ? ctx.lineTo(X(xs[i]), Y(v)) : ctx.moveTo(X(xs[i]), Y(v))));
      ctx.stroke();
    }
    // vertical markers
    ctx.textBaseline = 'bottom';
    for (const v of opts.vlines || []) {
      if (v.x == null) continue;
      ctx.strokeStyle = v.color; ctx.lineWidth = 1.5; ctx.setLineDash(v.dash || [5, 4]);
      ctx.beginPath(); ctx.moveTo(X(v.x), m.t); ctx.lineTo(X(v.x), m.t + ph); ctx.stroke();
      ctx.setLineDash([]);
      if (v.label) { ctx.fillStyle = v.color; ctx.textAlign = v.align || 'left'; ctx.fillText(v.label, X(v.x) + (v.align === 'right' ? -4 : 4), m.t + 14); }
    }
    // axes labels + legend
    ctx.fillStyle = axis; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    if (opts.xlabel) ctx.fillText(opts.xlabel, m.l + pw / 2, h - 1);
    if (opts.ylabel) { ctx.save(); ctx.translate(12, m.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(opts.ylabel, 0, 0); ctx.restore(); }
    let lx = m.l + 4;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const s of opts.series) {
      if (!s.label) continue;
      ctx.fillStyle = s.color; ctx.fillRect(lx, 9, 14, 3);
      ctx.fillStyle = txt; ctx.fillText(s.label, lx + 18, 11);
      lx += 26 + ctx.measureText(s.label).width;
    }
  }

  /**
   * Phasor diagram with optional sector wheel.
   * opts: { vectors: [{ z:{re,im}, color, label }], sectors: [{ center, label }], theta, title }
   */
  function phasor(canvas, opts) {
    const { ctx, w, h } = setup(canvas, opts.aspect || 1);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 30;
    const muted = css('--muted');
    ctx.strokeStyle = css('--grid'); ctx.lineWidth = 1;
    for (const f of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, 2 * Math.PI); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    if (opts.sectors) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const s of opts.sectors) {
        const a1 = ((s.center - 30) * Math.PI) / 180;
        ctx.strokeStyle = muted; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.cos(-a1), cy + R * Math.sin(-a1)); ctx.stroke();
        ctx.setLineDash([]);
        const ac = (s.center * Math.PI) / 180;
        ctx.fillStyle = s.active ? css('--accent') : muted;
        ctx.font = `${s.active ? 'bold ' : ''}12px ${css('--font-ui')}`;
        ctx.fillText(s.label, cx + (R + 16) * Math.cos(-ac), cy + (R + 16) * Math.sin(-ac));
      }
      ctx.font = `12px ${css('--font-ui')}`;
    }
    const mx = Math.max(1e-12, ...opts.vectors.map((v) => Math.hypot(v.z.re, v.z.im)));
    for (const v of opts.vectors) {
      const ex = cx + (v.z.re / mx) * R * 0.95, ey = cy - (v.z.im / mx) * R * 0.95;
      ctx.strokeStyle = v.color; ctx.fillStyle = v.color; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
      const a = Math.atan2(ey - cy, ex - cx);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - 9 * Math.cos(a - 0.4), ey - 9 * Math.sin(a - 0.4));
      ctx.lineTo(ex - 9 * Math.cos(a + 0.4), ey - 9 * Math.sin(a + 0.4));
      ctx.closePath(); ctx.fill();
      if (v.label) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(v.label, ex + 14 * Math.cos(a), ey + 14 * Math.sin(a));
      }
    }
  }

  PS.plot = { line, phasor, css };
})(typeof window !== 'undefined' ? window : globalThis);
