# WasteLens training pipeline (four disposal classes)

Install Python 3.10 or 3.11 dependencies:

```bash
python -m pip install tensorflow pillow numpy scikit-learn matplotlib tensorflowjs
```

Export the dataset and script from the WasteLens Training Kit, or run this script with a compatible `wastelens-training-dataset.json`:

```bash
python train_wastelens.py wastelens-training-dataset.json --epochs 8 --batch-size 16 --seed 42
```

The pipeline validates that a group ID does not appear in multiple splits, requires training examples for all four categories, uses class weights and early stopping, and writes model, history, confusion-matrix, and evaluation-report files. Image pixel preprocessing is included once inside the model graph.

This is a research pipeline; measure accuracy on an independent test set before relying on a model. Label quality, group ID correctness, class coverage, and test-set independence remain the user's responsibility.
