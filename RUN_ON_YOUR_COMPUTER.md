# WasteLens — steps that must run on your computer

These steps need internet access and/or a GPU, which the build environment didn't have.

## 1. Install, check, build (about 5 min)
```bash
npm install
npm run check      # 34 automated tests
npm run build      # must finish without errors
npm start          # serves dist/ + API on http://localhost:3001
```
Open http://localhost:3001 in Chrome **and** Safari/Firefox. Test a real photo upload and the camera. Camera needs `localhost` or HTTPS.

## 2. Get the real labeled dataset (RealWaste, ~650 MB)
```bash
python -m pip install torch torchvision pillow numpy scikit-learn
python training/prepare_realwaste.py
```
Cite it as: Single, S., Iranmanesh, S., & Raad, R. (2023). RealWaste. UCI ML Repository. https://doi.org/10.24432/C5SS4G

## 3. Train and evaluate the waste-specific model
```bash
python training/train_realwaste.py --pretrained --epochs 12 --batch-size 32
```
This writes `training_output/evaluation.json`. Use the **accuracy and macro-F1 from that file** in your Devpost text, along with the test-set size. On CPU, expect 1–3 hours. Lower `--epochs` if you're short on time.

## 4. Demo and submit (Arbiter Hacks closes Nov 15, 2026; confirm on Devpost)
- Record a 2–3 minute video following `DEMO_SCRIPT.md`.
- Paste `SUBMISSION.md` into Devpost and add the real metrics from step 3.
- Push to a public GitHub repo. The CI workflow in `.github/workflows/ci.yml` runs automatically.

## Optional: pilot test
Ask 5–10 people to sort 10 items each, with and without WasteLens. Export the field-trial report from the Model lab. Report the sample size honestly.
