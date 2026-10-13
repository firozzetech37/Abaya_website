from __future__ import annotations

import hashlib
import io
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app.config import Settings
from app.embedder import normalise

ROOT = Path(__file__).resolve().parent.parent


class FakeEmbedder:
    """Deterministic stand-in for CLIP: each text maps to a fixed random unit vector.

    Tests control the image embedding directly (`next_image`), so they can say
    "this image looks exactly like the text 'a black abaya'".
    """

    name = "fake:test"
    dimensions = 64
    logit_scale = 100.0
    loaded = True

    def __init__(self) -> None:
        self.next_image: np.ndarray | None = None

    def load(self) -> None:
        pass

    def text_vector(self, text: str) -> np.ndarray:
        seed = int.from_bytes(hashlib.sha256(text.encode()).digest()[:4], "little")
        return normalise(np.random.default_rng(seed).standard_normal(self.dimensions))

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        return np.stack([self.text_vector(t) for t in texts])

    def embed_image(self, image: Image.Image) -> np.ndarray:
        if self.next_image is not None:
            return self.next_image
        return self.text_vector(f"image:{image.size}:{image.getpixel((0, 0))}")


@pytest.fixture
def embedder() -> FakeEmbedder:
    return FakeEmbedder()


@pytest.fixture
def settings() -> Settings:
    return Settings(
        token="test-token",
        tagger="clip",
        clip_model="fake",
        clip_pretrained="test",
        device="cpu",
        allowed_hosts=("project.supabase.co", "i.pinimg.com"),
        max_image_bytes=2_000_000,
        preload=False,
        vocabulary_path=ROOT / "vocabulary.json",
    )


def jpeg_bytes(colour=(20, 20, 20), size=(120, 180)) -> bytes:
    """A small product-like picture: warm gradient backdrop with a dark garment shape."""
    from PIL import ImageDraw

    width, height = size
    image = Image.new("RGB", size)
    for y in range(height):
        shade = 245 - int(35 * y / height)
        ImageDraw.Draw(image).line([(0, y), (width, y)], fill=(shade, shade - 6, shade - 16))
    draw = ImageDraw.Draw(image)
    draw.polygon([(width * 0.5, height * 0.1), (width * 0.8, height * 0.3), (width * 0.75, height * 0.92),
                  (width * 0.25, height * 0.92), (width * 0.2, height * 0.3)], fill=colour)
    draw.rectangle([width * 0.46, height * 0.02, width * 0.54, height * 0.12], fill=(110, 80, 60))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=90)
    return buffer.getvalue()
