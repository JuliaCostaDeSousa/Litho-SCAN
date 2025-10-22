#!/usr/bin/env python3
# -*- coding: utf-8 -*-

def main():
    # ---------------------------
    # 0) Imports
    # ---------------------------

    import json
    import os
    import csv
    from datetime import datetime
    from collections import defaultdict
    import torch
    import torchvision.models as models
    import torch.optim as optim
    import torch.nn as nn
    from torch.optim.lr_scheduler import ReduceLROnPlateau
    from PIL import Image
    import torchvision.transforms as transforms
    from torch.utils.data import Dataset, DataLoader
    from torchvision.io import decode_image
    # ---------------------------
    # 1) Préparation des données
    # ---------------------------
    
    path = "/home/costa/projects/Litho-SCAN/ml/"
    DATASET_DIR = os.path.join(path, "dataset")
    MANIFESTS_DIR = os.path.join(path, "manifests")
    ARTIFACTS_DIR = os.path.join(path, "artifacts")
    RAW_CLEAN_DIR = os.path.join(DATASET_DIR, "raw", "clean")

    #RUN_NAME = datetime.now().strftime("%Y%m%d-%H%M%S")
    #if RUN_NAME:
    #    OUT_DIR = ARTIFACTS_DIR + "/" + RUN_NAME
    OUT_DIR = ARTIFACTS_DIR + "/"
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)

    train_csv = os.path.join(MANIFESTS_DIR, "train.csv")
    test_csv = os.path.join(MANIFESTS_DIR, "test.csv")
    val_csv = os.path.join(MANIFESTS_DIR, "val.csv")

    count = {'train': defaultdict(int), 'val': defaultdict(int), 'test': defaultdict(int)}
    miss  = {'train': defaultdict(int), 'val': defaultdict(int), 'test': defaultdict(int)}
    invalid_rows = {'train': 0, 'test': 0, 'val': 0}
    labels = {'train': set(), 'val': set(), 'test': set()}
    required_cols = {'label', 'filepath'}

    for split, csv_path in [('train', train_csv), ('test', test_csv), ('val', val_csv)]:
        with open(csv_path, 'r', newline="", encoding="utf-8") as csv_file:
            reader = csv.DictReader(csv_file)
            if reader.fieldnames is None:
                raise ValueError(f"{split}.csv sans en-tête lisible")
            missing = required_cols - set(reader.fieldnames)
            if missing:
                raise ValueError(f"{split}.csv: colonnes manquantes {missing}")

            for row in reader:
                label_raw = row['label']
                filepath = row['filepath']

                if not label_raw or not filepath:
                    invalid_rows[split] += 1
                    continue
                label_norm = row['label'].strip().lower()
                path_norm  = filepath.strip()
                if not os.path.isabs(path_norm):
                    # CSV relatifs à ml/dataset
                    path_relatif = os.path.normpath(os.path.join(DATASET_DIR, path_norm))
                
                if not os.path.exists(path_relatif):
                    miss[split][label_norm] += 1
                    continue
                
                count[split][label_norm] += 1
                labels[split].add(label_norm)

    miss_in_val  = labels['train'] - labels['val']
    miss_in_test = labels['train'] - labels['test']
    if miss_in_test:
        raise ValueError(f"Classes présentes dans train mais absentes dans test: {sorted(miss_in_test)}")
    if miss_in_val:
        raise ValueError(f"Classes présentes dans train mais absentes dans val: {sorted(miss_in_val)}")
    
    classes = sorted(labels['train'])
    total_par_classe = {}
    missing_par_classe = {}
    n_train_total = sum(count['train'].values())
    n_val_total = sum(count['val'].values())
    n_test_total = sum(count['test'].values())

    for label in classes:
        n_tr = count['train'][label]
        n_v = count['val'][label]
        n_te = count['test'][label]
        total_par_classe[label] = n_tr + n_v + n_te

        m_tr = miss['train'][label]
        m_v = miss['val'][label]
        m_te = miss['test'][label]
        missing_par_classe[label] = m_tr + m_v + m_te

    total_images = sum(total_par_classe.values())
    total_missing = sum(missing_par_classe.values())

    pct_par_classe = {}
    for label in classes:
        if total_images > 0:
            pct_par_classe[label] = round(100 * total_par_classe[label] / total_images, 1)
        else:
            pct_par_classe[label] = 0.0


    with open(os.path.join(OUT_DIR, "data_report.csv"), 'w', encoding="utf-8") as report_csv:
        report_csv_writer = csv.writer(report_csv)
        header_classes = ["class", "n_train", "n_val", "n_test", "total", "pct_total", "missing_files"]
        report_csv_writer.writerow(header_classes)

        for label in classes:
            report_csv_writer.writerow([
                label,
                count['train'][label],
                count['val'][label],
                count['test'][label],
                total_par_classe[label],
                pct_par_classe[label],
                missing_par_classe[label]
            ])

        report_csv_writer.writerow([
            "TOTAL",
            n_train_total,
            n_val_total,
            n_test_total,
            total_images,
            100.0,
            total_missing
        ])


    summary_obj = {
        "total_images":   total_images,
        "missing_files":  total_missing,
        "num_classes":    len(labels['train']),
        "splits":         { "train": n_train_total,
                            "val":   n_val_total,
                            "test":  n_test_total },
        "invalid_rows":   invalid_rows
    }

    classes_obj = {}
    for label in classes:
        classes_obj[label] = {
            "train":         count['train'][label],
            "val":           count['val'][label],
            "test":          count['test'][label],
            "total":         total_par_classe[label],
            "pct_total":     pct_par_classe[label],
            "missing_files": missing_par_classe[label]
        }
    
    with open(os.path.join(OUT_DIR, "data_report.json"), 'w', newline='', encoding="utf-8") as report_json:
        json.dump({
            "summary": summary_obj,
            "classes": classes_obj
        }, report_json, ensure_ascii=False, indent=2)


    with open(os.path.join(OUT_DIR, "class_manifest.json"), 'w', encoding='utf-8') as f:
        json.dump({"classes": classes}, f, ensure_ascii=False, indent=2)

    # --- 9) Logs console (résumé lisible) ---
    print("Classes (ordre gelé):", ", ".join(classes))
    print(f"Répartition: train={n_train_total}, val={n_val_total}, test={n_test_total}, total={total_images}")
    print(f"Invalid rows: train={invalid_rows['train']}, val={invalid_rows['val']}, test={invalid_rows['test']}")

    # ---------------------------  
    # 1) Données & Dataloader
    # ---------------------------

    class DatasetCSV(Dataset):
        def __init__(self, csv_path, root_dir, classes, transform):
            with open(csv_path, 'r') as csv_file:
                reader = csv.reader(csv_file)
                idx_path = reader.index("filepath")
                idx_label = reader.index("label")
                self.path_resolu = []
                self.label_str = []
                for row in reader:
                    filepath = row[idx_path]
                    if not os.path.isabs(filepath):
                        self.path_resolu.append(os.path.normpath(os.path.join(root_dir, filepath)))
                    else:
                        self.path_resolu.append(filepath)
                    self.label_str.append(row[idx_label])
            self.img_labels = classes
            self.img_dir = root_dir
            self.transform = transform

        def __len__(self):
            return len(self.path_resolu)
        
        def __getitem__(self, idx):
            img_path = self.path_resolu[idx]
            image = decode_image(Image.open(img_path).convert("RGB"))
            label = self.label_str[idx]
            if self.transform:
                image = self.transform(image)
            return image, label
        


    train_dataset = DatasetCSV(csv_path=train_csv, root_dir=DATASET_DIR, classes=classes, transform=train_transform)
    val_dataset   = DatasetCSV(csv_path=val_csv,   root_dir=DATASET_DIR, classes=classes, transform=val_transform)
    test_dataset  = DatasetCSV(csv_path=test_csv,  root_dir=DATASET_DIR, classes=classes, transform=val_transform)

    train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True, num_workers=2, pin_memory=True)
    val_loader   = DataLoader(val_dataset,   batch_size=32, shuffle=False)
    test_loader  = DataLoader(test_dataset,  batch_size=32, shuffle=False)

    # ---------------------------  
    # 2) Création du modèle
    # ---------------------------

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    weights = models.MobileNet_V3_Small_Weights.DEFAULT
    mobilenet_v3_small = models.mobilenet_v3_small(weights=weights)
    mobilenet_v3_small.classifier[2] = nn.Linear(in_features=1280, out_features=len(classes))
    optimizer = optim.Adam(mobilenet_v3_small.parameters(), lr=0.001)
    batch_size = 32
    lr_head = 1e-3
    lr_finetune = 1e-4
    weight_decay = 1e-4
    dropout = 0.3
    epochs = 30 # 10 (head) + 20 (finetune)
    scheduler = ReduceLROnPlateau
    amp = True # automatic mixed precision
    patience=5 # early stopping
    criterion = nn.CrossEntropyLoss()

    # ---------------------------
    # 3) Configuration de l'entrainement
    # ---------------------------


    # ---------------------------
    # 4) Boucle d'entrainement
    # ---------------------------


    # ---------------------------
    # 5) Evalutation et ajustement du modèle
    # ---------------------------


    # ---------------------------
    # 6) Export du modèle
    # ---------------------------


if __name__ == "__main__":
    main()