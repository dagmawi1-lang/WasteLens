# WasteLens — Arbiter Hacks V1 submission draft

## Project name
WasteLens

## Track
Theme Track: Rethinking Waste

## Short description
WasteLens is a waste-sorting assistant that combines image classification, disposal guidance, human verification, and user-curated local recycling rules. It is designed to help people understand likely disposal options while making uncertainty and local-rule limitations visible.

## What it does
A user can upload a photo or use a camera to receive a likely waste category and preparation guidance. Users can manually correct the result, consult a searchable waste guide, document local program rules with source links, and complete a guided contamination check. The project also includes a consent-based image dataset builder, object/session-aware data splitting, a local model-training starter, evaluation tools, and an observational field-testing dashboard.

## How it was built
The frontend uses React and Vite. Browser-side image analysis uses TensorFlow.js and MobileNet. A custom four-category TensorFlow.js model can be loaded into the scanner after training and conversion. The backend uses Node.js and Express for classification records, optional username/password accounts, and explicit metadata synchronization. The dataset builder uses IndexedDB for local image storage. Python training tools use TensorFlow/Keras and MobileNetV2 transfer learning.

## Waste problem addressed
The project targets incorrect sorting and contamination caused by uncertainty about material type, residue, mixed packaging, and differing local collection rules. WasteLens focuses on making the decision process understandable and encouraging verification instead of presenting a generic model guess as a definitive answer.

## How impact can be measured
A pilot can measure:
- number of items scanned and manually reviewed;
- correction rate among reviewed predictions;
- category-specific confusion patterns;
- differences by lighting, background, angle, distance, and capture method;
- contamination-preparation actions users report taking;
- source-backed local rules reviewed and kept current.

These are proposed pilot measures, not proven environmental impact. A controlled study would need independently verified labels, a representative sample, consistent procedures, and a comparison group before claiming reductions in contamination or waste.

## Theme paragraph
WasteLens addresses the “Rethinking Waste” theme by focusing on the everyday uncertainty that leads people to place items in the wrong disposal stream. It helps users inspect an item, review preparation guidance, correct model suggestions, and record local recycling rules with source references. Its contamination check highlights common concerns such as food residue, liquids, grease, and mixed materials. The project can measure its usefulness through manually reviewed sorting outcomes, category-specific corrections, and structured field tests across different image conditions. The current version is a prototype and does not yet prove a reduction in waste contamination; that would require a larger real-world pilot and independently verified results.

## Current limitations and next steps
The included MobileNet baseline is general-purpose. A waste-specific model depends on collecting enough diverse, independently labeled images and evaluating it on a genuinely untouched test set. Local rules are user-entered and not independently authenticated. The account/sync backend is a self-hosted starter and has not been deployed or security-audited. Next steps are a larger pilot dataset, independent label review, controlled field testing, verified local data partnerships, and production deployment review.
