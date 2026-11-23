/* Fault simulator for the two-source test system used in the EE 315 notes:
 *
 *   G1 ─ bus1 ─ T1 (YNyn) ─ bus2 ─[R]── line (x | 1-x) ──── bus3 ─ T2 (YNd) ─ bus4 ─ G2
 *                                  relay        F
 *
 * Steady-state phasors are obtained from the sequence networks (positive, negative,
 * zero) with the Thevenin / pure-fault (superposition) method. A general phase-domain
 * fault admittance matrix Yf is used, so every shunt fault type with fault resistance
 * Rf is handled by one formula:  (I + Zth_abc · Yf) V_F = V_F,pre.
 * Instantaneous waveforms are then synthesised with the decaying DC offset
 * i = i_s + i_t,  i_t = -[i_s(t0) - i_pre(t0)] e^{-(R/L)(t - t0)}.
 */
(function (root) {
  'use strict';
  const PS = (root.PS = root.PS || {});
  const X = PS.cx;
  const { C, add, sub, mul, div, scale, par, polar, rad, abs, arg } = X;

  const FAULT_TYPES = ['NF', 'AG', 'BG', 'CG', 'AB', 'BC', 'CA', 'ABG', 'BCG', 'CAG', 'ABC'];
  const FAULT_NAMES = {
    NF: 'No fault', AG: 'A–G', BG: 'B–G', CG: 'C–G', AB: 'A–B', BC: 'B–C', CA: 'C–A',
    ABG: 'A–B–G', BCG: 'B–C–G', CAG: 'C–A–G', ABC: 'A–B–C (3φ)',
  };
  const FAULT_FAMILY = {
    NF: 'None', AG: 'LG', BG: 'LG', CG: 'LG', AB: 'LL', BC: 'LL', CA: 'LL',
    ABG: 'LLG', BCG: 'LLG', CAG: 'LLG', ABC: 'LLL',
  };

  function defaultParams() {
    return {
      f: 50,               // Hz
      kV: 220,             // line-to-line base / nominal voltage
      MVA: 100,            // base MVA
      lengthKm: 150,
      z1: [0.03, 0.33],    // ohm / km, positive (= negative) sequence
      z0: [0.25, 1.10],    // ohm / km, zero sequence (Z0L > Z1L)
      G1: { z1: [0.004, 0.15], z2: [0.004, 0.14], z0: [0.002, 0.05], zn: [0, 0] }, // pu
      G2: { z1: [0.004, 0.20], z2: [0.004, 0.18], z0: [0.002, 0.06], zn: [0, 0] }, // pu
      T1: { z: [0.002, 0.08] }, // YNyn: zero seq passes through
      T2: { z: [0.002, 0.08] }, // YNd: zero seq shunted to reference on the star side
      E1: 1.05,            // pu
      E2: 1.0,             // pu
      Nc: 64,              // samples per cycle
      cycles: 6,
    };
  }

  const cz = (p) => C(p[0], p[1]);

  /** Sequence impedances of the network split at fault point x (0..1 from bus 2). */
  function network(p, x) {
    const Zb = (p.kV * p.kV) / p.MVA;
    const ZL1 = scale(cz(p.z1), p.lengthKm / Zb);
    const ZL0 = scale(cz(p.z0), p.lengthKm / Zb);
    const T1 = cz(p.T1.z), T2 = cz(p.T2.z);
    const g1 = p.G1, g2 = p.G2;
    // impedances behind the relay bus (bus 2) – sequence 0,1,2
    const Zsrc = [
      add(add(cz(g1.z0), scale(cz(g1.zn), 3)), T1),
      add(cz(g1.z1), T1),
      add(cz(g1.z2), T1),
    ];
    const ZL = [ZL0, ZL1, ZL1];
    const left = [0, 1, 2].map((s) => add(Zsrc[s], scale(ZL[s], x)));
    const right = [
      add(scale(ZL0, 1 - x), T2), // G2 isolated in zero sequence by the delta winding
      add(add(scale(ZL1, 1 - x), T2), cz(g2.z1)),
      add(add(scale(ZL1, 1 - x), T2), cz(g2.z2)),
    ];
    const Zth = [0, 1, 2].map((s) => par(left[s], right[s]));
    return { Zb, ZL0, ZL1, Zsrc, left, right, Zth };
  }

  /** Phase-domain fault admittance matrix (pu) for a fault type and fault resistance Rf (pu). */
  function faultAdmittance(type, Rf) {
    const R = Math.max(Rf, 1e-6);
    const g = 1 / R;
    const gs = 1e6; // "solid" connection used inside LLG faults
    const Y = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const idx = { A: 0, B: 1, C: 2 };
    const ph = type.replace('G', '').split('').map((c) => idx[c]);
    const grounded = type.endsWith('G') && type !== 'NF';
    if (type === 'NF') return Y.map((r) => r.map(() => C(0)));
    if (grounded && ph.length === 1) {
      Y[ph[0]][ph[0]] = g;
    } else if (!grounded && ph.length === 2) {
      const [i, j] = ph;
      Y[i][i] += g; Y[j][j] += g; Y[i][j] -= g; Y[j][i] -= g;
    } else if (grounded && ph.length === 2) {
      // phases joined to a node n (solid), n to ground via Rf; Kron-reduce node n
      const [i, j] = ph;
      const Ynn = 2 * gs + g;
      Y[i][i] += gs; Y[j][j] += gs;
      for (const a of [i, j]) for (const b of [i, j]) Y[a][b] -= (gs * gs) / Ynn;
    } else if (ph.length === 3) {
      // each phase through Rf to a common (ungrounded) star point
      const Ynn = 3 * g;
      for (let a = 0; a < 3; a++) {
        Y[a][a] += g;
        for (let b = 0; b < 3; b++) Y[a][b] -= (g * g) / Ynn;
      }
    }
    return Y.map((r) => r.map((v) => C(v)));
  }

  /**
   * Steady-state solution.
   * opts: { type, x (0..1), RfOhm, deltaDeg (load angle of E1 w.r.t. E2) }
   * Returns sequence & phase phasors (pu, rms) at the fault and at the relay (bus 2).
   */
  function solvePhasors(p, opts) {
    const net = network(p, opts.x);
    const E1 = polar(p.E1, rad(opts.deltaDeg || 0));
    const E2 = C(p.E2, 0);
    // prefault (positive sequence only)
    const Ipre = div(sub(E1, E2), add(net.left[1], net.right[1]));
    const VFpre = sub(E1, mul(Ipre, net.left[1]));
    const V2pre = sub(E1, mul(Ipre, net.Zsrc[1]));
    const Rf = (opts.RfOhm || 0) / net.Zb;

    let If012 = [C(0), C(0), C(0)];
    let VF012 = [C(0), VFpre, C(0)];
    if (opts.type !== 'NF') {
      const Zabc = X.matMul(X.matMul(X.T, X.diag(net.Zth)), X.Tinv);
      const Yf = faultAdmittance(opts.type, Rf);
      const ZY = X.matMul(Zabc, Yf);
      const M = ZY.map((row, i) => row.map((v, j) => (i === j ? add(v, X.ONE) : v)));
      const VpreAbc = X.toPhase([C(0), VFpre, C(0)]);
      const VFabc = X.solve(M, VpreAbc);
      const IfAbc = X.matVec(Yf, VFabc);
      If012 = X.toSeq(IfAbc);
      VF012 = X.toSeq(VFabc);
    }
    // pure-fault network: current If drawn from F, shared by both sides
    const dIleft = [0, 1, 2].map((s) => mul(If012[s], div(net.right[s], add(net.left[s], net.right[s]))));
    const Irel012 = [dIleft[0], add(Ipre, dIleft[1]), dIleft[2]];
    const Vrel012 = [0, 1, 2].map((s) => sub(s === 1 ? V2pre : C(0), mul(net.Zsrc[s], dIleft[s])));
    return {
      net, E1, E2, Ipre, VFpre, V2pre, Rf,
      If012, IfAbc: X.toPhase(If012), VF012, VFabc: X.toPhase(VF012),
      IrelPre: X.toPhase([C(0), Ipre, C(0)]),
      VrelPre: X.toPhase([C(0), V2pre, C(0)]),
      Irel012, Vrel012,
      IrelPost: X.toPhase(Irel012),
      VrelPost: X.toPhase(Vrel012),
    };
  }

  // ---------- random numbers (seedable, for reproducible studies) ----------
  function rng(seed) {
    let s = seed >>> 0 || 1;
    const next = () => {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
    let spare = null;
    next.gauss = () => {
      if (spare !== null) { const v = spare; spare = null; return v; }
      let u, v, r;
      do { u = 2 * next() - 1; v = 2 * next() - 1; r = u * u + v * v; } while (r === 0 || r >= 1);
      const m = Math.sqrt((-2 * Math.log(r)) / r);
      spare = v * m;
      return u * m;
    };
    return next;
  }

  /**
   * Full case: phasor solution + sampled waveforms at the relay (bus 2).
   * opts: { type, x, RfOhm, deltaDeg, incDeg, snrDb (Infinity = noiseless), seed }
   * Waveforms in kA (currents) and kV (phase-to-ground voltages).
   */
  function simulate(p, opts) {
    const sol = solvePhasors(p, opts);
    const w = 2 * Math.PI * p.f;
    const fs = p.f * p.Nc;
    const n = p.Nc * p.cycles;
    const Ibase = (p.MVA * 1e3) / (Math.sqrt(3) * p.kV) / 1e3; // kA
    const Vbase = p.kV / Math.sqrt(3); // kV phase
    // inception: phase-A voltage angle at bus 2 equals incDeg, inside cycle 3
    const angVa = arg(sol.VrelPre[0]);
    let th = rad(opts.incDeg || 0) - angVa;
    th = ((th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const t0 = 2 / p.f + th / w;
    // DC offset time constant from the source-side positive-sequence X/R up to the fault
    const Zl = sol.net.left[1];
    const tau = Zl.im / (w * Math.max(Zl.re, 1e-6));
    const faulted = opts.type !== 'NF';
    const inst = (ph, t) => Math.SQRT2 * (ph.re * Math.cos(w * t) - ph.im * Math.sin(w * t));
    const t = new Float64Array(n);
    const ch = { ia: [], ib: [], ic: [], va: [], vb: [], vc: [] };
    const keysI = ['ia', 'ib', 'ic'], keysV = ['va', 'vb', 'vc'];
    for (const k of [...keysI, ...keysV]) ch[k] = new Float64Array(n);
    const dc = [0, 1, 2].map((k) => (faulted ? inst(sol.IrelPre[k], t0) - inst(sol.IrelPost[k], t0) : 0));
    for (let i = 0; i < n; i++) {
      const ti = i / fs;
      t[i] = ti;
      const post = faulted && ti >= t0;
      for (let k = 0; k < 3; k++) {
        const I = post ? sol.IrelPost[k] : sol.IrelPre[k];
        const V = post ? sol.VrelPost[k] : sol.VrelPre[k];
        let iv = inst(I, ti);
        if (post) iv += dc[k] * Math.exp(-(ti - t0) / tau);
        ch[keysI[k]][i] = iv * Ibase;
        ch[keysV[k]][i] = inst(V, ti) * Vbase;
      }
    }
    // additive white Gaussian noise relative to each channel's rms
    if (isFinite(opts.snrDb)) {
      const r = rng(opts.seed || 12345);
      for (const k of [...keysI, ...keysV]) {
        const a = ch[k];
        let ss = 0;
        for (let i = 0; i < n; i++) ss += a[i] * a[i];
        const sigma = Math.sqrt(ss / n) / Math.pow(10, opts.snrDb / 20);
        for (let i = 0; i < n; i++) a[i] += sigma * r.gauss();
      }
    }
    return { sol, t, fs, f: p.f, Nc: p.Nc, t0: faulted ? t0 : null, tau, Ibase, Vbase, ...ch };
  }

  PS.sim = { FAULT_TYPES, FAULT_NAMES, FAULT_FAMILY, defaultParams, network, faultAdmittance, solvePhasors, simulate, rng };
})(typeof window !== 'undefined' ? window : globalThis);
