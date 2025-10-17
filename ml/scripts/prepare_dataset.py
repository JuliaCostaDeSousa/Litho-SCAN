#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# =========================================
# prepare_dataset.py — Squelette (pseudo-code)
# =========================================
# Objectif :
# - Partir de ml/dataset/raw/{original,clean}
# - Créer ml/dataset/prepared/{train,val,test}
# - Assurer un split par "groupe parent" (évite fuite de données)
# - (Option) Générer rapports/manifests et augmentations offline
#
# ⚠️ Ce fichier est volontairement SANS implémentation.
#    Remplis chaque section avec ton propre code.

# ---------------------------
# 0) Imports (à compléter)
# ---------------------------
# # standard libs (path, args, random, csv/json, time)
# # imaging (Pillow/OpenCV) — au choix
# # logging / tqdm (si utile)
# # numpy (si besoin)
# # codecarbon (optionnel)

print("PART 0 : Imports")

import os
import numpy as np
import re

def createdictParents(path, roche):
    valid_ext = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}
    listImages = sorted([
        f for f in os.listdir(path)
        if os.path.isfile(os.path.join(path, f)) and os.path.splitext(f.lower())[1] in valid_ext
    ])
    mismatches = []
    pattern_parent = re.compile(rf'^{re.escape(roche)}_(\d{{3,}})$')
    pattern_child = re.compile(rf'^{re.escape(roche)}_(\d{{3,}})_(\d+)$')
    dictParents = {}

    for imageName in listImages:
        NameWithnoExt = imageName.split('.')[0]
        parentName = pattern_parent.match(NameWithnoExt)
        childName = pattern_child.match(NameWithnoExt)
        if parentName:
            dictParents.setdefault(parentName.group(0), []).append(imageName)
            continue
        if childName:
            dictParents.setdefault(roche + '_' + childName.group(1), []).append(imageName)
            continue
        mismatches.append(imageName)
    if mismatches:
        print(f"[WARN] {roche}: {len(mismatches)} fichiers ignorés (mismatch): {mismatches[:5]}...")

    return dictParents

# ---------------------------
# 1) Parser les arguments CLI
# ---------------------------
# - --src: dossier source (par défaut: ml/dataset/raw/clean)
# - --dst: dossier destination (par défaut: ml/dataset/prepared)
# - --img-size: 224 (par défaut)
# - --split: "0.7 0.15 0.15"
# - --seed: 42
# - --offline-aug: 0 (nombre de variantes offline à générer, 0 = aucune)
# - --force: bool (autoriser l’écrasement du dossier dst)
# - --formats: "jpg jpeg png" (extensions acceptées)
# - --reports: dossier pour manifests/rapports (ml/dataset/{manifests,reports})
# - --classes-map: chemin vers un mapping classes (optionnel)

# ---------------------------
# 2) Préparation des dossiers
# ---------------------------
# - Vérifier existence src (raw/clean)
# - Créer dst/{train,val,test} si absent (ou gérer --force)
# - Créer dossiers reports/manifests si absents
# - Écrire METADATA.json avec seed, split, img_size, src, datetime

print("PART 2 : Préparation des dossiers")

path = "/home/costa/projects/Litho-SCAN/ml/dataset/"
raw_dir  = os.path.join(path, "raw", "raw")
clean_dir = os.path.join(path, "raw", "clean")
isExistRaw = os.path.isdir(raw_dir)
isExistClean = os.path.isdir(clean_dir)
if isExistRaw == False or isExistClean == False:
    raise SystemExit("Dataset source manquante : 'raw/raw' et/ou 'raw/clean'")

print("Everything is awesome !")
# ---------------------------
# 3) Scan & validation des données
# ---------------------------
# - Lister classes = sous-dossiers de src
# - Pour chaque classe, lister fichiers images (extensions autorisées)
# - Vérifier images corrompues / dimensions anormales (log dans reports)
# - Compter images par classe (brut)
# - (Option) Normaliser les noms (espaces → underscore, etc.) si besoin

print("PART 3 : Scan & validation des données")
typesRoche = os.listdir(path + "raw/clean")
dictRoches = {}
for roche in sorted(typesRoche):
    key = roche
    if key not in dictRoches:
        dictRoches.setdefault(roche, {})
        pathRoche = os.path.join(clean_dir, roche)
        dictParents = createdictParents(pathRoche, roche)
        dictRoches[roche]['nb_images'] = sum(len(v) for v in dictParents.values())
        dictRoches[roche]['nb_parents'] = len(dictParents)
        dictRoches[roche]['parents'] = dictParents
for roche, info in dictRoches.items():
    print(f"{roche}: {info['nb_images']} images, {info['nb_parents']} parents")   
print("Everything is awesome !")

# ---------------------------
# 4) Détection des "groupes parent"
# ---------------------------
# - Règle de regroupement : ex. "granite_0001" est parent de
#   granite_0001.jpg, granite_0001_1.jpg, granite_0001_2.jpg…
# - Construire un index: {classe: {parent_id: [list_files]}}
# - Sauvegarder un inventaire "parents" (CSV/JSON) si utile

# ---------------------------
# 5) Split stratifié par groupes parent
# ---------------------------
# - Mélanger les parents avec seed fixe
# - Répartir les parents dans train/val/test selon ratios
# - Garantir que tous les enfants d’un parent vont dans le même split
# - Écrire manifests/{train,val,test}.csv avec (filepath, class, parent_id)

# ---------------------------
# 6) Pipeline de transformations "de base"
# ---------------------------
# - Définir la taille cible (ex. 224)
# - Choisir stratégie :
#   - resize plus petit côté → center-crop 224
#   - OU resize direct 224x224
# - Couleur : laisser RGB
# - Normalisation (mean/std ImageNet) : à appliquer plus tard en DataLoader
#   (donc ici on enregistre juste en 224, sans normaliser les pixels)

# ---------------------------
# 7) Augmentations OFFLINE (optionnel)
# ---------------------------
# - Si --offline-aug > 0 :
#   - Appliquer uniquement sur TRAIN
#   - Générer N variantes par image (rotation ±20°, flip H/V,
#     brightness/contrast léger, blur léger, jitter léger)
#   - Attention au nommage : *_aug01.jpg, *_aug02.jpg…
# - Si --offline-aug == 0 :
#   - Aucune duplication disque (préférer les aug on-the-fly côté entraînement)

# ---------------------------
# 8) Écriture des sorties
# ---------------------------
# - Pour chaque split et chaque classe :
#   - Créer dossier dst/{split}/{class}
#   - Appliquer pipeline "de base" (resize/crop) à chaque image
#   - Sauver l’image transformée dans le bon dossier
#   - Si offline-aug > 0 et split == train :
#       - Générer et sauvegarder les variantes augmentées
# - Mettre à jour manifests finaux (chemin destination + label)

# ---------------------------
# 9) Rapports & qualité
# ---------------------------
# - Générer reports/class_counts.csv (par split et par classe)
# - Générer quality_warnings.txt (images corrompues, tailles anormales, etc.)
# - Rappeler seed, ratios, nb parents, nb images finales
# - (Option) Ajouter un tableau "parents par split" pour audit anti-fuite

# ---------------------------
# 10) (Option) Mesure empreinte préparation (CodeCarbon)
# ---------------------------
# - Démarrer un EmissionsTracker (offline FRA)
# - Encapsuler les étapes lourdes (I/O, resize) si tu veux mesurer
# - Arrêter le tracker et enregistrer CSV dans artifacts/metrics

# ---------------------------
# 11) Sortie console (Résumé)
# ---------------------------
# - Afficher :
#   - nb classes, nb parents, nb images source
#   - split effectif (images par split)
#   - offline-aug utilisé ou non
#   - durée totale

# ---------------------------
# 12) Points de vigilance (rappels)
# ---------------------------
# - Jamais séparer les enfants d’un même parent entre des splits différents
# - Éviter d’augmenter OFFLINE val/test (restent “propres”)
# - Conserver les originaux immuables (raw/{original,clean})
# - Utiliser un seed fixe pour reproductibilité
# - Documenter les règles dans ml/dataset/README.md

# ---------------------------
# 13) Entry point
# ---------------------------
# if __name__ == "__main__":
#   - parser les args
#   - set seed
#   - exécuter les étapes 2→11 dans l’ordre
#   - gérer codes de retour / exceptions propres

