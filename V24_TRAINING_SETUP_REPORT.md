# WasteLens V24 — RealWaste training setup

## Completed
- Reviewed the existing V23 project and its four-disposal-class training pipeline.
- Added a separate nine-class RealWaste material-recognition pipeline.
- Added an official UCI dataset download/extraction and integrity-check script.
- Added exact SHA-256 duplicate removal, stratified splits, class weighting, augmentation, early stopping, and held-out evaluation output.
- Documented dataset attribution and the discrepancy between the UCI record's CC BY 4.0 metadata and the linked GitHub repository's CC BY-NC-SA 4.0 notice.

## Environment verification
- PyTorch 2.10.0+cpu and torchvision 0.25.0+cpu are installed.
- TensorFlow is not installed.
- Outbound DNS/network access to archive.ics.uci.edu failed in this environment, so the 656.6 MB dataset could not be downloaded here.
- No training images were present; no model was trained and no accuracy result is claimed.

## Next milestone
Download the UCI archive in an internet-enabled environment, run the training pipeline, inspect the evaluation report, then build and test a browser inference integration. The existing scanner's custom model loader expects four disposal outputs; it must not be fed a nine-class material model without a separate material-recognition UI and correct output handling.
