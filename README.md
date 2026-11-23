# Fault Classifier Lab

A browser-based fault classification technique for power transmission networks, verified with simulation data.
It is a static site (plain HTML/CSS/JavaScript, no build step), so it can be hosted directly on GitHub Pages.

**What it does**

- **Simulate**: solves the positive, negative and zero sequence networks of a two-source 220 kV test system
  (G1 – T1 YNyn – line – T2 YNd – G2) for any shunt fault (AG, BG, CG, AB, BC, CA, ABG, BCG, CAG, ABC) with chosen
  location, fault resistance, inception angle, pre-fault loading and measurement noise. It then synthesises the
  relay currents and voltages, including the decaying DC offset.
- **Classify**: identifies the fault type from the three phase currents at one line end only, using superimposed
  symmetrical components.
- **Verify**: checks the simulator against the textbook closed-form fault formulas and the Z-bus example.
- **Your data**: upload a CSV (`t, ia, ib, ic`) from MATLAB/Simulink, PSCAD, EMTP or a relay record and classify it.

## The classification technique

1. **Detect** the fault with the one-cycle superimposed sample `|i[k] − i[k−N]|`.
2. **Estimate phasors** with a full-cycle DFT on a pre-fault window and on the first cycle after detection.
3. **Superimposed currents**: `ΔI_abc = I_fault − I_pre`. This is the pure-fault network, so load current drops out.
4. **Sequence components**: `[ΔI0 ΔI1 ΔI2] = T⁻¹ ΔI_abc`.
5. **Decide**:
   - `|ΔI2|/|ΔI1| < 0.2` → three-phase fault (ABC)
   - `|ΔI0|/|ΔI1|` above a noise-adaptive threshold → ground involved
   - `θ = ∠(ΔI2/ΔI1)` selects the faulted phases from six 60° sectors:

| θ centre | 0° | +60° | +120° | 180° | −120° | −60° |
|---|---|---|---|---|---|---|
| ground | AG | ABG | BG | BCG | CG | CAG |
| no ground | – | AB | – | BC | – | CA |

The sector centres follow from the sequence-network boundary conditions. For example, LG faults have `I_a2 = I_a1`
and LL faults have `I_a2 = −I_a1`; rotating the reference phase by α = 1∠120° gives the other phases.

## Validation

The simulator matches the closed-form LG / LL / LLG / LLL sequence-network formulas to within 1e-5. It also
reproduces Example 5 (4-bus Z-bus fault study) from Nagrath–Kothari.

## Run locally

Open `index.html` in a browser. To avoid browser restrictions on `file://` pages, you can instead serve the folder:

```powershell
python -m http.server 8000
```

Then open http://localhost:8000.

Command-line tests (Node.js):

```powershell
node test/run-tests.js
```

## Host on GitHub Pages

1. Create a new **public** repository on GitHub (for example `fault-classifier-lab`). Do not add a README.
2. From this folder, push the code:

   ```powershell
   git init
   git add .
   git commit -m "Fault Classifier Lab"
   git branch -M main
   git remote add origin https://github.com/<your-username>/fault-classifier-lab.git
   git push -u origin main
   ```

   You can do the same with GitHub Desktop: *File → Add local repository*, pick this folder, then *Publish repository*.
3. On GitHub, open **Settings → Pages**. Under *Build and deployment*, set *Source* to **Deploy from a branch**,
   then choose branch **main** and folder **/ (root)**, and click **Save**.
4. After a minute or so the site is live at `https://<your-username>.github.io/fault-classifier-lab/`.

The empty `.nojekyll` file tells GitHub Pages to serve the files as-is.

## Project layout

```
index.html          page structure (Simulate · Method · Verification · Your data)
css/style.css       styles, light and dark themes
js/complex.js       complex numbers, Fortescue matrix T, linear solver
js/simulator.js     sequence-network fault simulator and waveform synthesis
js/classifier.js    detection, DFT phasors, superimposed sequence classifier
js/plots.js         dependency-free canvas charts
js/app.js           user interface
test/               Node.js validation tests
```

## References

- EE 315 Power Systems lecture notes (fault types, short-circuit transients, Thevenin and Z-bus methods,
  symmetrical components, sequence networks).
- D. P. Kothari, I. J. Nagrath, *Modern Power System Analysis*, McGraw-Hill.
- C. L. Fortescue, "Method of symmetrical co-ordinates applied to the solution of polyphase networks," *AIEE Trans.*, 1918.
