#!/usr/bin/env python3
"""WasteLens V18 robust image validation and fine-tuning pipeline. See WASTELENS_TRAINING_README.md."""
import argparse, base64, json, re, random, io
from pathlib import Path
from collections import Counter
from PIL import Image

import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from sklearn.metrics import classification_report, confusion_matrix, ConfusionMatrixDisplay
import matplotlib.pyplot as plt

CLASSES = ["recycle", "compost", "trash", "special"]
SPLITS = ["train", "validation", "test"]

def decode_data_uri(data_uri):
    match = re.match(r"^data:image/[^;]+;base64,(.+)$", data_uri or "", re.DOTALL)
    if not match:
        raise ValueError("An image sample did not contain a supported base64 data URI.")
    return base64.b64decode(match.group(1))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", nargs="?", default="wastelens-training-dataset.json")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--image-size", type=int, default=224)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--patience", type=int, default=3)
    parser.add_argument("--fine-tune-epochs", type=int, default=5)
    parser.add_argument("--fine-tune-layers", type=int, default=30)
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.image_size != 224 or args.patience < 1 or args.fine_tune_epochs < 0 or args.fine_tune_layers < 0:
        raise SystemExit("epochs and batch-size must be positive; image-size must be 224 for scanner compatibility; fine-tune options cannot be negative.")
    random.seed(args.seed)
    np.random.seed(args.seed)
    tf.random.set_seed(args.seed)
    payload = json.loads(Path(args.dataset).read_text(encoding="utf-8"))
    samples = payload.get("samples", [])
    if not samples:
        raise SystemExit("No labeled image samples were found in the dataset export.")

    group_splits = {}
    group_labels = {}
    for sample in samples:
        group_id = str(sample.get("groupId") or sample.get("id", ""))
        split = sample.get("split")
        label = sample.get("label")
        if not group_id or split not in SPLITS:
            raise SystemExit("Every sample must have a groupId (or id) and a valid split.")
        previous = group_splits.setdefault(group_id, split)
        if previous != split:
            raise SystemExit(f"Data leakage detected: group {group_id!r} appears in both {previous!r} and {split!r}.")
        previous_label = group_labels.setdefault(group_id, label)
        if previous_label != label:
            raise SystemExit(f"Conflicting labels detected within group {group_id!r}. Review the labels or assign separate object IDs.")

    root = Path("wastelens_prepared")
    for split in SPLITS:
        for label in CLASSES:
            (root / split / label).mkdir(parents=True, exist_ok=True)
    written = 0
    for sample in samples:
        label, split = sample.get("label"), sample.get("split")
        if label not in CLASSES or split not in SPLITS:
            continue
        image_bytes = decode_data_uri(sample.get("imageData"))
        filename = re.sub(r"[^a-zA-Z0-9_-]", "", str(sample.get("id", written))) or str(written)
        destination = root / split / label / (filename + ".jpg")
        try:
            with Image.open(io.BytesIO(image_bytes)) as source_image:
                source_image.verify()
            with Image.open(io.BytesIO(image_bytes)) as source_image:
                if source_image.width < 96 or source_image.height < 96:
                    raise ValueError(f"Image {filename} is smaller than 96 x 96 pixels.")
                source_image.convert("RGB").save(destination, format="JPEG", quality=95)
        except Exception as error:
            raise SystemExit(f"Invalid or unsupported image {filename}: {error}")
        written += 1
    print(f"Prepared {written} images under {root.resolve()}")
    counts = {split: Counter(p.parent.name for p in (root / split).glob("*/*") if p.is_file()) for split in SPLITS}
    for split in SPLITS:
        print(f"{split}: {dict(counts[split])}")
    split_files = {name: [p for p in (root / name).glob("*/*") if p.is_file()] for name in SPLITS}
    train_classes = {p.parent.name for p in split_files["train"]}
    missing_train_classes = [name for name in CLASSES if name not in train_classes]
    if missing_train_classes:
        raise SystemExit("The four-class model needs training examples for every class. Missing: " + ", ".join(missing_train_classes) + ". Add independently grouped examples and export a new training kit.")
    missing_splits = [name for name in SPLITS if not split_files[name]]
    if missing_splits:
        raise SystemExit("The " + ", ".join(missing_splits) + " split is empty. Add more independent object/session groups before training.")
    for split in ("validation", "test"):
        absent = [name for name in CLASSES if not any(path.parent.name == name for path in split_files[split])]
        if absent:
            print(f"WARNING: {split} has no examples for: {', '.join(absent)}. Per-class metrics for these categories will not be reliable.")
    print(f"Unique object/session groups: {len(group_splits)}")

    def load_split(name, shuffle):
        return keras.utils.image_dataset_from_directory(
            root / name, class_names=CLASSES, label_mode="int", image_size=(args.image_size, args.image_size),
            batch_size=args.batch_size, shuffle=shuffle, seed=42
        )
    train_ds = load_split("train", True)
    val_ds = load_split("validation", False)
    test_ds = load_split("test", False)
    autotune = tf.data.AUTOTUNE
    # image_dataset_from_directory yields pixel values in [0, 255]. Keep them raw
    # here because the model graph contains the single MobileNetV2 preprocessing layer.
    train_ds = train_ds.prefetch(autotune)
    val_ds = val_ds.prefetch(autotune)
    test_ds = test_ds.prefetch(autotune)

    base = keras.applications.MobileNetV2(input_shape=(args.image_size, args.image_size, 3), include_top=False, weights="imagenet")
    base.trainable = False
    inputs = keras.Input(shape=(args.image_size, args.image_size, 3))
    x = layers.RandomFlip("horizontal")(inputs)
    x = layers.RandomRotation(0.08)(x)
    x = layers.RandomContrast(0.15)(x)
    x = layers.RandomZoom(0.10)(x)
    x = layers.RandomTranslation(0.08, 0.08)(x)
    x = tf.keras.applications.mobilenet_v2.preprocess_input(x)
    x = base(x, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.Dropout(0.25)(x)
    outputs = layers.Dense(len(CLASSES), activation="softmax")(x)
    model = keras.Model(inputs, outputs)
    model.compile(optimizer=keras.optimizers.Adam(1e-3), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    train_counts = Counter(path.parent.name for path in split_files["train"])
    total_train = sum(train_counts.values())
    class_weights = {index: total_train / (len(CLASSES) * train_counts[name]) for index, name in enumerate(CLASSES) if train_counts.get(name, 0)}
    callbacks = [
        keras.callbacks.EarlyStopping(monitor="val_loss", patience=args.patience, restore_best_weights=True),
        keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=max(1, args.patience // 2), min_lr=1e-6)
    ]
    head_history = model.fit(train_ds, validation_data=val_ds, epochs=args.epochs, class_weight=class_weights, callbacks=callbacks)
    fine_tune_history = None
    if args.fine_tune_epochs > 0 and args.fine_tune_layers > 0:
        base.trainable = True
        fine_tune_at = max(0, len(base.layers) - args.fine_tune_layers)
        for layer in base.layers[:fine_tune_at]:
            layer.trainable = False
        for layer in base.layers:
            if isinstance(layer, layers.BatchNormalization):
                layer.trainable = False
        model.compile(optimizer=keras.optimizers.Adam(1e-5), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
        fine_callbacks = [keras.callbacks.EarlyStopping(monitor="val_loss", patience=args.patience, restore_best_weights=True), keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=max(1, args.patience // 2), min_lr=1e-7)]
        fine_tune_history = model.fit(train_ds, validation_data=val_ds, epochs=args.fine_tune_epochs, class_weight=class_weights, callbacks=fine_callbacks)
    training_history = {"head_training": {key: [float(v) for v in values] for key, values in head_history.history.items()}, "fine_tuning": {key: [float(v) for v in values] for key, values in fine_tune_history.history.items()} if fine_tune_history else None}
    Path("wastelens_training_history.json").write_text(json.dumps(training_history, indent=2), encoding="utf-8")

    loss, accuracy = model.evaluate(test_ds, verbose=0)
    print(f"Held-out test loss: {loss:.4f}; accuracy: {accuracy:.4f}")
    y_true, y_pred = [], []
    for images, labels in test_ds:
        probabilities = model.predict(images, verbose=0)
        y_true.extend(labels.numpy().tolist())
        y_pred.extend(np.argmax(probabilities, axis=1).tolist())
    print(classification_report(y_true, y_pred, labels=list(range(len(CLASSES))), target_names=CLASSES, zero_division=0))
    ConfusionMatrixDisplay(confusion_matrix(y_true, y_pred, labels=list(range(len(CLASSES)))), display_labels=CLASSES).plot(xticks_rotation=35)
    plt.tight_layout()
    plt.savefig("wastelens_confusion_matrix.png", dpi=160)
    model.save("wastelens_mobilenetv2.keras")
    report = classification_report(y_true, y_pred, labels=list(range(len(CLASSES))), target_names=CLASSES, zero_division=0, output_dict=True)
    evaluation = {
        "schemaVersion": 1,
        "modelName": "WasteLens MobileNetV2 transfer-learning starter",
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "classes": CLASSES,
        "metrics": {
            "testLoss": float(loss),
            "testAccuracy": float(accuracy),
            "classificationReport": report,
            "confusionMatrix": confusion_matrix(y_true, y_pred, labels=list(range(len(CLASSES)))).tolist(),
            "testSampleCount": len(y_true),
            "trainSampleCount": len(split_files["train"]),
            "validationSampleCount": len(split_files["validation"]),
            "uniqueGroupCount": len(group_splits),
            "seed": args.seed,
            "fineTuneLayers": args.fine_tune_layers,
            "fineTuneEpochsRequested": args.fine_tune_epochs,
            "fineTuneEpochsCompleted": len(fine_tune_history.history.get("loss", [])) if fine_tune_history else 0,
            "headEpochsCompleted": len(head_history.history.get("loss", [])),
            "inputSize": [args.image_size, args.image_size, 3]
        },
        "splitStrategy": payload.get("splitStrategy", "group-aware manifest; group IDs validated by training script"),
        "limitations": ["Metrics apply only to this exported test split.", "Group isolation is only as reliable as the user-provided group IDs; visually similar items assigned different IDs may still leak.", "Human labels may contain errors and the dataset may not represent real-world waste.", "Classes absent from validation/test have unreliable per-class metrics.", "This model does not determine local recycling acceptance rules."]
    }
    Path("wastelens_evaluation.json").write_text(json.dumps(evaluation, indent=2), encoding="utf-8")
    print("Saved wastelens_mobilenetv2.keras, wastelens_confusion_matrix.png, wastelens_training_history.json, and wastelens_evaluation.json")
    print("Do not treat these metrics as reliable if labels are unreviewed, splits leak related photos, or classes are underrepresented.")

if __name__ == "__main__":
    main()
