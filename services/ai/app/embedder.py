"""Image and text embeddings from a CLIP model (runs locally, no API key)."""

from __future__ import annotations

import threading
from typing import Protocol

import numpy as np
from PIL import Image


class Embedder(Protocol):
    """Anything that maps images and texts into one shared, L2-normalised vector space."""

    name: str
    dimensions: int
    #: Multiplier CLIP applies to cosine similarity before softmax (about 100).
    logit_scale: float

    @property
    def loaded(self) -> bool: ...

    def load(self) -> None: ...

    def embed_image(self, image: Image.Image) -> np.ndarray: ...

    def embed_texts(self, texts: list[str]) -> np.ndarray: ...


def normalise(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=-1, keepdims=True)
    return vectors / np.clip(norms, 1e-12, None)


class ClipEmbedder:
    """OpenCLIP model, loaded once (downloads the weights on first use, about 350 MB)."""

    def __init__(self, model: str, pretrained: str, device: str = "cpu") -> None:
        self.name = f"clip:{model}/{pretrained}"
        self._model_name = model
        self._pretrained = pretrained
        self._device = device
        self._lock = threading.Lock()
        self._model = None
        self._preprocess = None
        self._tokenizer = None
        self.dimensions = 0
        self.logit_scale = 100.0

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        with self._lock:
            if self._model is not None:
                return
            # Imported here so tests and the health check never pay for torch.
            import open_clip
            import torch

            torch.set_grad_enabled(False)
            model, _, preprocess = open_clip.create_model_and_transforms(
                self._model_name, pretrained=self._pretrained, device=self._device
            )
            model.eval()
            self._tokenizer = open_clip.get_tokenizer(self._model_name)
            self._preprocess = preprocess
            self.logit_scale = float(model.logit_scale.exp().item())
            self.dimensions = int(model.text_projection.shape[1])
            self._model = model

    def embed_image(self, image: Image.Image) -> np.ndarray:
        self.load()
        import torch

        with self._lock, torch.no_grad():
            pixels = self._preprocess(image).unsqueeze(0).to(self._device)
            features = self._model.encode_image(pixels).float().cpu().numpy()[0]
        return normalise(features)

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        self.load()
        import torch

        with self._lock, torch.no_grad():
            tokens = self._tokenizer(texts).to(self._device)
            features = self._model.encode_text(tokens).float().cpu().numpy()
        return normalise(features)
