"""The tag list the AI may suggest from (vocabulary.json)."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

TAG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
STYLES = {"CLOSED", "OPEN_FRONT", "BUTTERFLY", "KIMONO", "BISHT", "KAFTAN", "OTHER"}


@dataclass(frozen=True)
class VocabTag:
    tag: str
    label: str
    text: str
    style: str | None = None


@dataclass(frozen=True)
class VocabGroup:
    code: str
    label: str
    multi: bool
    min_score: float
    tags: tuple[VocabTag, ...]
    negative: str | None = None
    #: Multi-choice groups suggest at most this many tags (the strongest), so busy images are not flooded.
    max_tags: int = 3

    @property
    def is_style(self) -> bool:
        return any(t.style for t in self.tags)


@dataclass(frozen=True)
class Vocabulary:
    version: str
    prompt_templates: tuple[str, ...]
    groups: tuple[VocabGroup, ...]
    fingerprint: str

    def group(self, code: str) -> VocabGroup | None:
        return next((g for g in self.groups if g.code == code), None)

    def find(self, tag: str) -> tuple[VocabGroup, VocabTag] | None:
        for g in self.groups:
            for t in g.tags:
                if t.tag == tag:
                    return g, t
        return None


def parse_vocabulary(raw: dict) -> Vocabulary:
    templates = tuple(raw.get("prompt_templates") or ["a photo of {}"])
    if not all("{}" in t for t in templates):
        raise ValueError("Every prompt template needs a {} placeholder")

    seen: set[str] = set()
    groups: list[VocabGroup] = []
    for g in raw["groups"]:
        tags: list[VocabTag] = []
        for t in g["tags"]:
            tag = t["tag"]
            if not TAG_PATTERN.match(tag) or len(tag) > 30:
                raise ValueError(f"Tag {tag!r} must be lowercase words joined by dashes, at most 30 characters")
            if tag in seen:
                raise ValueError(f"Tag {tag!r} appears twice")
            if t.get("style") and t["style"] not in STYLES:
                raise ValueError(f"Unknown style {t['style']!r} on tag {tag!r}")
            seen.add(tag)
            tags.append(VocabTag(tag=tag, label=t["label"], text=t["text"], style=t.get("style")))
        if not tags:
            raise ValueError(f"Group {g['code']!r} has no tags")
        multi = bool(g.get("multi", False))
        if multi and not g.get("negative"):
            raise ValueError(f"Multi-choice group {g['code']!r} needs a 'negative' description")
        score = float(g.get("min_score", 0.5))
        if not 0 < score < 1:
            raise ValueError(f"min_score of {g['code']!r} must be between 0 and 1")
        max_tags = int(g.get("max_tags", 3))
        if max_tags < 1:
            raise ValueError(f"max_tags of {g['code']!r} must be at least 1")
        groups.append(
            VocabGroup(
                code=g["code"],
                label=g["label"],
                multi=multi,
                min_score=score,
                tags=tuple(tags),
                negative=g.get("negative"),
                max_tags=max_tags,
            )
        )

    fingerprint = hashlib.sha256(json.dumps(raw, sort_keys=True).encode()).hexdigest()[:12]
    return Vocabulary(
        version=str(raw.get("version", "1")),
        prompt_templates=templates,
        groups=tuple(groups),
        fingerprint=fingerprint,
    )


def load_vocabulary(path: Path) -> Vocabulary:
    return parse_vocabulary(json.loads(path.read_text(encoding="utf-8")))
