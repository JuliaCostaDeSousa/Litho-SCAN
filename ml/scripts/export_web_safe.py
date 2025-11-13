#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import torch
import onnx
import torchvision.models as models
from collections import OrderedDict


# ====== Paramètres ======
MODEL_CKPT = "/home/costa/projects/Litho-SCAN/ml/artifacts/20251031-120610/best_phase2.ckpt"
NUM_CLASSES = 5
SIZE = 224  # == preprocess.json["size"]

model = models.mobilenet_v3_small(weights=None)
in_features = model.classifier[3].in_features
model.classifier[3] = torch.nn.Linear(in_features, NUM_CLASSES)
ckpt = torch.load(MODEL_CKPT, map_location="cpu")

from collections import OrderedDict
def get_state_dict(ckpt):
    if isinstance(ckpt, (dict, OrderedDict)):
        # ordre de priorité : ce qu'on voit dans ton log
        for k in ("model_state_dict", "state_dict", "model", "net", "weights", "params"):
            v = ckpt.get(k, None)
            if isinstance(v, (dict, OrderedDict)):
                return v
    # sinon, on suppose que ckpt *est* déjà un state_dict
    return ckpt
state = get_state_dict(ckpt)

# Retirer d'éventuels préfixes ("module.", "model.", etc.)
def strip_prefix(sdict, prefixes=("module.", "model.", "net.")):
    out = OrderedDict()
    for k, v in sdict.items():
        nk = k
        for p in prefixes:
            if nk.startswith(p):
                nk = nk[len(p):]
        out[nk] = v
    return out

state = strip_prefix(state)

# Essayer de charger strict=False (utile si noms diffèrent légèrement)
missing, unexpected = model.load_state_dict(state, strict=False)
print("[load_state_dict] missing:", missing)
print("[load_state_dict] unexpected:", unexpected)

with torch.no_grad():
    print("||last_w||:", model.classifier[3].weight.norm().item(),
          "||last_b||:", model.classifier[3].bias.norm().item())
    # un paramètre du backbone pour sanity check
    first_param = next(iter(model.features.parameters()))
    print("||features||:", first_param.norm().item())

model.eval()

# ====== 3) Export ONNX fixe, FP32, opset 19, sans axes dynamiques ======
dummy = torch.randn(1, 3, SIZE, SIZE, dtype=torch.float32)

onnx_path = os.path.abspath("model.onnx")
torch.onnx.export(
    model, dummy, onnx_path,
    input_names=["input"], output_names=["logits"],
    opset_version=19,
    do_constant_folding=True,
    dynamic_axes=None,
)
print("Exporté :", onnx_path)

# ====== 4) Forcer monolithique (pas de .data externe) ======
m = onnx.load(onnx_path, load_external_data=True)
onnx.save_model(m, "model_web.onnx", save_as_external_data=False)
print("OK → model_web.onnx (monolithique)")
