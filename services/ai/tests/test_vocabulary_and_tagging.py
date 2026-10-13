import copy
import json

import numpy as np
import pytest
from PIL import Image

from app.embedder import normalise
from app.taggers import ClaudeTagger, ClipTagger, StyleGuess, SuggestedTag, build_alt_text
from app.vocabulary import load_vocabulary, parse_vocabulary

from .conftest import ROOT


@pytest.fixture
def vocab():
    return load_vocabulary(ROOT / "vocabulary.json")


def described(embedder, vocab, text):
    """The image feature a perfect match for `text` would have (same prompt ensembling as ClipTagger)."""
    return normalise(embedder.embed_texts([t.format(text) for t in vocab.prompt_templates]).mean(axis=0))


def test_shipped_vocabulary_is_valid(vocab):
    tags = [t.tag for g in vocab.groups for t in g.tags]
    assert len(tags) == len(set(tags))
    assert {g.code for g in vocab.groups} >= {"style", "colour", "fabric", "embellishment"}
    assert all(len(t) <= 30 for t in tags)


def test_vocabulary_rules_are_enforced():
    raw = json.loads((ROOT / "vocabulary.json").read_text())
    bad_tag = copy.deepcopy(raw)
    bad_tag["groups"][1]["tags"][0]["tag"] = "Black Abaya"
    with pytest.raises(ValueError, match="lowercase"):
        parse_vocabulary(bad_tag)
    dup = copy.deepcopy(raw)
    dup["groups"][1]["tags"].append(dict(dup["groups"][1]["tags"][0]))
    with pytest.raises(ValueError, match="twice"):
        parse_vocabulary(dup)
    no_negative = copy.deepcopy(raw)
    del next(g for g in no_negative["groups"] if g["multi"])["negative"]
    with pytest.raises(ValueError, match="negative"):
        parse_vocabulary(no_negative)


def test_clip_tagger_picks_the_matching_colour_and_style(embedder, vocab):
    tagger = ClipTagger(embedder, vocab)
    colour = described(embedder, vocab, "a black abaya")
    style = described(embedder, vocab, vocab.find("butterfly")[1].text)
    features = normalise(colour + style)
    result = tagger.tag(Image.new("RGB", (4, 4)), features)

    assert "black" in [t.tag for t in result.tags]
    assert result.style == StyleGuess(value="BUTTERFLY", score=result.style.score)
    assert result.style.score >= 0.5
    # The style is reported separately, never as a tag.
    assert "butterfly" not in [t.tag for t in result.tags]
    assert result.alt_text.startswith("Black butterfly abaya")


def test_clip_tagger_stays_quiet_when_unsure(embedder, vocab):
    tagger = ClipTagger(embedder, vocab)
    # An image the model finds equally close to every description: nothing clears the bars.
    result = tagger.tag(Image.new("RGB", (4, 4)), np.zeros(embedder.dimensions))
    assert result.tags == []
    assert result.style is None
    assert result.alt_text == "Abaya"


def test_multi_choice_groups_can_suggest_several_tags(embedder, vocab):
    tagger = ClipTagger(embedder, vocab)
    features = normalise(
        described(embedder, vocab, vocab.find("embroidery")[1].text) + described(embedder, vocab, vocab.find("lace-trim")[1].text)
    )
    tags = [t.tag for t in tagger.tag(Image.new("RGB", (4, 4)), features).tags if t.group == "embellishment"]
    assert set(tags) >= {"embroidery", "lace-trim"}


def test_multi_choice_groups_are_capped(embedder, vocab):
    tagger = ClipTagger(embedder, vocab)
    group = vocab.group("embellishment")
    # An image that looks like every embellishment at once.
    features = normalise(sum(described(embedder, vocab, t.text) for t in group.tags))
    tags = [t for t in tagger.tag(Image.new("RGB", (4, 4)), features).tags if t.group == "embellishment"]
    assert len(tags) == group.max_tags == 3
    assert tags == sorted(tags, key=lambda t: -t.score)


def test_alt_text_reads_naturally(vocab):
    tags = [
        SuggestedTag("navy", "colour", "Navy", 0.9),
        SuggestedTag("crepe", "fabric", "Crepe", 0.7),
        SuggestedTag("embroidery", "embellishment", "Embroidery", 0.8),
        SuggestedTag("lace-trim", "embellishment", "Lace trim", 0.7),
        SuggestedTag("bell-sleeves", "sleeve", "Bell sleeves", 0.6),
    ]
    text = build_alt_text(vocab, tags, StyleGuess("KIMONO", 0.6))
    assert text == "Navy kimono abaya in crepe with embroidery, lace trim and bell sleeves"
    assert build_alt_text(vocab, [], None) == "Abaya"


class _Block:
    type = "tool_use"

    def __init__(self, data):
        self.input = data


class _FakeAnthropic:
    def __init__(self, data):
        self.data = data
        self.calls = []
        self.messages = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return type("R", (), {"content": [_Block(self.data)]})()


def test_claude_tagger_maps_the_form_to_the_vocabulary(vocab):
    client = _FakeAnthropic(
        {"style": "kimono", "colour": "navy", "embellishment": ["embroidery", "not-a-tag"], "fabric": None, "alt_text": "A navy kimono abaya."}
    )
    tagger = ClaudeTagger(vocab, api_key="unused", model="claude-haiku-4-5-20251001", client=client)
    result = tagger.tag(Image.new("RGB", (64, 64), "navy"), np.zeros(4))

    assert result.style.value == "KIMONO"
    assert [t.tag for t in result.tags] == ["navy", "embroidery"]  # unknown values are dropped
    assert result.alt_text == "A navy kimono abaya."
    tool = client.calls[0]["tools"][0]
    assert "navy" in tool["input_schema"]["properties"]["colour"]["enum"]
    assert client.calls[0]["model"] == "claude-haiku-4-5-20251001"
