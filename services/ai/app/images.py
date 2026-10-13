"""Download an image the API pointed us at, safely."""

from __future__ import annotations

import io
from urllib.parse import urlparse

import httpx
import imagehash
from PIL import Image, UnidentifiedImageError

# Refuse decompression bombs (a 40 MP photo is already far bigger than any product shot).
Image.MAX_IMAGE_PIXELS = 40_000_000


class ImageFetchError(Exception):
    """`permanent` errors will fail the same way on retry (bad host, not an image)."""

    def __init__(self, message: str, *, permanent: bool) -> None:
        super().__init__(message)
        self.permanent = permanent


def check_url(url: str, allowed_hosts: tuple[str, ...]) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ImageFetchError("Only https image URLs are allowed", permanent=True)
    host = (parsed.hostname or "").lower()
    if host not in allowed_hosts:
        raise ImageFetchError(f"Image host {host!r} is not allowed (AI_ALLOWED_IMAGE_HOSTS)", permanent=True)


async def fetch_image(
    url: str,
    *,
    allowed_hosts: tuple[str, ...],
    max_bytes: int,
    client: httpx.AsyncClient,
) -> tuple[Image.Image, bytes]:
    """Returns the decoded RGB image and the original bytes."""
    check_url(url, allowed_hosts)
    try:
        async with client.stream("GET", url, follow_redirects=False) as response:
            if response.status_code in (401, 403, 404, 410):
                # Expired signed URL or deleted file: the API will send a fresh URL on retry.
                raise ImageFetchError(f"Image not available ({response.status_code})", permanent=False)
            if response.status_code != 200:
                raise ImageFetchError(f"Image download failed ({response.status_code})", permanent=False)
            declared = int(response.headers.get("content-length") or 0)
            if declared > max_bytes:
                raise ImageFetchError("Image is too large", permanent=True)
            chunks: list[bytes] = []
            size = 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > max_bytes:
                    raise ImageFetchError("Image is too large", permanent=True)
                chunks.append(chunk)
    except httpx.HTTPError as e:
        raise ImageFetchError(f"Image download failed: {e.__class__.__name__}", permanent=False) from e

    data = b"".join(chunks)
    return decode_image(data), data


def decode_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise ImageFetchError("File is not a readable image", permanent=True) from e
    if image.mode in ("RGBA", "LA", "P"):
        # Flatten transparency onto white, like a product photo background.
        rgba = image.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.split()[-1])
        return background
    return image.convert("RGB")


def perceptual_hash(image: Image.Image) -> str:
    """64-bit pHash as 16 hex characters. Survives resizing and recompression."""
    return str(imagehash.phash(image, hash_size=8))
