# WasteLens RealWaste training (9 material classes)

This pipeline is a separate material-recognition experiment. It does **not** map materials directly to recycle/compost/trash/special disposal because local acceptance rules vary.

## Dataset

- Source: UCI Machine Learning Repository, RealWaste, dataset 908: https://archive.ics.uci.edu/dataset/908/realwaste
- UCI record lists 4,752 images and a CC BY 4.0 license. The associated GitHub repository currently displays CC BY-NC-SA 4.0, so retain the UCI record, cite the dataset and paper, and verify the applicable license terms with the dataset maintainers before redistributing images or a model trained for commercial use.
- Citation: Single, S., Iranmanesh, S., & Raad, R. (2023). RealWaste. UCI Machine Learning Repository. https://doi.org/10.24432/C5SS4G.

## Setup

Python 3.10+ is recommended. In a terminal at the WasteLens project root:

```bash
python -m pip install torch torchvision pillow numpy scikit-learn
python training/prepare_realwaste.py
python training/train_realwaste.py --pretrained --epochs 12 --batch-size 32
```

`--pretrained` downloads ImageNet ResNet18 weights on first use. Omit it to train from random initialization when offline, though performance may be substantially lower. A CUDA GPU is used automatically when available; otherwise CPU training may be slow.

The preparation script downloads the official UCI archive, verifies the ZIP, extracts it, counts the nine classes, and writes `realwaste_dataset_manifest.json`. The training script removes exact byte-identical duplicates, creates stratified train/validation/test splits, trains ResNet18, uses class weights and augmentation, early-stops on validation loss, and writes a checkpoint plus held-out evaluation report.

## Output

`training_output/` contains the `.pth` model checkpoint, `split_manifest.json`, `training_history.json`, and `evaluation.json`.

## Important evaluation limits

The dataset has no physical-object/session IDs. Exact duplicate removal reduces one form of leakage, but different photos of the same physical object may still cross splits. Treat the test metrics as an initial benchmark, not proof of real-world performance. Add an independently collected, consented pilot set before claiming field accuracy. Do not infer disposal acceptance from material recognition.
