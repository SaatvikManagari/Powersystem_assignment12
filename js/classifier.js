/* Superimposed sequence-component fault classifier (SSC classifier).
 *
 *  1. Detection   : sample-delta  d[k] = |i[k] - i[k-N]|  (one-cycle superimposed current)
 *  2. Filtering   : mimic (DC-offset) filter + full-cycle DFT → pre-fault & fault phasors
 *  3. Superimposed: ΔI_abc = I_fault - I_pre  (pure-fault network quantities)
 *  4. Sequence    : [ΔI0 ΔI1 ΔI2] = T^-1 ΔI_abc ,  I0 from the fault-window phasors
 *  5. Decision    : ground flag  r0 = |ΔI0|/|ΔI1| > max(k0, kn·noise/|ΔI1|)
 *                   balance flag r2 = |ΔI2|/|ΔI1| < k2  → three-phase
 *                   phase selection from θ = ∠(ΔI2/ΔI1) – six 60° sectors
 */
(function (root) {
  'use strict';
  const PS = (root.PS = root.PS || {});
  const X = PS.cx;
  const { C, abs, arg, div, sub, deg, wrapDeg } = X;

  // ideal θ = ∠(I_a2 / I_a1) at the fault for each type (derived from the boundary conditions)
  const SECTORS_GROUND = { AG: 0, ABG: 60, BG: 120, BCG: 180, CG: -120, CAG: -60 };
  const SECTORS_LL = { AB: 60, BC: 180, CA: -60 };

  // k0  : minimum |ΔI0|/|ΔI1| for a ground fault
  // kn  : |ΔI0| must also exceed kn × (estimated noise level of the ΔI0 phasor)
  // k2  : |ΔI2|/|ΔI1| below this → balanced three-phase fault
  const DEFAULTS = { k0: 0.01, kn: 4, k2: 0.2, xr: null, detectFactor: 5, detectRel: 0.05, confirm: 4 };

  function mimic(x, tauS) {
    if (!tauS || tauS <= 0) return Float64Array.from(x);
    const y = new Float64Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = (1 + tauS) * x[i] - tauS * (i ? x[i - 1] : x[0]);
    return y;
  }
  function mimicGain(tauS, N) {
    if (!tauS || tauS <= 0) return C(1);
    const w = (2 * Math.PI) / N;
    // H(e^jw) = (1+τ) - τ e^{-jw}
    return C(1 + tauS - tauS * Math.cos(w), tauS * Math.sin(w));
  }
  /** Full-cycle DFT phasor (rms) of x over [s, s+N), referenced to t = 0. */
  function dft(x, s, N) {
    let re = 0, im = 0;
    for (let k = 0; k < N; k++) {
      const a = (2 * Math.PI * (s + k)) / N;
      re += x[s + k] * Math.cos(a);
      im -= x[s + k] * Math.sin(a);
    }
    return C((Math.SQRT2 / N) * re, (Math.SQRT2 / N) * im);
  }

  /** Returns first sample index where a fault is detected, or -1. */
  function detect(chans, N, cfg) {
    const n = chans[0].length;
    if (n < 3 * N) return { index: -1, thr: NaN };
    // baseline (assumed fault-free) : samples [N, 2N)
    // threshold = detectFactor × (largest per-channel rms of the baseline delta signal),
    // floored at detectRel × pre-fault peak so a noiseless record is not over-sensitive
    let drms = 0, peak = 0;
    for (const x of chans) {
      let ss = 0;
      for (let k = N; k < 2 * N; k++) { const d = x[k] - x[k - N]; ss += d * d; }
      drms = Math.max(drms, Math.sqrt(ss / N));
      for (let k = 0; k < 2 * N; k++) peak = Math.max(peak, Math.abs(x[k]));
    }
    const thr = Math.max(cfg.detectFactor * drms, cfg.detectRel * peak, 1e-9);
    for (let k = 2 * N; k < n; k++) {
      let hits = 0;
      for (let j = 0; j < cfg.confirm && k + j < n; j++) {
        if (chans.some((x) => Math.abs(x[k + j] - x[k + j - N]) > thr)) hits++;
      }
      if (hits === cfg.confirm) return { index: k, thr };
    }
    return { index: -1, thr };
  }

  function nearest(theta, table) {
    let best = null, bestD = 1e9;
    for (const [k, v] of Object.entries(table)) {
      const d = Math.abs(wrapDeg(theta - v));
      if (d < bestD) { bestD = d; best = k; }
    }
    return { label: best, margin: 30 - bestD };
  }

  /**
   * Classify three phase-current records.
   * rec: { ia, ib, ic, fs, f }   (any consistent units)
   * opts: { k0, k2, xr (X/R for mimic filter; null → none), ... }
   */
  function classify(rec, opts = {}) {
    const cfg = { ...DEFAULTS, ...opts };
    const N = Math.round(rec.fs / rec.f);
    const w = 2 * Math.PI * rec.f;
    const tauS = cfg.xr ? (cfg.xr / w) * rec.fs : 0;
    const raw = [rec.ia, rec.ib, rec.ic];
    const det = detect(raw, N, cfg);
    const out = { N, detIndex: det.index, detThr: det.thr, detTime: det.index >= 0 ? det.index / rec.fs : null };
    if (det.index < 0) {
      return { ...out, label: 'NF', reason: 'No superimposed current above threshold → no fault.' };
    }
    const preS = det.index - N - Math.round(N / 4);
    let postS = det.index + 2;
    if (postS + N > raw[0].length) postS = raw[0].length - N;
    if (preS < 1) return { ...out, label: 'NF', reason: 'Not enough pre-fault data.' };
    const g = mimicGain(tauS, N);
    const filt = raw.map((x) => mimic(x, tauS));
    const ph = (x, s) => div(dft(x, s, N), g);
    const Ipre = filt.map((x) => ph(x, preS));
    const Ipost = filt.map((x) => ph(x, postS));
    const dI = [0, 1, 2].map((k) => sub(Ipost[k], Ipre[k]));
    const dS = X.toSeq(dI); // [ΔI0, ΔI1, ΔI2]
    const postSeq = X.toSeq(Ipost);
    const m1 = abs(dS[1]) || 1e-12;
    const r0 = abs(dS[0]) / m1;
    const r2 = abs(dS[2]) / m1;
    const theta = deg(arg(div(dS[2], dS[1])));
    // noise floor of the superimposed zero-sequence phasor, estimated from the
    // one-cycle difference of the (filtered) residual signal (ia+ib+ic)/3 before the fault
    let ss = 0, cnt = 0;
    const s0 = (k) => (filt[0][k] + filt[1][k] + filt[2][k]) / 3;
    for (let k = Math.max(N, preS - N); k < preS + N; k++) { const d = s0(k) - s0(k - N); ss += d * d; cnt++; }
    const sigma0 = Math.sqrt(ss / Math.max(cnt, 1) / 2);
    const noise0 = (2 * sigma0 * Math.sqrt(2 / N)) / abs(g); // rms of |ΔI0| due to noise (post − pre)
    const r0min = Math.max(cfg.k0, (cfg.kn * noise0) / m1);
    const ground = r0 > r0min;
    let label, reason, margin = null;
    if (r2 < cfg.k2) {
      label = 'ABC';
      reason = `|ΔI2|/|ΔI1| = ${r2.toFixed(3)} < ${cfg.k2} → balanced (three-phase) fault.`;
    } else if (ground) {
      const n = nearest(theta, SECTORS_GROUND);
      label = n.label; margin = n.margin;
      reason = `|ΔI0|/|ΔI1| = ${r0.toFixed(3)} > ${r0min.toFixed(3)} → ground involved; θ = ${theta.toFixed(1)}° lies in the ${label} sector (centre ${SECTORS_GROUND[label]}°).`;
    } else {
      const n = nearest(theta, SECTORS_LL);
      label = n.label; margin = n.margin;
      reason = `|ΔI0|/|ΔI1| = ${r0.toFixed(3)} ≤ ${r0min.toFixed(3)} → no ground; θ = ${theta.toFixed(1)}° lies in the ${label} sector (centre ${SECTORS_LL[label]}°).`;
    }
    return {
      ...out, label, reason, margin, ground, r0, r0min, r2, theta,
      preS, postS, Ipre, Ipost, dI, dS, postSeq,
      decisionTime: (postS + N) / rec.fs,
    };
  }

  PS.clf = { classify, detect, dft, mimic, SECTORS_GROUND, SECTORS_LL, DEFAULTS };
})(typeof window !== 'undefined' ? window : globalThis);
