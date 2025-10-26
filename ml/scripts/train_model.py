#!/usr/bin/env python3
# -*- coding: utf-8 -*-

def main():
    # ---------------------------
    # 0) Imports
    # ---------------------------

    from codecarbon import EmissionsTracker
    import json
    import os
    import csv
    import time
    import random
    from collections import defaultdict
    import numpy as np
    import torch
    import torchvision.models as models
    import torch.optim as optim
    import torch.nn as nn
    from torch.optim.lr_scheduler import ReduceLROnPlateau
    from PIL import Image
    import torchvision.transforms as transforms
    from torch.utils.data import Dataset, DataLoader
    from sklearn.metrics import f1_score, confusion_matrix

    class DatasetCSV(Dataset):
            def __init__(self, csv_path, root_dir, classes, transform):
                with open(csv_path, 'r') as csv_file:
                    reader = csv.DictReader(csv_file)
                    self.path_resolu = []
                    self.label_str = []
                    for row in reader:
                        filepath = row["filepath"]
                        if not os.path.isabs(filepath):
                            self.path_resolu.append(os.path.normpath(os.path.join(root_dir, filepath)))
                        else:
                            self.path_resolu.append(filepath)
                        self.label_str.append(row["label"])
                self.img_dir = root_dir
                self.transform = transform
                self.label_to_idx = {name: i for i, name in enumerate(classes)} # index attribué à chaque classe pour le loss
                self.img_labels = classes


            def __len__(self):
                return len(self.path_resolu)

            def __getitem__(self, idx):
                img_path = self.path_resolu[idx]
                try:
                    image = Image.open(img_path).convert("RGB")
                except Exception as e:
                    raise RuntimeError(f"Erreur lecture image: {img_path}") from e
                label = self.label_str[idx]
                label_idx = self.label_to_idx[label.strip().lower()]
                if self.transform:
                    image = self.transform(image)
                return image, label_idx
        
    def freeze_backbone(model):
        for param in model.features.parameters():
            param.requires_grad = False

    def unfreeze_last_blocks(model, n=2):
        # dégèle les n derniers blocs du backbone
        blocs = list(model.features.children())
        n = max(1, min(n, len(blocs)))
        for b in blocs[-n:]: 
            for param in b.parameters():
                param.requires_grad = True

    def make_optimizer_phase1(model, lr_head, weight_decay):
        params = [p for p in model.parameters() if p.requires_grad]
        return optim.Adam(params, lr=lr_head, weight_decay=weight_decay)

    def make_optimizer_phase2(model,lr_head, lr_finetune, weight_decay, n_unfrozen=2):
        unfreeze_last_blocks(model, n=n_unfrozen)
        blocks = list(model.features.children())
        backbone_degeles = []
        for b in blocks[-n_unfrozen:]:
            backbone_degeles += list(b.parameters())
        head_params = list(model.classifier.parameters())

        return optim.Adam([
        {"params": backbone_degeles, "lr": lr_finetune, "weight_decay": weight_decay},
        {"params": head_params,     "lr": lr_head, "weight_decay": weight_decay},
        ])

    def save_ckpt(path, model, optimizer, scaler, epoch, best_val, classes):
        torch.save({
            'model_state_dict': model.state_dict(),
            'optimizer_state_dict': optimizer.state_dict() if optimizer is not None else None,
            'scaler_state_dict': scaler.state_dict() if scaler is not None else None,
            'epoch': epoch,
            'best_val': best_val,
            'classes': classes
            }, path)

    def load_ckpt(
        path,
        model,
        optimizer=None,
        scaler=None,
        device="cpu",
        strict=False,
        expected_classes=None,     # passe None par défaut
        resume_optimizer=True      # False si changement de phase
    ):
        ckpt = torch.load(path, map_location=device)

        # 1) modèle
        ret = model.load_state_dict(ckpt["model_state_dict"], strict=strict)
        if not strict and ret is not None:
            missing = getattr(ret, "missing_keys", [])
            unexpected = getattr(ret, "unexpected_keys", [])
            if missing:   print(f"[load_ckpt] missing keys: {missing}")
            if unexpected:print(f"[load_ckpt] unexpected keys: {unexpected}")

        
        # 2) cohérence des classes (anti-décalage)
        ckpt_classes = ckpt.get("classes", None)
        if expected_classes is not None and ckpt_classes is not None:
            if list(expected_classes) != list(ckpt_classes):
                raise ValueError(
                    "[load_ckpt] Ordre des classes différent entre ckpt et session.\n"
                    f"  ckpt:     {ckpt_classes}\n"
                    f"  expected: {expected_classes}\n"
                )

        # 3) optimizer/scaler (uniquement si structure identique)
        if optimizer is not None and resume_optimizer:
            opt_sd = ckpt.get("optimizer_state_dict")
            if opt_sd is not None:
                try:
                    optimizer.load_state_dict(opt_sd)
                except Exception as e:
                    print("[load_ckpt] Échec load optimizer_state_dict (groupes différents ?). "
                        "Repars avec un optimizer neuf.\n", e)

        if scaler is not None:
            sc_sd = ckpt.get("scaler_state_dict")
            if sc_sd is not None:
                try:
                    scaler.load_state_dict(sc_sd)
                except Exception as e:
                    print("[load_ckpt] Échec load scaler_state_dict. Re-init scaler.\n", e)

        return {
            "epoch":   ckpt.get("epoch", None),
            "best_val":ckpt.get("best_val", None),
            "classes": ckpt_classes,
        }


    def current_lr(optimizer):
        return max(pg["lr"] for pg in optimizer.param_groups)

    def nb_correct(logits, labels):
        preds = torch.argmax(logits, dim=1)
        return (preds == labels).sum().item()

    def append_csv(csv_path, row_dict):
        file_exists = os.path.exists(csv_path)
        write_header = (not file_exists) or (os.path.getsize(csv_path) == 0)
        header = ["epoch", "phase", "lr", "train_loss", "train_acc", "val_loss", "val_acc", "f1_macro", "duration"]
        with open(csv_path, 'a', newline="", encoding="utf-8") as csv_file:
            csv_writer = csv.DictWriter(csv_file, fieldnames=header)
            if write_header:
                csv_writer.writeheader()
            csv_writer.writerow({k: row_dict.get(k, "") for k in header})

    def train_one_epoch(model, loader, optimizer, criterion, device, scaler, amp, max_grad_norm=None):
        model.train()
        accum_loss, correct, total = 0.0, 0, 0
        t0 = time.time()

        for (images, labels) in loader:
            images = images.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True).long() # long necessaire pour CrossEntropyLoss
            optimizer.zero_grad(set_to_none=True)

            # -------- Forward + Backward --------
            if amp and device.type == 'cuda':
                assert scaler is not None, "GradScaler must be provided when amp=True"
                with torch.amp.autocast("cuda"):
                    logits = model(images)
                    loss = criterion(logits, labels)
                scaler.scale(loss).backward()
                if max_grad_norm:
                    scaler.unscale_(optimizer)
                    torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
                scaler.step(optimizer)
                scaler.update()
            else:
                logits = model(images)
                loss = criterion(logits, labels)
                loss.backward()
                if max_grad_norm:
                    torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
                optimizer.step()

            # -------- Stats --------
            accum_loss += loss.item() * images.size(0)
            correct    += nb_correct(logits, labels)
            total      += images.size(0)
        
        epoch_loss = accum_loss / total
        epoch_acc = correct / total
        duration = time.time() - t0

        return { "loss": epoch_loss, "acc": epoch_acc, "duration": duration }

    def validate_one_epoch(model, loader, criterion, device, amp=False):
        model.eval()
        accum_loss, correct, total = 0.0, 0, 0
        all_preds, all_labels = [], []

        with torch.no_grad():
            for (images, labels) in loader:
                images = images.to(device, non_blocking=True)
                labels = labels.to(device, non_blocking=True).long() # long necessaire pour CrossEntropyLoss

                if amp and device.type == 'cuda':
                    with torch.amp.autocast("cuda"):
                        logits = model(images)
                        loss = criterion(logits, labels)
                else:
                    logits = model(images)
                    loss = criterion(logits, labels)

                accum_loss += loss.item() * images.size(0)
                correct    += nb_correct(logits, labels)
                total      += images.size(0)
                preds = torch.argmax(logits, dim=1)

                # stocker côté CPU pour concat + numpy
                all_preds.append(preds.cpu())
                all_labels.append(labels.cpu())
        
        if total == 0:
            return {"loss": float("nan"), "acc": 0.0, "f1_macro": 0.0}

        # aplatir en un seul vecteur
        all_preds  = torch.cat(all_preds).numpy()
        all_labels = torch.cat(all_labels).numpy()

        cm = confusion_matrix(all_labels, all_preds)
        f1_macro = compute_f1_macro(all_preds, all_labels)

        return {"loss": accum_loss / total,
                "acc": correct / total,
                "f1_macro": f1_macro,
                "confs": cm
        }

    def compute_f1_macro(preds, labels):
        return f1_score(labels, preds, average="macro")
    
    def fit(model, train_loader, val_loader, test_loader, device,
            lr_head, lr_finetune, weight_decay, patience_es, amp,
            OUT_DIR, classes, epochs_phase1, epochs_phase2):
        
        model.to(device)
        # ---------- commun ----------
        criterion = torch.nn.CrossEntropyLoss()   
        scaler = torch.amp.GradScaler() if (amp and device.type == 'cuda') else None
        best_ckpt_p1 = os.path.join(OUT_DIR, "best_phase1.ckpt")
        best_ckpt_p2 = os.path.join(OUT_DIR, "best_phase2.ckpt")
        log_csv = os.path.join(OUT_DIR, "train_log.csv")

        # =========================================================
        # PHASE 1 — HEAD ONLY
        # =========================================================
        print("PHASE 1 : HEAD ONLY")
        tracker.start_task("phase1_head")

        freeze_backbone(model) # avant l'optimizer
        optimizer = make_optimizer_phase1(model, lr_head, weight_decay)
        scheduler = ReduceLROnPlateau(optimizer, mode="min", factor=0.1, patience=3, min_lr=1e-6)

        best_val = float("inf")
        no_improve = 0
        epochs_done_p1 = 0

        for epoch in range(epochs_phase1):
            t0_p1 = time.time()
            tr = train_one_epoch(model, train_loader, optimizer, criterion, device, scaler, amp)
            va = validate_one_epoch(model, val_loader, criterion, device, amp)

            scheduler.step(va["loss"]) # observe val_loss
            append_csv(log_csv, {
                "epoch": epoch, "phase": "head",
                "lr": max(pg["lr"] for pg in optimizer.param_groups),
                "train_loss": tr["loss"], "train_acc": tr["acc"],
                "val_loss": va["loss"],   "val_acc": va["acc"], "f1_macro": va["f1_macro"],
                "duration": tr["duration"]
            })

            if va["loss"] < best_val - 1e-6:
                best_val = va["loss"]; no_improve = 0
                save_ckpt(best_ckpt_p1, model, optimizer, scaler, epoch, best_val, classes)
            else:
                no_improve += 1
                if no_improve >= patience_es:
                    epochs_done_p1 = epoch + 1
                    break
            epochs_done_p1 = epoch + 1
            one_epoch_p1 = time.time() - t0_p1
            print(f"~{one_epoch_p1:.2f}s per epoch  -> ~{one_epoch_p1*30/60:.1f} min for 30 epochs")

        tracker.stop_task()

        # =========================================================
        # PHASE 2 — FINE-TUNING LÉGER
        # =========================================================
        # Repart du meilleur de phase 1 — NE PAS recharger l'optimizer ici
        print("PHASE 2 : FINE-TUNING")
        tracker.start_task("phase2_finetune")

        load_ckpt(best_ckpt_p1, model, optimizer=None, scaler=None,
                device=device, expected_classes=classes, resume_optimizer=False)

        # Dégèle n derniers blocs, puis optimizer à 2 groupes (LR distincts)
        # (head = lr_head, backbone_dégelé = lr_finetune)
        optimizer = make_optimizer_phase2(model, lr_head, lr_finetune, weight_decay, n_unfrozen=2)
        scaler    = torch.amp.GradScaler() if (amp and device.type == 'cuda') else None # nouveau scaler (nouvelle phase)
        scheduler = ReduceLROnPlateau(optimizer, mode="min", factor=0.1, patience=3, min_lr=1e-6)

        best_val = float("inf")
        no_improve = 0
        epoch_offset = epochs_done_p1

        for e in range(epochs_phase2):
            t0_p2 = time.time()
            epoch = epoch_offset + e
            tr = train_one_epoch(model, train_loader, optimizer, criterion, device, scaler, amp)
            va = validate_one_epoch(model, val_loader,   criterion, device, amp)

            scheduler.step(va["loss"])
            # Logge les 2 LR (groupes) pour contrôle
            lrs = [pg["lr"] for pg in optimizer.param_groups]  # [lr_backbone, lr_head]
            append_csv(log_csv, {
                "epoch": epoch, "phase": "ft",
                "lr": max(lrs), "train_loss": tr["loss"], "train_acc": tr["acc"],
                "val_loss": va["loss"], "val_acc": va["acc"], "f1_macro": va["f1_macro"],
                "duration": tr["duration"]
            })

            if va["loss"] < best_val - 1e-6:
                best_val = va["loss"]; no_improve = 0
                save_ckpt(best_ckpt_p2, model, optimizer, scaler, epoch, best_val, classes)
            else:
                no_improve += 1
                if no_improve >= patience_es: break
            epochs_done_p2 = epoch + 1
            one_epoch_p2 = time.time() - t0_p2
            print(f"~{one_epoch_p2:.2f}s per epoch  -> ~{one_epoch_p2*30/60:.1f} min for 30 epochs")
        
        tracker.stop_task()

        # =========================
        # TEST FINAL (après entraînement)
        # =========================
        # 0) Recharger le meilleur modèle de Phase 2 (ou Phase 1 si tu stoppes là)
        load_ckpt(best_ckpt_p2, model, optimizer=None, scaler=None,
                device=device, expected_classes=classes, resume_optimizer=False)
        model.eval()

        # 1) Accumulateurs
        accum_loss = 0.0
        correct = 0
        total = 0
        all_preds = []     # indices prédits
        all_labels = []    # indices vrais
        all_probs = []     # (option) proba softmax pour top-k
        criterion = torch.nn.CrossEntropyLoss() 
        
        # 2) Boucle test (no_grad)
        with torch.no_grad():
            for (images, labels) in test_loader:
                images = images.to(device, non_blocking=True)
                labels = labels.to(device, non_blocking=True).long() # long necessaire pour CrossEntropyLoss
                # (option) autocast si amp et cuda
                if amp and device.type == 'cuda':
                    with torch.amp.autocast("cuda"):
                        logits = model(images)
                        loss = criterion(logits, labels)
                else:
                    logits = model(images)
                    loss = criterion(logits, labels)


                # stats cumulées
                accum_loss += loss.item() * images.size(0)
                total += images.size(0)

                # prédictions
                preds = torch.argmax(logits, dim=1)
                correct += nb_correct(logits, labels)

                # (option) proba pour top-k
                probs = torch.softmax(logits, dim=1)

                all_preds.append(preds.cpu())
                all_labels.append(labels.cpu())
                all_probs.append(probs.cpu())

        # 3) Agrégation
        all_preds  = torch.cat(all_preds).numpy()
        all_labels = torch.cat(all_labels).numpy()
        all_probs  = torch.cat(all_probs).numpy()   # shape [N, C]

        test_loss = accum_loss / total
        test_acc  = correct / total

        # 4) Métriques avancées
        # — F1 macro
        f1_macro = f1_score(all_labels, all_preds, average="macro")

        # — Matrice de confusion (taille fixe CxC)
        cm = confusion_matrix(all_labels, all_preds, labels=range(len(classes)))

        # — (option) F1 par classe
        f1_per_class = f1_score(all_labels, all_preds, average=None, labels=range(len(classes)))
        # -> liste de taille C alignée avec 'classes'

        # — (option) Top-k (ex. top-3)
        #   calcule pour chaque sample si le vrai label est dans les k meilleures probas
        topk = 3
        topk_idx = np.argsort(all_probs, axis=1)[:, ::-1][:, :topk]    # indices des k plus probables
        hits = (topk_idx == all_labels.reshape(-1, 1)).any(axis=1)
        topk_acc = float(hits.mean())

        # 5) Préparer l’objet de sortie
        scores = {
        "summary": {
            "num_samples": int(total),
            "num_classes": len(classes),
            "test_loss": float(test_loss),
            "test_acc":  float(test_acc),
            "f1_macro":  float(f1_macro),
            "top3_acc":  float(topk_acc)
        },
        "per_class": [
            {
                "class": classes[i],
                "f1": float(f1_per_class[i]),
                "support": int(cm[i].sum()),
                "precision": None,
                "recall": None
            }
            for i in range(len(classes))
        ],
        "confusion_matrix": cm.tolist(),    # C x C
        "classes": classes                   # ordre gelé
        }

        # 6) Sauvegarde JSON
        emissions = tracker.stop()
        scores["summary"]["emissions_kg_co2e"] = float(emissions)
        with open(OUT_DIR + "/scores_test.json", 'w', encoding="utf-8") as scores_test_file:
            json.dump(scores, scores_test_file, indent=2, ensure_ascii=False)

        # 7) (option) Sauvegarde CSV de la matrice de confusion
        #   header: [""] + classes
        #   lignes: classe_i, cm[i,0], cm[i,1], ...
        with open(OUT_DIR + "/confusion_matrix_test.csv", 'w', newline="", encoding="utf-8") as scores_test_file:
            scores_test_file_w = csv.writer(scores_test_file)
            scores_test_file_w.writerow([""] + classes) # header
            for i, row in enumerate(cm):
                scores_test_file_w.writerow([classes[i]] + row.tolist())




    # ---------------------------
    # 1) Préparation des données
    # ---------------------------

    seed = 42
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True   # option pour reproduire les kernels GPU
    torch.backends.cudnn.benchmark = False       # désactive l’auto-tuning non déterministe 

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
                    path_resolved = os.path.normpath(os.path.join(DATASET_DIR, path_norm))
                else:
                    path_resolved = path_norm
                
                if not os.path.exists(path_resolved):
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

    
    train_transform = transforms.Compose([
            transforms.RandomResizedCrop(224, scale=(0.8, 1.0)),  # Resize the image to match the model's input size
            transforms.RandomHorizontalFlip(),
            transforms.RandomRotation(10),
            transforms.ColorJitter(brightness=0.1 , contrast=0.1 ),
            transforms.ToTensor(),  # Convert the image to a PyTorch tensor
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],  # Normalize the image using the mean and std of ImageNet
                std=[0.229, 0.224, 0.225]
            ),
        ])
    weights = models.MobileNet_V3_Small_Weights.DEFAULT
    val_transform = weights.transforms()
    test_transform = val_transform

    train_dataset = DatasetCSV(csv_path=train_csv, root_dir=DATASET_DIR, classes=classes, transform=train_transform)
    val_dataset   = DatasetCSV(csv_path=val_csv, root_dir=DATASET_DIR, classes=classes, transform=val_transform)
    test_dataset  = DatasetCSV(csv_path=test_csv, root_dir=DATASET_DIR, classes=classes, transform=test_transform)

    train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True, num_workers=2, persistent_workers=True, pin_memory=True)
    val_loader   = DataLoader(val_dataset, batch_size=32, shuffle=False, num_workers=2, pin_memory=True)
    test_loader  = DataLoader(test_dataset, batch_size=32, shuffle=False, num_workers=2, pin_memory=True)

    # ---------------------------  
    # 2) Création du modèle
    # ---------------------------
    lr_head = 1e-3
    lr_finetune = 1e-4
    weight_decay = 1e-4
    patience=5 # early stopping
    epochs_phase1 = 10 # head
    epochs_phase2 = 20 # finetune
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    mobilenet_v3_small = models.mobilenet_v3_small(weights=weights)
    in_features = mobilenet_v3_small.classifier[-1].in_features
    mobilenet_v3_small.classifier[-1] = nn.Linear(in_features, len(classes))
    mobilenet_v3_small.to(device)
    mobilenet_v3_small.classifier[2].p = 0.3 # dropout

    

    tracker = EmissionsTracker(
        project_name="Litho-SCAN_Training",
        output_dir=OUT_DIR,
        country_iso_code="FRA",
        measure_power_secs=1,     # fréquence de mesure
        log_level="info",         # ou "warning" pour moins de verbosité
    )
    tracker.start()

    fit(
            model=mobilenet_v3_small,
            train_loader=train_loader,
            val_loader=val_loader,
            test_loader=test_loader,
            device=device,
            lr_head=lr_head,
            lr_finetune=lr_finetune,
            weight_decay=weight_decay,
            patience_es=patience,
            amp=True,
            OUT_DIR=OUT_DIR,
            classes=classes,
            epochs_phase1=epochs_phase1,
            epochs_phase2=epochs_phase2
        )
        
    emissions: float = tracker.stop()
    print(f"🌱 Entraînement terminé — émissions estimées : {emissions:.6f} kg CO₂eq")

    # ---------------------------
    # 6) Export du modèle
    # ---------------------------


if __name__ == "__main__":
    main()
