"""Suggest tags, a style and alt text for one image, using only the vocabulary."""

from __future__ import annotations

import base64
import io
import json
from dataclasses import dataclass
from typing import Protocol

import numpy as np
from PIL import Image

from .embedder import Embedder, normalise
from .vocabulary import VocabGroup, Vocabulary


@dataclass(frozen=True)
class SuggestedTag:
    tag: str
    group: str
    label: str
    score: float


@dataclass(frozen=True)
class StyleGuess:
    value: str  # AbayaStyle, e.g. "BUTTERFLY"
    score: float


@dataclass(frozen=True)
class TagResult:
    tags: list[SuggestedTag]
    style: StyleGuess | None
    alt_text: str


class Tagger(Protocol):
    name: str

    def tag(self, image: Image.Image, image_features: np.ndarray) -> TagResult: ...


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max(axis=-1, keepdims=True)
    exp = np.exp(shifted)
    return exp / exp.sum(axis=-1, keepdims=True)


def build_alt_text(vocab: Vocabulary, tags: list[SuggestedTag], style: StyleGuess | None) -> str:
    """'Black butterfly abaya in crepe with embroidery and lace trim'."""
    by_group: dict[str, list[SuggestedTag]] = {}
    for t in tags:
        by_group.setdefault(t.group, []).append(t)

    def labels(code: str) -> list[str]:
        return [t.label.lower() for t in by_group.get(code, [])]

    words: list[str] = []
    words += labels("colour")[:1]
    if style:
        style_group = next((g for g in vocab.groups if g.is_style), None)
        match = next((t for t in (style_group.tags if style_group else ()) if t.style == style.value), None)
        if match:
            words.append(match.label.lower())
    words.append("abaya")
    sentence = " ".join(words)
    fabric = labels("fabric")[:1]
    if fabric:
        sentence += f" in {fabric[0]}"
    details = labels("embellishment") + labels("sleeve")
    if details:
        sentence += " with " + (" and ".join(details) if len(details) <= 2 else ", ".join(details[:-1]) + " and " + details[-1])
    return sentence[:1].upper() + sentence[1:]


class ClipTagger:
    """Zero-shot tagging: compares the image with a text description of every tag.

    Single-choice groups (colour, fabric…) pick the best tag if the model is sure enough;
    multi-choice groups (embellishment, occasion) test each tag against the group's
    'negative' description, e.g. 'a plain abaya with no decoration'.
    """

    name = "clip"

    def __init__(self, embedder: Embedder, vocab: Vocabulary) -> None:
        self._embedder = embedder
        self._vocab = vocab
        self._text: dict[str, np.ndarray] | None = None

    def _describe(self, text: str) -> np.ndarray:
        # Average the description over several phrasings (prompt ensembling).
        prompts = [template.format(text) for template in self._vocab.prompt_templates]
        return normalise(self._embedder.embed_texts(prompts).mean(axis=0))

    def _text_features(self) -> dict[str, np.ndarray]:
        if self._text is None:
            features: dict[str, np.ndarray] = {}
            for group in self._vocab.groups:
                for t in group.tags:
                    features[f"tag:{t.tag}"] = self._describe(t.text)
                if group.negative:
                    features[f"neg:{group.code}"] = self._describe(group.negative)
            self._text = features
        return self._text

    def warm_up(self) -> None:
        self._text_features()

    def _single(self, group: VocabGroup, image: np.ndarray, text: dict[str, np.ndarray]) -> list[tuple[str, float]]:
        matrix = np.stack([text[f"tag:{t.tag}"] for t in group.tags])
        probs = _softmax(self._embedder.logit_scale * (matrix @ image))
        best = int(np.argmax(probs))
        score = float(probs[best])
        return [(group.tags[best].tag, score)] if score >= group.min_score else []

    def _multi(self, group: VocabGroup, image: np.ndarray, text: dict[str, np.ndarray]) -> list[tuple[str, float]]:
        negative = float(text[f"neg:{group.code}"] @ image)
        found: list[tuple[str, float]] = []
        for t in group.tags:
            positive = float(text[f"tag:{t.tag}"] @ image)
            score = float(_softmax(self._embedder.logit_scale * np.array([positive, negative]))[0])
            if score >= group.min_score:
                found.append((t.tag, score))
        return sorted(found, key=lambda x: -x[1])[: group.max_tags]

    def tag(self, image: Image.Image, image_features: np.ndarray) -> TagResult:
        text = self._text_features()
        tags: list[SuggestedTag] = []
        style: StyleGuess | None = None
        for group in self._vocab.groups:
            picks = self._multi(group, image_features, text) if group.multi else self._single(group, image_features, text)
            for tag, score in picks:
                vocab_tag = next(t for t in group.tags if t.tag == tag)
                if group.is_style:
                    style = StyleGuess(value=vocab_tag.style or "OTHER", score=round(score, 3))
                    continue
                tags.append(SuggestedTag(tag=tag, group=group.code, label=vocab_tag.label, score=round(score, 3)))
        return TagResult(tags=tags, style=style, alt_text=build_alt_text(self._vocab, tags, style))


class ClaudeTagger:
    """Claude vision fills a strict form built from the vocabulary. Off unless AI_TAGGER=claude.

    Only design and reference images are ever sent; never customer photos.
    """

    name = "claude"

    def __init__(self, vocab: Vocabulary, api_key: str, model: str, client=None) -> None:
        if client is None:
            import anthropic  # optional dependency: pip install '.[claude]'

            client = anthropic.Anthropic(api_key=api_key)
        self._client = client
        self._vocab = vocab
        self._model = model

    def _tool(self) -> dict:
        properties: dict[str, dict] = {}
        for g in self._vocab.groups:
            values = [t.tag for t in g.tags]
            if g.multi:
                properties[g.code] = {"type": "array", "items": {"type": "string", "enum": values}, "description": g.label}
            else:
                properties[g.code] = {"type": ["string", "null"], "enum": [*values, None], "description": g.label}
        properties["alt_text"] = {"type": "string", "description": "One short sentence describing the abaya for a blind shopper."}
        return {
            "name": "describe_abaya",
            "description": "Record what the abaya in the image looks like, using only the allowed values. Use null or [] when unsure.",
            "input_schema": {"type": "object", "properties": properties, "required": list(properties)},
        }

    def tag(self, image: Image.Image, image_features: np.ndarray) -> TagResult:
        buffer = io.BytesIO()
        copy = image.copy()
        copy.thumbnail((1024, 1024))
        copy.save(buffer, format="JPEG", quality=88)
        response = self._client.messages.create(
            model=self._model,
            max_tokens=600,
            tools=[self._tool()],
            tool_choice={"type": "tool", "name": "describe_abaya"},
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(buffer.getvalue()).decode()},
                        },
                        {"type": "text", "text": "Describe this abaya for a made-to-order catalogue."},
                    ],
                }
            ],
        )
        block = next(b for b in response.content if getattr(b, "type", None) == "tool_use")
        data = block.input if isinstance(block.input, dict) else json.loads(block.input)

        tags: list[SuggestedTag] = []
        style: StyleGuess | None = None
        for g in self._vocab.groups:
            raw = data.get(g.code)
            chosen = raw if isinstance(raw, list) else ([raw] if raw else [])
            for value in chosen:
                vocab_tag = next((t for t in g.tags if t.tag == value), None)
                if vocab_tag is None:
                    continue  # the enum should prevent this; never trust it blindly
                if g.is_style:
                    style = StyleGuess(value=vocab_tag.style or "OTHER", score=0.9)
                else:
                    tags.append(SuggestedTag(tag=vocab_tag.tag, group=g.code, label=vocab_tag.label, score=0.9))
        alt = str(data.get("alt_text") or "").strip()[:200] or build_alt_text(self._vocab, tags, style)
        return TagResult(tags=tags, style=style, alt_text=alt)
