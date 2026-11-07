# WasteLens V17 Test Report

- `node --test src/*.test.js`: PASS (13 tests)
- `node --check src/storage.js`: PASS
- `node --check src/splits.js`: PASS
- `node --check server/server.js`: PASS
- `python3 -m py_compile training/train_wastelens.py`: PASS
- Static inspection confirms MobileNetV2 preprocessing is included once in the model graph, not applied twice to the input datasets.
- ZIP integrity: to be checked after packaging.

Not executed: TensorFlow model training/evaluation, Vite production build, or browser end-to-end tests. Python ML dependencies and JavaScript frontend dependencies are not installed in this environment.
