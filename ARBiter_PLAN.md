# Arbiter Hacks V1 Build Plan

## Target track
Rethinking Waste

## Specific problem
People frequently do not know which disposal stream an item belongs in, and packaging/material combinations make simple rules unreliable. Incorrect sorting can create contamination and reduce the value of recyclable material.

## What WasteLens measures
- classification confidence
- human corrections
- verification rate
- category distribution
- recurring low-confidence categories

## Next engineering milestones
1. Replace generic ImageNet mapping with a waste-specific classifier.
2. Add municipal recycling-rule profiles.
3. Add contamination detection for common cases such as food-soiled cardboard.
4. Build a waste confusion dataset from opt-in corrections.
5. Add an analytics dashboard showing which items people most often mis-sort.
6. Add offline PWA support.
7. Add automated tests and production deployment configuration.

## Demo narrative
Problem -> scan item -> explain result -> show uncertainty -> human correction -> show analytics -> explain how aggregated corrections improve waste guidance.


## V4 completed: Custom local rules
- Added General, Virginia demo, and Custom Local profiles.
- Added editable program name and per-item disposal overrides.
- Persisted profile and custom rules in browser localStorage.
- Added explicit warnings that demo/custom guidance is not independently verified.
- No precise location collection or external location transmission.

## Next recommended milestone: contamination-aware sorting
Build a user-guided contamination assessment for items such as cardboard and containers. Ask about visible food/liquid residue and material mixtures; treat answers as user observations, not computer-vision detections.

## V6 milestone: human correction data

- Capture human corrections as structured metadata in browser storage.
- Export correction records as JSON and CSV.
- Show recent corrections and permit local clearing.
- Explicitly disclose that no photos are retained and no model is trained by this feature.
- Next: design a consent-based image collection and labeling pipeline before attempting waste-specific model training.


## V7: consent-based dataset curation

Added a local image dataset builder using browser IndexedDB. Users must explicitly confirm permission/privacy consent and assign a human label before saving an image. They can inspect/delete samples and export a JSON dataset bundle. No image upload endpoint or automatic training was added. Labels require independent quality review before use as ground truth.


## V8: Dataset quality audit
- Summarize samples by disposal category.
- Flag exact duplicate image records.
- Report category coverage and a simple class-balance ratio.
- Export a JSON readiness report.
- Clearly state limitations: no semantic duplicate detection, label verification, or model training.


## V10 — local model training starter
- Export labeled image data plus split assignments as JSON.
- Export a Python TensorFlow/Keras MobileNetV2 transfer-learning script and setup guide.
- Script extracts data, trains, evaluates held-out test data, reports classification metrics, saves a confusion matrix and model.
- Training is local, not browser-side. Human labels and image-level splits require review; no accuracy claims are made.


## V12 completed: Model Comparison Center
- Import up to eight V1 evaluation reports at once.
- Compare test accuracy, macro F1, test loss, and test sample count.
- Remove individual reports, clear the comparison, or export a JSON comparison bundle.
- Show the macro-F1 leader as descriptive only with explicit same-test-set warnings.
- Reports remain in browser localStorage.


## V13 — Live custom-model integration
- Added browser-side loading for TensorFlow.js LayersModel files (`model.json` plus weight shards).
- The scanner now uses the loaded four-class WasteLens model instead of generic MobileNet while the custom model is active.
- Expected class order: recycle, compost, trash, special; expected input: 224×224 RGB.
- Added explicit fallback to general MobileNet and UI status.
- Added Keras-to-TensorFlow.js conversion instructions.
- Limitations: browser integration expects a converted LayersModel, not a raw `.keras` file; model quality depends on labeled data and independent evaluation; local waste acceptance remains separate.


## V14 milestone: Field testing and human feedback
- Log each image-based model prediction with model source, predicted category, confidence, and timestamp.
- Capture human verification as confirmed or corrected, without storing image files in this log.
- Summarize verified outcomes by model source and export JSON/CSV reports.
- Clearly label correction rate as observational feedback, not benchmark accuracy.

## V15 completed: Stability and automated checks
- Added safe localStorage JSON/text access helpers with malformed-data, disabled-storage, and quota-error handling.
- Added unit tests using Node's built-in test runner.
- Added an application-level React error boundary with a reload recovery action.
- Added image file type and size checks, camera readiness checks, and resource cleanup for camera streams and preview object URLs.
- Added protection against incrementing the verified counter more than once for the same prediction.
- Full Vite build remains to be confirmed after dependencies can be installed in an environment with package access.

## V16 completed: Group-aware dataset splitting
- Added a reusable deterministic split utility that assigns every object/session group to exactly one split.
- Added a group ID field when curating samples and editable group IDs for existing samples.
- Updated training manifests and the training kit to carry group IDs and use group-level assignments.
- Added group coverage reporting by category and explicit sparse-class limitations.
- Added tests for group isolation, determinism, legacy samples, and minimum-group behavior.

## V17 completed: Stronger model training and evaluation
- Upgraded the split strategy to deterministic class-stratified object/session groups.
- Added group-label conflict detection and training-script checks for both leakage and inconsistent labels.
- Required all four disposal classes in the training split and surfaced missing validation/test class coverage.
- Added class weights, early stopping, learning-rate reduction, and a training-history export.
- Removed duplicate MobileNetV2 preprocessing; raw pixel values are passed to the model's single preprocessing layer.
- Added split/group provenance to evaluation reports and included the standalone training script in the repository.
- TensorFlow training was not executed here; only Python syntax and JavaScript unit checks were run.

## V18 completed: Dataset scale and recognition robustness
- Added consent-based bulk image collection for up to 10 images per batch with per-image size and dimension checks.
- Added metadata capture for image dimensions, MIME type, file size, and filename.
- Added a low-resolution audit indicator for known image metadata.
- Hardened the Python pipeline with image decoding/verification and RGB normalization using Pillow.
- Added modest training-only image augmentation and optional second-stage fine-tuning of the final MobileNetV2 layers.
- Added separate head/fine-tuning histories and model input provenance to evaluation output.
- Kept the input shape fixed at 224 × 224 × 3 to match the live browser scanner.
- Model training was not executed here; only script compilation and code-level tests were run.

## V19 completed: Real-world pilot protocol and feedback analysis
- Added self-reported lighting, background, viewing angle, distance, and capture method to each model-based field trial.
- Added descriptive breakdowns by model, reviewed category, test condition, and confidence band.
- Updated JSON/CSV exports to include test context and methodology notes.
- Kept correction-rate calculations limited to human-reviewed records; pending records are excluded.
- Added a protocol reminder to compare the same physical items across models and vary one condition at a time.
- Added warnings that small condition groups are exploratory, not stable estimates.

## V20 completed: Source-backed local recycling information
- Added a local rule ledger for guide items with disposal category, source title, HTTPS URL, authority type, date checked, and notes.
- Required an explicit user confirmation that the source was reviewed and applies to the selected program.
- Applied source-backed rules to the Custom Local Profile and displayed source links on guide cards.
- Marked records older than 180 days or future/invalid dates as needing rechecking.
- Added local rulebook JSON export.
- Explicitly disclosed that WasteLens does not authenticate websites or independently verify municipal applicability; the source review is user-provided.

## V21 completed: Optional accounts and cloud synchronization
- Added username/password registration and login with salted scrypt password hashes.
- Added opaque HttpOnly, SameSite=Strict session cookies, seven-day expiry, logout, same-origin checks, and per-IP auth attempt limiting.
- Added authenticated sync endpoints with per-user revisions and conflict rejection.
- Added explicit frontend actions to load a cloud copy or upload this device's metadata.
- Synced only an allowlist of metadata/settings; dataset photos and image data are deliberately excluded and rejected by the API.
- Added payload size/depth limits and atomic JSON persistence.
- Added local deployment and production-hardening documentation. The service is self-hosted, not deployed, and still needs a production security review before public use.

## V22 completed: Deployment, offline shell, security, and performance
- Added a PWA manifest, app icon, and service worker with cached app shell/static assets and offline navigation fallback.
- Explicitly bypassed API, authentication, sync, and non-GET requests in the service worker cache strategy.
- Added production static frontend serving to the Node API server.
- Added Content Security Policy, request IDs, additional security headers, general API rate limiting, and structured API 404/error handling.
- Added atomic data-file writes with a previous-file backup.
- Separated Express runtime dependencies from frontend/build dependencies.
- Added multi-stage Dockerfile, Compose service, persistent data volume, health check, and Docker ignore file.
- Documented the distinction between offline shell availability and actual offline AI model inference.

## V23 completed: Competition presentation and release preparation
- Added an in-app demo checklist with progress tracking.
- Added a timed 2:30 demo script and explicit presenter honesty checks.
- Added a draft project description, theme paragraph, impact measurement plan, architecture summary, and limitations for the Arbiter Hacks submission.
- Added a release checklist for browser tests, model evidence, privacy, and submission assets.
- Added GitHub Actions CI to run Node checks/tests, build the frontend, and compile-check the Python training script.
- The local frontend build and browser demo still need to be run in an environment where dependencies can be installed.
