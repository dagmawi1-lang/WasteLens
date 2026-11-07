# WasteLens — 2 minute 30 second demo script

**Goal:** Show the waste-sorting problem, the product workflow, and the engineering behind it without overstating model accuracy.

## 0:00–0:20 — Problem

“People often have to guess which bin an item belongs in. Packaging can combine materials, food residue can contaminate recycling, and local collection rules differ. WasteLens is designed to help people make a better-informed decision and understand when they need to verify it.”

## 0:20–0:55 — Scan and verify

“Here I’m scanning an item. WasteLens shows a likely category, a confidence score, and preparation guidance. A prediction is not a guarantee. I can confirm or correct the result, and that correction is recorded for later review.”

**Presenter note:** Identify the active model honestly. If using general MobileNet, say it is a general-purpose vision model. Only call it a waste-specific model after loading a model you trained and evaluated.

## 0:55–1:20 — Local guidance and contamination

“The Waste Guide lets a user document rules for their own program and attach a source link and date checked. WasteLens does not independently authenticate that source, so the user must confirm it applies locally. The contamination check asks about food, liquid, grease, and mixed materials. Those answers are user observations, not camera detections.”

## 1:20–1:55 — Dataset and model development

“WasteLens also includes consent-based image collection, human labels, object/session group IDs, and group-aware train/validation/test splits. Group IDs help prevent photos of the same object from appearing in both training and test data. The training kit uses transfer learning and reports evaluation metrics.”

**Presenter note:** Only show an actual training report if you have run the training script. State the number of independent groups and test images. Do not use a small pilot as proof of general accuracy.

## 1:55–2:20 — Field testing and privacy

“The field-testing dashboard records conditions like lighting and viewing angle, and compares predictions with human-reviewed outcomes. It is observational feedback, not a controlled benchmark. Photos in the dataset stay local, and account sync intentionally excludes image files.”

## 2:20–2:30 — Close

“The next step is collecting a larger, independently labeled dataset, testing the model on diverse real-world items, and validating local rules with official waste providers. WasteLens is built to make uncertainty visible instead of hiding it.”

---

## Demo safety and honesty checks

- Do not claim a model was trained unless you ran the training pipeline.
- Do not present illustrative values as measured results.
- Do not call user-entered sources independently verified by WasteLens.
- Do not claim camera-based contamination detection.
- Do not claim cloud sync is hosted by the project; it is a self-hosted starter.
- Do not claim offline AI inference; the PWA caches the app shell, not guaranteed model files.
