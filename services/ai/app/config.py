"""Settings from the environment (the repo root .env in development)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent

# Reference images imported from Pinterest are served from its CDN.
DEFAULT_IMAGE_HOSTS = ("i.pinimg.com",)


def _flag(value: str | None, default: bool) -> bool:
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    token: str | None
    tagger: str  # "clip" (free, local) or "claude" (needs ANTHROPIC_API_KEY)
    clip_model: str
    clip_pretrained: str
    device: str
    allowed_hosts: tuple[str, ...]
    max_image_bytes: int
    preload: bool
    vocabulary_path: Path
    anthropic_api_key: str | None = field(default=None, repr=False)
    claude_model: str = "claude-haiku-4-5-20251001"

    @property
    def model_name(self) -> str:
        return f"clip:{self.clip_model}/{self.clip_pretrained}"


def load_settings(env: dict[str, str] | os._Environ[str] = os.environ) -> Settings:
    hosts = set(DEFAULT_IMAGE_HOSTS)
    # Design and reference images come from Supabase Storage (signed or public URLs).
    supabase = env.get("SUPABASE_URL")
    if supabase:
        host = urlparse(supabase).hostname
        if host:
            hosts.add(host)
    for extra in (env.get("AI_ALLOWED_IMAGE_HOSTS") or "").split(","):
        if extra.strip():
            hosts.add(extra.strip().lower())

    tagger = (env.get("AI_TAGGER") or "clip").strip().lower()
    if tagger not in {"clip", "claude"}:
        raise ValueError(f"AI_TAGGER must be 'clip' or 'claude', not {tagger!r}")

    return Settings(
        token=env.get("AI_SERVICE_TOKEN") or None,
        tagger=tagger,
        clip_model=env.get("AI_CLIP_MODEL") or "ViT-B-32",
        clip_pretrained=env.get("AI_CLIP_PRETRAINED") or "openai",
        device=env.get("AI_DEVICE") or "cpu",
        allowed_hosts=tuple(sorted(hosts)),
        max_image_bytes=int(env.get("AI_MAX_IMAGE_BYTES") or 15 * 1024 * 1024),
        preload=_flag(env.get("AI_PRELOAD_MODEL"), True),
        vocabulary_path=Path(env.get("AI_VOCABULARY_PATH") or ROOT / "vocabulary.json"),
        anthropic_api_key=env.get("ANTHROPIC_API_KEY") or None,
        claude_model=env.get("AI_CLAUDE_MODEL") or "claude-haiku-4-5-20251001",
    )
