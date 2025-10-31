# Litho-SCAN — Model Card

        - **Arch**: MobileNetV3-Small
        - **Task**: Classification de roches (5 classes)
        - **Export**: onnx (opset=18)
        - **Input**: [1,3,224,224] float32
        - **Output**: logits [1,5]
        - **Thresholds**: tau=0.54, delta=0.05, T=0.8999999999999999
        - **Date**: 2025-10-31T12:07:16.087956
        - **Seed**: 42

        Voir `model_meta.json`, `preprocess.json`, `class_manifest.json` et `scores_test.json` pour les détails.
        