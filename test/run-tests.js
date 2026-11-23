// Node test harness:  node test/run-tests.js
const path = require('path');
for (const f of ['complex', 'simulator', 'classifier']) {
  require(path.join(__dirname, '..', 'js', f + '.js'));
}
const { cx: X, sim, clf } = globalThis.PS;
const p = sim.defaultParams();
let fails = 0;
const close = (a, b, tol, msg) => { const e = X.abs(X.sub(a, b)) / Math.max(X.abs(b), 1e-9); if (e > tol) { fails++; console.log('FAIL', msg, X.fmt(a), X.fmt(b), e); } return e; };

// 1. simulator vs closed-form sequence-network formulas (16-Oct notes)
let maxErr = 0;
for (const x of [0.1, 0.5, 0.9]) for (const Rf of [0, 10, 50]) {
  const s = sim.solvePhasors(p, { type: 'AG', x, RfOhm: Rf, deltaDeg: 10 });
  const [Z0, Z1, Z2] = s.net.Zth, E = s.VFpre, Zf = X.C(s.Rf);
  const Ia1 = X.div(E, X.add(X.add(X.add(Z0, Z1), Z2), X.scale(Zf, 3)));
  maxErr = Math.max(maxErr, close(s.If012[1], Ia1, 1e-4, 'LG'));
  const sb = sim.solvePhasors(p, { type: 'BC', x, RfOhm: Rf, deltaDeg: 10 });
  maxErr = Math.max(maxErr, close(sb.If012[1], X.div(E, X.add(X.add(Z1, Z2), Zf)), 1e-4, 'LL'));
  const sg = sim.solvePhasors(p, { type: 'BCG', x, RfOhm: Rf, deltaDeg: 10 });
  const Z03 = X.add(Z0, X.scale(Zf, 3));
  maxErr = Math.max(maxErr, close(sg.If012[1], X.div(E, X.add(Z1, X.par(Z2, Z03))), 1e-4, 'LLG'));
  const s3 = sim.solvePhasors(p, { type: 'ABC', x, RfOhm: Rf, deltaDeg: 10 });
  maxErr = Math.max(maxErr, close(s3.If012[1], X.div(E, X.add(Z1, Zf)), 1e-4, 'LLL'));
}
console.log('closed-form max rel err', maxErr.toExponential(2));

// 2. one representative case per fault type (noiseless, x = 40 %, Rf = 10 ohm)
for (const ty of sim.FAULT_TYPES) {
  const out = clf.classify(sim.simulate(p, { type: ty, x: 0.4, RfOhm: ty === 'NF' ? 0 : 10, deltaDeg: 10, incDeg: 30, snrDb: Infinity }));
  const ok = out.label === ty; if (!ok) fails++;
  console.log(ty.padEnd(4), '->', out.label.padEnd(4), ok ? 'ok' : 'FAIL');
}
process.exitCode = fails ? 1 : 0;
