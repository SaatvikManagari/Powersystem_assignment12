/* UI controller. */
(function () {
  'use strict';
  const { cx: X, sim, clf, plot } = window.PS;
  const $ = (id) => document.getElementById(id);
  const css = plot.css;
  const PH = ['A', 'B', 'C'];
  const phColors = () => [css('--phA'), css('--phB'), css('--phC')];

  // ------------------------------------------------------------ params
  function readParams() {
    const p = sim.defaultParams();
    const num = (id, d) => { const v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : d; };
    p.f = +$('pF').value;
    p.kV = num('pKV', p.kV);
    p.lengthKm = num('pLen', p.lengthKm);
    p.E1 = num('pE1', p.E1);
    p.z1 = [num('pR1', p.z1[0]), num('pX1', p.z1[1])];
    p.z0 = [num('pR0', p.z0[0]), num('pX0', p.z0[1])];
    return p;
  }

  // ------------------------------------------------------------ tabs
  const TABS = ['simulate', 'method', 'verify', 'data'];
  let current = null;
  function showTab(name) {
    if (!TABS.includes(name)) name = 'simulate';
    current = name;
    TABS.forEach((t) => { $('tab-' + t).hidden = t !== name; });
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === name));
    redraw();
  }
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

  function redraw() {
    if (current === 'simulate') renderSim();
    if (current === 'verify') renderValidation();
    if (current === 'data' && lastData) renderData();
  }

  // ------------------------------------------------------------ theme
  function setTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('fcl-theme', t); } catch (e) { /* storage unavailable */ }
    redraw();
  }
  try { const t = localStorage.getItem('fcl-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) { /* ignore */ }
  $('themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(cur === 'dark' ? 'light' : 'dark');
  });

  // ------------------------------------------------------------ simulate tab
  const sel = $('fType');
  sim.FAULT_TYPES.forEach((t) => {
    const o = document.createElement('option');
    o.value = t; o.textContent = `${t === 'NF' ? 'NF' : t} — ${sim.FAULT_NAMES[t]}`;
    sel.appendChild(o);
  });
  sel.value = 'BG';
  let replaySeed = null;

  function readCase() {
    return {
      type: sel.value,
      x: +$('fX').value / 100,
      RfOhm: +$('fRf').value,
      incDeg: +$('fInc').value,
      deltaDeg: +$('fDelta').value,
      snrDb: $('fClean').checked ? Infinity : +$('fSnr').value,
      seed: replaySeed || 4242,
    };
  }
  function syncOutputs() {
    const p = readParams();
    $('oX').textContent = `${$('fX').value}% · ${((+$('fX').value / 100) * p.lengthKm).toFixed(0)} km`;
    $('oRf').textContent = `${$('fRf').value} Ω`;
    $('oInc').textContent = `${$('fInc').value}°`;
    $('oDelta').textContent = `${$('fDelta').value}°`;
    $('oSnr').textContent = $('fClean').checked ? '∞' : `${$('fSnr').value} dB`;
    $('fSnr').disabled = $('fClean').checked;
  }

  function drawSLD(x, type) {
    const s = $('sld');
    const L0 = 190, L1 = 590;
    const fx = L0 + x * (L1 - L0);
    const fault = type !== 'NF';
    const stroke = css('--text'), muted = css('--muted'), red = css('--phA'), acc = css('--accent');
    const bus = (px, label) => `<line x1="${px}" y1="48" x2="${px}" y2="102" stroke="${stroke}" stroke-width="5"/><text x="${px}" y="40" text-anchor="middle">${label}</text>`;
    const gen = (px, label) => `<circle cx="${px}" cy="75" r="20" fill="none" stroke="${stroke}" stroke-width="2"/><path d="M${px - 11} 75 q5.5 -11 11 0 t11 0" fill="none" stroke="${stroke}" stroke-width="2"/><text x="${px}" y="120" text-anchor="middle">${label}</text>`;
    const tr = (px, label, sub) => `<circle cx="${px - 8}" cy="75" r="13" fill="none" stroke="${stroke}" stroke-width="2"/><circle cx="${px + 8}" cy="75" r="13" fill="none" stroke="${stroke}" stroke-width="2"/><text x="${px}" y="120" text-anchor="middle">${label}</text><text x="${px}" y="136" text-anchor="middle" class="lbl-muted">${sub}</text>`;
    s.innerHTML = `
      <line x1="60" y1="75" x2="700" y2="75" stroke="${stroke}" stroke-width="2"/>
      ${gen(40, 'G₁')} ${bus(100, '1')} ${tr(140, 'T₁', 'YNyn')} ${bus(L0 - 10, '2')}
      <rect x="${L0 + 4}" y="54" width="22" height="16" rx="3" fill="${acc}"/><text x="${L0 + 15}" y="66" text-anchor="middle" style="fill:${css('--accent-ink')};font-size:11px;font-weight:600">R</text>
      ${bus(L1 + 10, '3')} ${tr(640, 'T₂', 'YNd')} ${bus(680, '4')} ${gen(720, 'G₂')}
      <text x="${(L0 + L1) / 2}" y="120" text-anchor="middle" class="lbl-muted">line ${readParams().lengthKm} km · Z₀ ≈ 3.3 Z₁</text>
      ${fault ? `
        <path d="M${fx} 75 l-6 14 h8 l-6 14" fill="none" stroke="${red}" stroke-width="2.5" stroke-linejoin="round"/>
        <line x1="${fx - 8}" y1="104" x2="${fx + 8}" y2="104" stroke="${red}" stroke-width="2"/>
        <circle cx="${fx}" cy="75" r="5" fill="${red}"/>
        <text x="${fx}" y="30" text-anchor="middle" style="fill:${red};font-weight:600">F · ${type}</text>
        <line x1="${L0 - 10}" y1="140" x2="${fx}" y2="140" stroke="${muted}" stroke-width="1" marker-end="url(#arr)"/>
        <text x="${(L0 - 10 + fx) / 2}" y="137" text-anchor="middle" class="lbl-muted">x = ${(x * 100).toFixed(0)}%</text>` : ''}
      <defs><marker id="arr" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L6 3 L0 6z" fill="${muted}"/></marker></defs>`;
  }

  function verdictHTML(trueLabel, out, extra) {
    const ok = trueLabel == null ? null : out.label === trueLabel;
    const cell = (k, v, cls = '') => `<div class="${cls}"><div class="k">${k}</div><div class="v">${v}</div></div>`;
    return [
      trueLabel != null ? cell('Simulated fault', trueLabel) : '',
      cell('Classified as', out.label + (ok == null ? '' : ok ? ' ✓' : ' ✗'), ok == null ? '' : ok ? 'ok' : 'ko'),
      ...extra.map(([k, v]) => cell(k, v)),
    ].join('');
  }

  function wheel(canvas, out) {
    const ground = out.label === 'NF' ? true : out.ground;
    const table = ground ? clf.SECTORS_GROUND : clf.SECTORS_LL;
    const sectors = Object.entries(table).map(([label, center]) => ({ label, center, active: label === out.label }));
    const vectors = out.theta != null ? [{ z: X.polar(1, X.rad(out.theta)), color: css('--seq2'), label: `θ=${out.theta.toFixed(0)}°` }] : [];
    plot.phasor(canvas, { sectors, vectors, aspect: 0.85 });
  }

  function featureTable(out, unit) {
    if (out.label === 'NF' || out.r0 == null) {
      return `<p class="muted">${out.reason}</p>`;
    }
    const f = (z) => X.fmt(z, 3);
    const rows = [0, 1, 2].map((k) => `<tr><th>Phase ${PH[k]}</th><td class="num">${f(out.Ipre[k])}</td><td class="num">${f(out.Ipost[k])}</td><td class="num">${f(out.dI[k])}</td></tr>`).join('');
    const seq = ['0 (zero)', '1 (positive)', '2 (negative)'].map((n, k) => `<tr><th>Seq ${n}</th><td class="num" colspan="3">ΔI = ${f(out.dS[k])}</td></tr>`).join('');
    return `
      <table class="tbl">
        <thead><tr><th>Feature</th><th class="num">value</th><th class="num">threshold</th><th>reading</th></tr></thead>
        <tbody>
          <tr><td>r₀ = |ΔI₀| / |ΔI₁|</td><td class="num">${out.r0.toFixed(4)}</td><td class="num">${out.r0min.toFixed(4)}</td><td>${out.ground ? 'ground involved' : 'no ground'}</td></tr>
          <tr><td>r₂ = |ΔI₂| / |ΔI₁|</td><td class="num">${out.r2.toFixed(4)}</td><td class="num">${clf.DEFAULTS.k2}</td><td>${out.r2 < clf.DEFAULTS.k2 ? 'balanced (3φ)' : 'unbalanced'}</td></tr>
          <tr><td>θ = ∠(ΔI₂ / ΔI₁)</td><td class="num">${out.theta.toFixed(1)}°</td><td class="num">±30° sectors</td><td>${out.label === 'ABC' ? '— (not used)' : `${out.label} sector, margin ${out.margin.toFixed(1)}°`}</td></tr>
        </tbody>
      </table>
      <p class="small muted" style="margin:10px 0 6px">${out.reason}</p>
      <table class="tbl">
        <thead><tr><th>Phasors (${unit}, rms)</th><th class="num">pre-fault</th><th class="num">fault window</th><th class="num">superimposed Δ</th></tr></thead>
        <tbody>${rows}${seq}</tbody>
      </table>`;
  }

  let lastSim = null;
  function renderSim() {
    syncOutputs();
    const p = readParams();
    const c = readCase();
    const w = sim.simulate(p, c);
    const out = clf.classify(w);
    lastSim = { p, c, w, out };
    const Ifmax = Math.max(...w.sol.IfAbc.map(X.abs)) * w.Ibase;
    const det = out.detTime != null && w.t0 != null ? `${((out.detTime - w.t0) * 1000).toFixed(2)} ms` : '—';
    const dec = out.decisionTime != null && w.t0 != null ? `${((out.decisionTime - w.t0) * 1000).toFixed(1)} ms` : '—';
    $('verdict').innerHTML = verdictHTML(c.type, out, [['Detected after', det], ['Decision after', dec]]);
    $('verdict').title = c.type !== 'NF' ? `Fault current at F: ${Ifmax.toFixed(2)} kA (max phase)` : '';
    drawSLD(c.x, c.type);
    const [ca, cb, cc] = phColors();
    const N = w.Nc, fs = w.fs;
    const spans = [], vlines = [];
    if (out.preS != null) {
      spans.push({ x0: out.preS / fs, x1: (out.preS + N) / fs, color: css('--win-pre'), label: 'pre-fault window' });
      spans.push({ x0: out.postS / fs, x1: (out.postS + N) / fs, color: css('--win-post'), label: 'fault window' });
    }
    if (w.t0 != null) vlines.push({ x: w.t0, color: css('--muted'), label: 'inception', align: 'right' });
    if (out.detTime != null) vlines.push({ x: out.detTime, color: css('--accent'), label: 'detected' });
    plot.line($('cvI'), {
      x: w.t, xscale: 1000, xlabel: 'time (ms)', ylabel: 'kA', spans, vlines,
      series: [{ y: w.ia, color: ca, label: 'ia' }, { y: w.ib, color: cb, label: 'ib' }, { y: w.ic, color: cc, label: 'ic' }],
    });
    plot.line($('cvV'), {
      x: w.t, xscale: 1000, xlabel: 'time (ms)', ylabel: 'kV', vlines: vlines.slice(0, 1), aspect: 0.32,
      series: [{ y: w.va, color: ca, label: 'va' }, { y: w.vb, color: cb, label: 'vb' }, { y: w.vc, color: cc, label: 'vc' }],
    });
    wheel($('cvWheel'), out);
    if (out.dI) {
      plot.phasor($('cvPh'), {
        aspect: 0.85,
        vectors: [
          { z: out.dI[0], color: ca, label: 'ΔIa' }, { z: out.dI[1], color: cb, label: 'ΔIb' }, { z: out.dI[2], color: cc, label: 'ΔIc' },
        ],
      });
    } else {
      plot.phasor($('cvPh'), { aspect: 0.85, vectors: [] });
    }
    $('featTable').innerHTML = featureTable(out, 'kA');
  }

  ['fType', 'fX', 'fRf', 'fInc', 'fDelta', 'fSnr', 'fClean', 'pF', 'pKV', 'pLen', 'pE1', 'pR1', 'pX1', 'pR0', 'pX0'].forEach((id) =>
    $(id).addEventListener('input', () => { replaySeed = null; renderSim(); }));

  $('btnRandom').addEventListener('click', () => {
    const r = Math.random;
    sel.value = sim.FAULT_TYPES[1 + Math.floor(r() * (sim.FAULT_TYPES.length - 1))];
    $('fX').value = 2 + Math.floor(r() * 96);
    $('fRf').value = Math.floor(r() * 150);
    $('fInc').value = Math.floor(r() * 360);
    $('fDelta').value = Math.floor(-20 + r() * 40);
    replaySeed = 1 + Math.floor(r() * 1e9);
    renderSim();
  });

  function download(name, text) {
    const blob = new Blob([text], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  $('btnExport').addEventListener('click', () => {
    if (!lastSim) return;
    const { w, c } = lastSim;
    const lines = ['t,ia,ib,ic,va,vb,vc'];
    for (let i = 0; i < w.t.length; i++) {
      lines.push([w.t[i].toFixed(7), w.ia[i], w.ib[i], w.ic[i], w.va[i], w.vb[i], w.vc[i]].map((v, k) => (k ? v.toFixed(5) : v)).join(','));
    }
    download(`fault_${c.type}_x${Math.round(c.x * 100)}_Rf${c.RfOhm}.csv`, lines.join('\n'));
  });

  // ------------------------------------------------------------ verification tab
  function renderValidation() {
    if ($('valTable').dataset.done) return;
    const p = sim.defaultParams();
    const opts = { x: 0.4, RfOhm: 10, deltaDeg: 10 };
    const rows = [];
    const add = (name, type, formula, fn) => {
      const s = sim.solvePhasors(p, { ...opts, type });
      const [Z0, Z1, Z2] = s.net.Zth;
      const E = s.VFpre, Zf = X.C(s.Rf);
      const ref = fn(E, Z0, Z1, Z2, Zf);
      const got = s.If012[1];
      const err = X.abs(X.sub(got, ref)) / X.abs(ref);
      rows.push(`<tr class="${err < 1e-3 ? 'ok' : 'ko'}"><td>${name}</td><td>\\(${formula}\\)</td><td class="num">${X.fmt(ref, 4)}</td><td class="num">${X.fmt(got, 4)}</td><td class="num">${err.toExponential(1)}</td><td class="status">${err < 1e-3 ? 'match' : 'mismatch'}</td></tr>`);
    };
    add('LG (AG)', 'AG', 'I_{a1}=\\frac{E}{Z_1+Z_2+Z_0+3Z_f}', (E, Z0, Z1, Z2, Zf) => X.div(E, X.add(X.add(X.add(Z1, Z2), Z0), X.scale(Zf, 3))));
    add('LL (BC)', 'BC', 'I_{a1}=\\frac{E}{Z_1+Z_2+Z_f}', (E, Z0, Z1, Z2, Zf) => X.div(E, X.add(X.add(Z1, Z2), Zf)));
    add('LLG (BCG)', 'BCG', 'I_{a1}=\\frac{E}{Z_1+Z_2\\,\\|\\,(Z_0+3Z_f)}', (E, Z0, Z1, Z2, Zf) => X.div(E, X.add(Z1, X.par(Z2, X.add(Z0, X.scale(Zf, 3))))));
    add('LLL (ABC)', 'ABC', 'I_{a1}=\\frac{E}{Z_1+Z_f}', (E, Z0, Z1, Z2, Zf) => X.div(E, X.add(Z1, Zf)));
    $('valTable').innerHTML = `
      <p class="small muted">Fault at 40% of the line, R<sub>f</sub> = 10 Ω, δ = 10°. Positive-sequence fault current in pu: closed-form sequence-network formula (16-Oct notes) vs the general phase-domain solver used by the simulator.</p>
      <table class="tbl"><thead><tr><th>Fault</th><th>Formula</th><th class="num">formula</th><th class="num">simulator</th><th class="num">rel. error</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table>`;

    // Example 5 (13-Oct notes): Z-bus short-circuit study of a 4-bus system
    const j = (v) => X.C(0, v);
    const n = 4;
    const Y = Array.from({ length: n }, () => Array.from({ length: n }, () => X.C(0)));
    const branch = (a, b, x) => {
      const y = X.inv(j(x));
      Y[a][a] = X.add(Y[a][a], y);
      if (b != null) { Y[b][b] = X.add(Y[b][b], y); Y[a][b] = X.sub(Y[a][b], y); Y[b][a] = X.sub(Y[b][a], y); }
    };
    branch(0, null, 0.15); branch(1, null, 0.15); // generator 0.10 + transformer 0.05
    branch(0, 2, 0.15); branch(0, 1, 0.2); branch(0, 3, 0.1); branch(1, 2, 0.1); branch(1, 3, 0.15);
    const Z = X.inverse(Y);
    const If = X.div(X.C(1), Z[3][3]);
    const Vf = [0, 1, 2, 3].map((i) => X.sub(X.C(1), X.div(Z[i][3], Z[3][3])));
    const book = { If: 7.37463, V: [0.4248, 0.4698, 0.4521, 0] };
    const vrow = Vf.map((v, i) => `<tr><td>V<sub>${i + 1}</sub><sup>f</sup></td><td class="num">${book.V[i].toFixed(4)}</td><td class="num">${X.abs(v).toFixed(4)}</td><td class="num">${Math.abs(X.abs(v) - book.V[i]).toExponential(1)}</td></tr>`).join('');
    $('valZbus').innerHTML = `
      <p class="small muted" style="margin-top:16px">Example 5 (13-Oct notes, Nagrath–Kothari): solid 3φ fault on bus 4 of the 4-bus system, Z<sub>BUS</sub> = Y<sub>BUS</sub><sup>−1</sup>, \\(V_i^f = V_i^0 - \\frac{Z_{i4}}{Z_{44}}V_4^0\\).</p>
      <table class="tbl"><thead><tr><th>Quantity</th><th class="num">book (pu)</th><th class="num">this code (pu)</th><th class="num">|difference|</th></tr></thead>
      <tbody><tr><td>Z<sub>44</sub></td><td class="num">j0.1356</td><td class="num">j${Z[3][3].im.toFixed(4)}</td><td class="num">${Math.abs(Z[3][3].im - 0.1356).toExponential(1)}</td></tr>
      <tr><td>|I<sup>f</sup>|</td><td class="num">${book.If.toFixed(4)}</td><td class="num">${X.abs(If).toFixed(4)}</td><td class="num">${Math.abs(X.abs(If) - book.If).toExponential(1)}</td></tr>${vrow}</tbody></table>
      <p class="small muted">Differences at the 4th decimal come from the book rounding Z<sub>BUS</sub> to 4 digits.</p>`;
    if (window.renderMathInElement) {
      window.renderMathInElement($('tab-verify'), { delimiters: [{ left: '\\(', right: '\\)', display: false }] });
    }
    $('valTable').dataset.done = '1';
  }

  // ------------------------------------------------------------ your data tab
  let lastData = null;
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const split = (l) => l.split(/[,;\t ]+/);
    let header = null;
    if (lines.length && split(lines[0]).some((c) => isNaN(parseFloat(c)))) header = split(lines.shift()).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const data = lines.map((l) => split(l).map(Number)).filter((r) => r.every((v) => isFinite(v)));
    if (data.length < 10) throw new Error('Could not read numeric rows from the file.');
    const find = (names, fallback) => {
      if (header) for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; }
      return fallback;
    };
    const ci = {
      t: find(['t', 'time', 'times', 'timesec'], 0),
      ia: find(['ia', 'iaka', 'iak', 'iaa', 'currenta', 'ir'], 1),
      ib: find(['ib', 'ibka', 'ibk', 'iba', 'currentb', 'iy'], 2),
      ic: find(['ic', 'icka', 'ick', 'ica', 'currentc'], 3),
    };
    if (data[0].length < 4) throw new Error('Need at least 4 columns: t, ia, ib, ic.');
    const col = (k) => data.map((r) => r[ci[k]]);
    return { t: col('t'), ia: col('ia'), ib: col('ib'), ic: col('ic'), header };
  }
  function resample(rec, f, Nc) {
    const dts = [];
    for (let i = 1; i < Math.min(rec.t.length, 200); i++) dts.push(rec.t[i] - rec.t[i - 1]);
    dts.sort((a, b) => a - b);
    const dt = dts[dts.length >> 1];
    if (!(dt > 0)) throw new Error('Time column must be increasing.');
    const fsIn = 1 / dt;
    if (fsIn / f < 16) throw new Error(`Sampling rate ${fsIn.toFixed(0)} Hz is below 16 samples/cycle.`);
    const fs = f * Nc, t0 = rec.t[0], tEnd = rec.t[rec.t.length - 1];
    const n = Math.floor((tEnd - t0) * fs);
    const out = { t: new Float64Array(n), ia: new Float64Array(n), ib: new Float64Array(n), ic: new Float64Array(n) };
    let j = 0;
    for (let i = 0; i < n; i++) {
      const ti = t0 + i / fs;
      while (j < rec.t.length - 2 && rec.t[j + 1] < ti) j++;
      const a = (ti - rec.t[j]) / (rec.t[j + 1] - rec.t[j] || 1);
      out.t[i] = ti - t0;
      for (const k of ['ia', 'ib', 'ic']) out[k][i] = rec[k][j] + a * (rec[k][j + 1] - rec[k][j]);
    }
    return { ...out, fs, f, fsIn };
  }
  function handleFile(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const raw = parseCSV(fr.result);
        const f = +$('dataF').value;
        const rec = resample(raw, f, 64);
        lastData = { rec, name: file.name, rows: raw.t.length };
        $('dataMsg').textContent = `${file.name}: ${raw.t.length} samples at ${rec.fsIn.toFixed(0)} Hz (${(raw.t[raw.t.length - 1] - raw.t[0]).toFixed(3)} s), resampled to 64 samples/cycle.`;
        renderData();
      } catch (e) {
        $('dataOut').hidden = true;
        $('dataMsg').textContent = 'Error: ' + e.message;
      }
    };
    fr.readAsText(file);
  }
  function renderData() {
    const { rec } = lastData;
    const out = clf.classify(rec);
    $('dataOut').hidden = false;
    $('dataVerdict').innerHTML = verdictHTML(null, out, [
      ['Detected at', out.detTime != null ? `${(out.detTime * 1000).toFixed(2)} ms` : '—'],
      ['r₀ / r₂', out.r0 != null ? `${out.r0.toFixed(3)} / ${out.r2.toFixed(3)}` : '—'],
      ['θ', out.theta != null ? `${out.theta.toFixed(1)}°` : '—'],
    ]);
    const [ca, cb, cc] = phColors();
    const spans = out.preS != null ? [
      { x0: out.preS / rec.fs, x1: (out.preS + out.N) / rec.fs, color: css('--win-pre'), label: 'pre' },
      { x0: out.postS / rec.fs, x1: (out.postS + out.N) / rec.fs, color: css('--win-post'), label: 'fault' },
    ] : [];
    plot.line($('dataCv'), {
      x: rec.t, xscale: 1000, xlabel: 'time (ms)', spans,
      vlines: out.detTime != null ? [{ x: out.detTime, color: css('--accent'), label: 'detected' }] : [],
      series: [{ y: rec.ia, color: ca, label: 'ia' }, { y: rec.ib, color: cb, label: 'ib' }, { y: rec.ic, color: cc, label: 'ic' }],
    });
    wheel($('dataWheel'), out);
    $('dataFeat').innerHTML = featureTable(out, 'input units');
  }
  $('csvFile').addEventListener('change', (e) => e.target.files[0] && handleFile(e.target.files[0]));
  $('dataF').addEventListener('change', () => { if (lastData) { const f = $('csvFile').files[0]; if (f) handleFile(f); } });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });

  // ------------------------------------------------------------ boot
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(redraw, 120); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
  window.addEventListener('load', () => {
    if (window.renderMathInElement && $('valTable').dataset.done) {
      window.renderMathInElement($('tab-verify'), { delimiters: [{ left: '\\(', right: '\\)', display: false }] });
    }
    if (window.renderMathInElement) {
      window.renderMathInElement($('tab-method'), {
        delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\(', right: '\\)', display: false }],
      });
    }
  });
  showTab(location.hash.slice(1) || 'simulate');
})();
