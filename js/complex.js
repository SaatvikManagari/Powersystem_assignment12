/* Complex arithmetic and small dense complex linear algebra.
 * Exposes PS.cx on the global object (works in browsers and in Node). */
(function (root) {
  'use strict';
  const PS = (root.PS = root.PS || {});

  const C = (re, im = 0) => ({ re, im });
  const add = (a, b) => C(a.re + b.re, a.im + b.im);
  const sub = (a, b) => C(a.re - b.re, a.im - b.im);
  const mul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
  const scale = (a, k) => C(a.re * k, a.im * k);
  const conj = (a) => C(a.re, -a.im);
  const abs = (a) => Math.hypot(a.re, a.im);
  const arg = (a) => Math.atan2(a.im, a.re);
  const div = (a, b) => {
    const d = b.re * b.re + b.im * b.im;
    return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
  };
  const inv = (a) => div(C(1, 0), a);
  const polar = (m, ang) => C(m * Math.cos(ang), m * Math.sin(ang));
  const neg = (a) => C(-a.re, -a.im);
  const par = (a, b) => div(mul(a, b), add(a, b)); // parallel combination
  const deg = (r) => (r * 180) / Math.PI;
  const rad = (d) => (d * Math.PI) / 180;

  // Fortescue operator alpha = 1∠120°
  const A = polar(1, rad(120));
  const A2 = polar(1, rad(240));
  const ONE = C(1, 0);
  const ZERO = C(0, 0);

  // [V_abc] = T [V_012]   (rows a, b, c; columns 0, 1, 2)
  const T = [
    [ONE, ONE, ONE],
    [ONE, A2, A],
    [ONE, A, A2],
  ];
  // [V_012] = T^-1 [V_abc]
  const Tinv = [
    [scale(ONE, 1 / 3), scale(ONE, 1 / 3), scale(ONE, 1 / 3)],
    [scale(ONE, 1 / 3), scale(A, 1 / 3), scale(A2, 1 / 3)],
    [scale(ONE, 1 / 3), scale(A2, 1 / 3), scale(A, 1 / 3)],
  ];

  function matVec(M, v) {
    return M.map((row) => row.reduce((s, m, j) => add(s, mul(m, v[j])), ZERO));
  }
  function matMul(Am, Bm) {
    const n = Am.length, p = Bm[0].length, m = Bm.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push([]);
      for (let j = 0; j < p; j++) {
        let s = ZERO;
        for (let k = 0; k < m; k++) s = add(s, mul(Am[i][k], Bm[k][j]));
        out[i].push(s);
      }
    }
    return out;
  }
  function identity(n) {
    return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? ONE : ZERO)));
  }
  function diag(v) {
    return v.map((d, i) => v.map((_, j) => (i === j ? d : ZERO)));
  }
  // Solve A x = b (Gaussian elimination with partial pivoting)
  function solve(Am, b) {
    const n = Am.length;
    const M = Am.map((row, i) => row.slice().concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (abs(M[r][c]) > abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      const p = M[c][c];
      if (abs(p) < 1e-300) throw new Error('Singular matrix');
      for (let r = c + 1; r < n; r++) {
        const f = div(M[r][c], p);
        for (let k = c; k <= n; k++) M[r][k] = sub(M[r][k], mul(f, M[c][k]));
      }
    }
    const x = new Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let k = r + 1; k < n; k++) s = sub(s, mul(M[r][k], x[k]));
      x[r] = div(s, M[r][r]);
    }
    return x;
  }
  function inverse(Am) {
    const n = Am.length;
    const cols = [];
    for (let j = 0; j < n; j++) cols.push(solve(Am, identity(n).map((r) => r[j])));
    return Am.map((_, i) => cols.map((col) => col[i]));
  }
  const toSeq = (abc) => matVec(Tinv, abc); // returns [X0, X1, X2]
  const toPhase = (s012) => matVec(T, s012); // returns [Xa, Xb, Xc]

  const fmt = (z, d = 3) => `${abs(z).toFixed(d)}∠${deg(arg(z)).toFixed(1)}°`;
  const wrapDeg = (d) => {
    let x = ((d + 180) % 360 + 360) % 360 - 180;
    return x === -180 ? 180 : x;
  };

  PS.cx = {
    C, add, sub, mul, div, scale, conj, abs, arg, inv, polar, neg, par, deg, rad,
    A, A2, ONE, ZERO, T, Tinv, matVec, matMul, identity, diag, solve, inverse,
    toSeq, toPhase, fmt, wrapDeg,
  };
})(typeof window !== 'undefined' ? window : globalThis);
