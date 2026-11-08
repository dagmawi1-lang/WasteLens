# WasteLens

**Point, scan, sort.** WasteLens is a waste-sorting assistant that runs computer vision in the browser, maps what it sees to a disposal stream (recycle, compost, trash, or special handling), explains how to prepare the item, and asks a person to confirm when it isn't sure.

Built for the **Rethinking Waste** track of [Arbiter Hacks V1](https://arbiter-hacks-v1.devpost.com/).

## My role & contributions

**Solo developer · AI-assisted**

- Defined the problem, the waste categories, and the human-correction flow
- Set up the dataset and training pipeline, and fixed a build-breaking bug before submission

## Features

**Scanner**
- Upload a photo or use the camera. Images are checked for type, size, and dimensions before analysis.
- Runs TensorFlow.js in the browser, using MobileNet by default or a custom-trained WasteLens model.
- Shows a disposal recommendation with preparation tips and a confidence score. Results below 40% confidence are flagged for review.
- Lets you correct a result. Corrections are logged locally and can be exported as JSON or CSV.

**Local rules**
- General guidance, a demonstration regional profile, and a custom profile for your own waste program.
- A source-backed rule ledger: each rule records its source URL, authority type, and the date it was checked. Rules older than 180 days are marked for rechecking.

**Model & data lab**
- Consent-based image collection stored in the browser (IndexedDB), with a dataset audit for class balance, duplicates, and low-resolution images.
- Leakage-aware train/validation/test splits: photos of the same object or capture session always stay in the same split.
- Exports a training kit, imports trained models, and compares evaluation reports side by side.
- Field testing records lighting, background, angle, and distance, and breaks down correction rates by condition and confidence band.

**Platform**
- Optional accounts with scrypt-hashed passwords, HttpOnly SameSite cookies, and rate limiting.
- Explicit cloud sync with revision checks. Sync never includes images.
- Installable PWA with an offline app shell.
- Content Security Policy, request IDs, structured API errors, and atomic data writes.
- Docker and GitHub Actions CI.

## Tech stack

React · Vite · TensorFlow.js · Node.js · Express · Python (TensorFlow/Keras and PyTorch training pipelines) · Docker

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # frontend (Vite)
npm run server     # API on http://localhost:3001 (second terminal)
```

Production-style run on one port:

```bash
npm run build
npm start          # serves dist/ and the API on http://localhost:3001
```

Or with Docker:

```bash
docker compose up --build
```

The camera needs `localhost` or HTTPS.

## Testing

```bash
npm run check      # syntax checks plus the automated test suite
```

## Training a waste-specific model

WasteLens includes two training pipelines that run on your own machine:

- [`training/README.md`](training/README.md): a four-class disposal model trained on images collected in the app, with group-aware stratified splits, class weights, early stopping, and optional fine-tuning.
- [`training/README_REALWASTE.md`](training/README_REALWASTE.md): a nine-class material-recognition model trained on the [RealWaste dataset](https://doi.org/10.24432/C5SS4G) (Single, Iranmanesh & Raad, 2023).

A trained Keras model can be converted for the browser with `tensorflowjs_converter` and loaded from the scanner's model panel. The model must take 224 × 224 RGB input and output four scores in this order: `recycle`, `compost`, `trash`, `special`.

## Design notes

- **Human in the loop.** The default MobileNet model is a general-purpose classifier, so WasteLens treats its output as a signal to confirm rather than a final answer.
- **Local rules vary.** Recycling rules differ by city and hauler. Recommendations are guidance, and rules you enter should be checked against your local program.
- **Privacy.** Photos stay in the browser unless you explicitly export them. No location is collected.

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for self-hosting and production hardening.

## License

**Permission required.** © 2026 Dagmawi Melaku. You need my written permission before using, copying, or modifying this code, and any approved use must credit me with a link to this repository. Viewing, forking on GitHub, and running it to judge or review a submission are allowed without asking. To ask, [open an issue](../../issues/new). See [LICENSE](LICENSE) for the full terms.
