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
    from datetime import datetime
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
    import onnxruntime as ort

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

    def collect_probs_and_labels(model, loader, device, amp=False, temperature: float = 1.0):
        """Passe le set (val/test) et renvoie (probs_np [N,C], labels_np [N])"""
        model.eval()
        all_probs, all_labels = [], []
        with torch.no_grad():
            for images, labels in loader:
                images = images.to(device, non_blocking=True)
                labels = labels.to(device, non_blocking=True).long()
                if amp and device.type == 'cuda':
                    with torch.amp.autocast("cuda"):
                        logits = model(images) / temperature
                else:
                    logits = model(images) / temperature
                probs = torch.softmax(logits, dim=1)
                all_probs.append(probs.cpu())
                all_labels.append(labels.cpu())
        probs_np  = torch.cat(all_probs).numpy()
        labels_np = torch.cat(all_labels).numpy()
        return probs_np, labels_np

    def grid_search_tau_delta(probs_np, labels_np, coverage_min: float = 0.75):
        """
        Balaye τ (tau) et δ (delta) et choisit le couple qui maximise acc@covered
        sous contrainte coverage >= coverage_min.
        """
        N, C = probs_np.shape
        order = np.argsort(probs_np, axis=1)[:, ::-1]           # indices triés
        p1 = probs_np[np.arange(N), order[:, 0]]
        p2 = probs_np[np.arange(N), order[:, 1]]
        pred1 = order[:, 0]

        tau_grid   = np.round(np.arange(0.40, 0.70 + 1e-9, 0.02), 2)
        delta_grid = np.round(np.arange(0.05, 0.25 + 1e-9, 0.01), 2)

        best = None
        for tau in tau_grid:
            for delta in delta_grid:
                abstain = (p1 < tau) | ((p1 - p2) < delta)
                covered_mask = ~abstain
                covered = covered_mask.sum()
                coverage = covered / N
                if covered == 0:
                    acc_cov = 0.0
                else:
                    acc_cov = (pred1[covered_mask] == labels_np[covered_mask]).mean()

                # score : maximiser acc@covered, pénaliser si coverage < seuil
                score = acc_cov if coverage >= coverage_min else acc_cov - (coverage_min - coverage)

                if (best is None) or (score > best["score"]):
                    best = {
                        "tau": float(tau),
                        "delta": float(delta),
                        "coverage": float(coverage),
                        "acc_covered": float(acc_cov),
                        "abstain_rate": float(1.0 - coverage),
                        "score": float(score),
                    }
        return best

    def save_model_meta(out_dir, classes, tau, delta, coverage, acc_cov, abstain_rate, temperature=None):
        meta = {
            "classes": classes,                  # ordre gelé (utile au front)
            "threshold_tau": tau,
            "threshold_delta": delta,
            "val_coverage": coverage,
            "val_acc_covered": acc_cov,
            "val_abstain_rate": abstain_rate,
        }
        if temperature is not None:
            meta["temperature"] = float(temperature)
        with open(os.path.join(out_dir, "model_meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        print("[calibration] model_meta.json enregistré :", os.path.join(out_dir, "model_meta.json"))

    def find_temperature_on_val(model, loader, device, amp=False):
        """Grid search simple pour minimiser la NLL sur val, renvoie T."""
        model.eval()
        # on empile logits/labels pour NLL propre
        all_logits, all_labels = [], []
        with torch.no_grad():
            for images, labels in loader:
                images = images.to(device, non_blocking=True)
                labels = labels.to(device, non_blocking=True).long()
                if amp and device.type == 'cuda':
                    with torch.amp.autocast("cuda"):
                        logits = model(images)
                else:
                    logits = model(images)
                all_logits.append(logits.cpu())
                all_labels.append(labels.cpu())
        logits = torch.cat(all_logits)    # [N,C] CPU
        labels = torch.cat(all_labels)    # [N]   CPU

        ce = torch.nn.CrossEntropyLoss(reduction="mean")
        best_T, best_nll = 1.0, float("inf")
        for T in np.arange(0.5, 3.0 + 1e-9, 0.1):
            nll = ce(logits / float(T), labels).item()
            if nll < best_nll:
                best_nll, best_T = nll, float(T)
        return best_T

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
    
    def export_model(
        ckpt_phase2_path,
        ckpt_phase1_path,
        out_dir,
        classes,                 # ordre gelé
        preprocess_cfg,          # {size, mean, std, color_space, dtype, policy...}
        meta_thresholds,         # {tau, delta, temperature T, coverage, acc_covered, abstain_rate}
        export_format,           # "onnx" | "torchscript"
        opset,                   # si onnx
        test_dataset,
        sanity_n=3,               # nb d'images pour le smoke test
    ):
        print("EXPORT DU MODELE")

        # 0) Préliminaires
        os.makedirs(out_dir, exist_ok=True)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # 1) Reconstruire le modèle
        if not (os.path.exists(ckpt_phase2_path) or os.path.exists(ckpt_phase1_path)):
            raise FileNotFoundError("Aucun checkpoint trouvé.")
        best_ckpt_path = ckpt_phase2_path if os.path.exists(ckpt_phase2_path) else ckpt_phase1_path
        ckpt = torch.load(best_ckpt_path, map_location=device)
        model = models.mobilenet_v3_small(weights=None)
        in_features = model.classifier[-1].in_features
        model.classifier[2].p = 0.3 # dropout
        model.classifier[-1] = nn.Linear(in_features, len(classes))
        model.load_state_dict(ckpt["model_state_dict"], strict=True)
        model.eval().to(device)

        # 2) Définir l’API d’entrée/sortie & dummy input
        input_name  = "input"       # stable, pour l’artefact
        output_name = "logits"      # (logits plutôt que probas = plus flexible)
        N, C, H, W = 1, 3, preprocess_cfg["size"], preprocess_cfg["size"]
        dummy_input = torch.zeros((N, C, H, W), dtype=torch.float32, device=device)

        # 3) Export binaire
        if export_format == "onnx":
            if opset is None:
                opset = 18  # Utilise les opérateurs ONNX de la version 18 du standard pour encoder ce modèle
            onnx_path = os.path.join(out_dir, "model.onnx")
            with torch.no_grad():
                torch.onnx.export(
                    model,
                    dummy_input,
                    onnx_path,
                    input_names=["input"],
                    output_names=["logits"],
                    opset_version=18,
                    dynamo=True,
                    dynamic_shapes={
                        "x":  {0: "batch", 2: "height", 3: "width"},
                        },
                    )
            exported_path = onnx_path

        elif export_format == "torchscript":
            # trace ou script, selon ton modèle (Mobilenet → trace OK)
            ts_path = os.path.join(out_dir, "model.torchscript")
            with torch.no_grad():
                ts = torch.jit.trace(model, dummy_input)
                ts.save(ts_path)
            exported_path = ts_path

        else:
            raise ValueError("export_format inconnu")

        # 4) Écrire les métadonnées & manifestes
        save_model_meta(
            out_dir,
            classes,
            tau=meta_thresholds["threshold_tau"],
            delta=meta_thresholds["threshold_delta"],
            coverage=meta_thresholds["val_coverage"],
            acc_cov=meta_thresholds["val_acc_covered"],
            abstain_rate=meta_thresholds["val_abstain_rate"],
            temperature=meta_thresholds.get("temperature", None)
            )

        with open(os.path.join(out_dir, "class_manifest.json"), "w", encoding="utf-8") as f:
            json.dump({ "classes": classes }, f, ensure_ascii=False, indent=2)

        # 5) Contrôle qualité post-export (parité logits)
        #    (prendre 3 images du test, appliquer la même préproc)
        if test_dataset is not None and len(test_dataset) > 0 and sanity_n > 0:
            model_cpu = model.to("cpu")
            model_cpu.eval()
            # echantillons du dataset de test
            idxs = random.sample(range(len(test_dataset)), k=min(sanity_n, len(test_dataset)))
            # tolérances réalistes entre frameworks / dtypes
            rtol = 1e-3
            atol = 5e-3
            for i in idxs:
                x_tensor, _ = test_dataset[i]
                x = x_tensor.unsqueeze(0).to("cpu")
                with torch.no_grad():
                    # on passe les images dans le modèle
                    logits_pt = model_cpu(x).numpy() 
                x_np = x.numpy().astype(np.float32)
                if export_format == "onnx":
                    sess = ort.InferenceSession(exported_path, providers=["CPUExecutionProvider"])
                    ort_inputs = {input_name: x_np}
                    logits_art = sess.run(["logits"], ort_inputs)[0]  # [1,C]
                elif export_format == "torchscript": # attend un tenseur pytorch
                    ts = torch.jit.load(exported_path, map_location="cpu")
                    ts.eval()
                    with torch.no_grad():
                        logits_art = ts(torch.from_numpy(x_np)).numpy()  # [1,C]
                else:
                    raise ValueError("export_format inconnu")
                
                if not np.allclose(logits_pt, logits_art, rtol=rtol, atol=atol):
                    diff = float(np.max(np.abs(logits_pt - logits_art)))
                    print(f"[warn] Parité PyTorch↔{export_format} légèrement différente (max|Δ|={diff:.2e})")


        # 6) Traçabilité

        model_card = f"""# Litho-SCAN — Model Card

        - **Arch**: MobileNetV3-Small
        - **Task**: Classification de roches ({len(classes)} classes)
        - **Export**: {export_format} (opset={opset if export_format=='onnx' else 'n/a'})
        - **Input**: [1,3,{H},{W}] float32
        - **Output**: logits [1,{len(classes)}]
        - **Thresholds**: tau={meta_thresholds['threshold_tau']}, delta={meta_thresholds['threshold_delta']}, T={meta_thresholds.get('temperature','-')}
        - **Date**: {datetime.now().isoformat()}
        - **Seed**: 42

        Voir `model_meta.json`, `preprocess.json`, `class_manifest.json` et `scores_test.json` pour les détails.
        """
        with open(os.path.join(out_dir, "MODEL_CARD.md"), "w", encoding="utf-8") as f:
            f.write(model_card)

        return exported_path
    
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

        # =========================================================
        # PHASE 2 — FINE-TUNING LÉGER
        # =========================================================
        # Repart du meilleur de phase 1 — NE PAS recharger l'optimizer ici
        print("PHASE 2 : FINE-TUNING")

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
        
        # =========================
        # TEST FINAL (après entraînement)
        # =========================
        # 0) Recharger le meilleur modèle de Phase 2 ou Phase 1 si phase 2 trop courte)
        print("TEST FINAL")
        if not os.path.exists(best_ckpt_p2):
            print("[warn] best_phase2.ckpt manquant, fallback best_phase1.ckpt")
            best_to_load = best_ckpt_p1
        else:
            best_to_load = best_ckpt_p2
        load_ckpt(best_to_load, model, optimizer=None, scaler=None,
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

        # 6) (option) Sauvegarde CSV de la matrice de confusion
        #   header: [""] + classes
        #   lignes: classe_i, cm[i,0], cm[i,1], ...
        with open(OUT_DIR + "/confusion_matrix_test.csv", 'w', newline="", encoding="utf-8") as scores_test_file:
            scores_test_file_w = csv.writer(scores_test_file)
            scores_test_file_w.writerow([""] + classes) # header
            for i, row in enumerate(cm):
                scores_test_file_w.writerow([classes[i]] + row.tolist())

        # =========================
        # Calibration τ/δ sur le set de validation
        # =========================
        print("CALIBRATION τ/δ")

        T = find_temperature_on_val(model, val_loader, device, amp=amp)

        # 1. Collecter les probabilités et labels sur val
        val_probs, val_labels = collect_probs_and_labels(model, val_loader, device, amp=amp, temperature=T)
        
        # 2. Balayer tau/delta pour trouver le meilleur couple
        best = grid_search_tau_delta(val_probs, val_labels, coverage_min=0.75)
        
        # 3. Sauvegarder dans model_meta.json
        save_model_meta(
            OUT_DIR, classes,
            tau=best["tau"], delta=best["delta"],
            coverage=best["coverage"], acc_cov=best["acc_covered"],
            abstain_rate=best["abstain_rate"], temperature=T
        )
    
        print(f"✅ Calibration terminée — τ={best['tau']}, δ={best['delta']}, "
            f"coverage={best['coverage']:.2f}, acc@covered={best['acc_covered']:.2f}")
        
        return scores
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
    EXPORT_DIR = os.path.join(path, "exports")

    RUN_NAME = datetime.now().strftime("%Y%m%d-%H%M%S")
    #if RUN_NAME:
    OUT_DIR = ARTIFACTS_DIR + "/" + RUN_NAME
    # OUT_DIR = ARTIFACTS_DIR + "/"
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
        measure_power_secs=30,     # fréquence de mesure
        log_level="error",         # ou "warning" pour moins de verbosité
    )
    tracker._geo.country_iso_code='FRA'
    tracker.start()

    scores = fit(
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
    
    preprocess_cfg = {
                "size": 224,
                "color_space": "RGB",
                "dtype": "float32",
                "mean": [0.485,0.456,0.406],
                "std":  [0.229,0.224,0.225],
                "policy": "val_transforms"
    }

    with open(os.path.join(OUT_DIR, "preprocess.json"), "w", encoding="utf-8") as preprocess_file:
        json.dump(preprocess_cfg, preprocess_file, indent=2, ensure_ascii=False)

    with open(os.path.join(OUT_DIR, "model_meta.json"), "r", encoding="utf-8") as f:
        meta_t = json.load(f)

    export_model(
        os.path.join(OUT_DIR, "best_phase2.ckpt"),
        os.path.join(OUT_DIR, "best_phase1.ckpt"),
        OUT_DIR,
        classes,
        preprocess_cfg,
        meta_thresholds = meta_t,
        export_format="onnx",
        opset=18,
        test_dataset=test_dataset,
        sanity_n=3,
    )
    
    emissions: float = tracker.stop()
    print(f"🌱 Entraînement terminé — émissions estimées : {emissions:.6f} kg CO₂eq")
    # Sauvegarde JSON
    scores["summary"]["emissions_kg_co2e"] = float(emissions)
    with open(OUT_DIR + "/scores_test.json", 'w', encoding="utf-8") as scores_test_file:
        json.dump(scores, scores_test_file, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
