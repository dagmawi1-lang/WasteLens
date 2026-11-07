# WasteLens V25 release checklist

## Before recording the demo

- [ ] Install dependencies and run `npm run check`.
- [ ] Run `npm run build` and confirm the production build succeeds.
- [ ] Run the API and frontend locally, or build/run with Docker Compose.
- [ ] Test image upload, camera permissions, manual correction, and local guide search.
- [ ] Test the source-backed local rule flow using a source that actually applies to the chosen demo program.
- [ ] Test the contamination questionnaire and explain it is user-guided.
- [ ] Test dataset collection, deletion, export, group IDs, and split manifest.
- [ ] If showing custom AI, train it locally, inspect the evaluation report, and test it on unseen items.
- [ ] Test field-trial export and clearly state sample sizes and limitations.
- [ ] Test account creation, sign-in, logout, cloud revision conflicts, and confirm no images sync.
- [ ] Test the PWA shell offline after at least one successful online visit. Do not promise offline model inference.

## Submission assets

- [ ] Public code repository with README and setup steps.
- [ ] 2–3 minute demo video based on `DEMO_SCRIPT.md`.
- [ ] Written project description and next steps from `SUBMISSION.md`.
- [ ] Theme paragraph from `SUBMISSION.md`.
- [ ] Any claimed metrics must come from actual test reports and include sample counts.

## Deployment gate

- [ ] HTTPS and secure cookies enabled.
- [ ] Persistent private storage and backups configured.
- [ ] Account deletion and recovery policy decided.
- [ ] Production database, monitoring, rate limiting, and security review completed.
- [ ] Privacy and age-appropriate account requirements reviewed before public release.
