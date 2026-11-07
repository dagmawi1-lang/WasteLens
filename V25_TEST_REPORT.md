# WasteLens V25 — test report (November 7, 2026)

## What changed in V25
- **Build-breaking bug fixed.** The training-kit README text in `src/main.jsx` was a template literal containing `\\``, which closes the string early. `npm run build` would have failed with `Expected ";" but found "wastelens"`. It is now a normal string with the same content.
- **Main page reorganized for judges and everyday users.** The order is now Sort → Waste guide → Contamination check → History → Account, followed by a labeled "Model & data lab" section that holds all dataset, training, evaluation, and field-trial tools.
- **Section navigation** (Sort, Guide, History, Account, Model lab) added to the header on desktop.
- **Hero card relabeled "EXAMPLE RESULT".** The decorative "92%" card no longer looks like a live measurement.
- CI now syntax-checks all three Python training scripts. `.gitignore` excludes datasets, checkpoints, and converted models.

## Verified here
| Check | Result |
|---|---|
| `node --test src/*.test.js server/*.test.js` | 34/34 pass |
| Frontend bundle (esbuild, same sources as Vite) | Builds with 0 errors / 0 warnings after the fix |
| `python -m py_compile training/*.py` | Pass |
| Headless Chrome: page load, photo upload, result card, human correction, manual sorter, contamination check, camera modal (fake device), reload persistence, 390px mobile layout | Pass; the only console error is the expected 401 from `/api/auth/me` when signed out |
| API: register, login, wrong password, `/api/auth/me`, sync GET/PUT, revision-conflict rejection (409) | Pass |

## Limits of this test run
- npm downloads were blocked in this environment, so the build used esbuild with the locally available React. TensorFlow.js, MobileNet, and lucide icons were stubbed. **Run `npm install && npm run check && npm run build` on your computer once before submitting.**
- No real MobileNet inference happened here. With the model stubbed, the app correctly falls back to "Needs verification" and manual mode.
- No waste-specific model has been trained yet. Do not show or claim accuracy numbers until you run the steps in `RUN_ON_YOUR_COMPUTER.md`.
