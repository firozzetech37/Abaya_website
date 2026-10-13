"""Abaya AI service: image fingerprints (duplicate detection) and tag suggestions.

Private: only apps/api calls it, with a shared bearer token. It has no database;
the API sends a short-lived image URL and stores what comes back.
"""

from __future__ import annotations

import hmac
import logging
import threading
from contextlib import asynccontextmanager
from dataclasses import dataclass

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from .config import Settings, load_settings
from .embedder import ClipEmbedder, Embedder
from .images import ImageFetchError, fetch_image, perceptual_hash
from .taggers import ClaudeTagger, ClipTagger, Tagger
from .vocabulary import Vocabulary, load_vocabulary

log = logging.getLogger("abaya.ai")


class AnalyzeRequest(BaseModel):
    image_url: str = Field(min_length=8, max_length=4000)


class TagOut(BaseModel):
    tag: str
    group: str
    label: str
    score: float


class StyleOut(BaseModel):
    value: str
    score: float


class AnalyzeResponse(BaseModel):
    model: str
    tagger: str
    vocabulary_version: str
    embedding: list[float]
    phash: str
    width: int
    height: int
    tags: list[TagOut]
    style: StyleOut | None
    alt_text: str


@dataclass
class Services:
    settings: Settings
    vocabulary: Vocabulary
    embedder: Embedder
    tagger: Tagger
    http: httpx.AsyncClient
    load_error: str | None = None


def build_services(settings: Settings, embedder: Embedder | None = None, http: httpx.AsyncClient | None = None) -> Services:
    vocabulary = load_vocabulary(settings.vocabulary_path)
    embedder = embedder or ClipEmbedder(settings.clip_model, settings.clip_pretrained, settings.device)
    if settings.tagger == "claude":
        if not settings.anthropic_api_key:
            raise RuntimeError("AI_TAGGER=claude needs ANTHROPIC_API_KEY")
        tagger: Tagger = ClaudeTagger(vocabulary, settings.anthropic_api_key, settings.claude_model)
    else:
        tagger = ClipTagger(embedder, vocabulary)
    return Services(
        settings=settings,
        vocabulary=vocabulary,
        embedder=embedder,
        tagger=tagger,
        # Image CDNs (Wikimedia, Pinterest) refuse clients without a descriptive User-Agent.
        http=http
        or httpx.AsyncClient(
            timeout=httpx.Timeout(20.0, connect=5.0),
            headers={"User-Agent": "AbayaAtelier-AI/1.0 (catalogue image analysis)"},
        ),
    )


def _preload(services: Services) -> None:
    try:
        services.embedder.load()
        if isinstance(services.tagger, ClipTagger):
            services.tagger.warm_up()
        log.info("AI model ready: %s (tagger: %s)", services.embedder.name, services.tagger.name)
    except Exception as e:  # keep serving /health so the problem is visible
        services.load_error = f"{e.__class__.__name__}: {e}"
        log.exception("Could not load the AI model")


def create_app(services: Services | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if app.state.services is None:
            app.state.services = build_services(load_settings())
        s: Services = app.state.services
        if not s.settings.token:
            log.warning("AI_SERVICE_TOKEN is not set: every /v1 request will be refused")
        if s.settings.preload:
            threading.Thread(target=_preload, args=(s,), daemon=True).start()
        yield
        await s.http.aclose()

    app = FastAPI(title="Abaya AI service", version="1.0.0", lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.services = services

    def get_services() -> Services:
        return app.state.services

    def require_token(authorization: str | None = Header(default=None), s: Services = Depends(get_services)) -> None:
        expected = s.settings.token
        given = (authorization or "").removeprefix("Bearer ").strip()
        if not expected or not hmac.compare_digest(given.encode(), expected.encode()):
            raise HTTPException(status_code=401, detail="Invalid or missing token")

    @app.get("/health")
    def health(s: Services = Depends(get_services)) -> dict:
        return {
            "status": "ok" if not s.load_error else "error",
            "model": s.embedder.name,
            "tagger": s.tagger.name,
            "loaded": s.embedder.loaded,
            "vocabulary_version": s.vocabulary.version,
            "error": s.load_error,
        }

    @app.post("/v1/analyze", response_model=AnalyzeResponse, dependencies=[Depends(require_token)])
    async def analyze(body: AnalyzeRequest, s: Services = Depends(get_services)) -> AnalyzeResponse:
        try:
            image, _ = await fetch_image(
                body.image_url,
                allowed_hosts=s.settings.allowed_hosts,
                max_bytes=s.settings.max_image_bytes,
                client=s.http,
            )
        except ImageFetchError as e:
            # 422: this image will never work. 502: try again later (the API retries with a fresh URL).
            raise HTTPException(status_code=422 if e.permanent else 502, detail=str(e)) from e

        def work() -> AnalyzeResponse:
            features = s.embedder.embed_image(image)
            result = s.tagger.tag(image, features)
            return AnalyzeResponse(
                model=s.embedder.name,
                tagger=s.tagger.name,
                vocabulary_version=s.vocabulary.version,
                embedding=[round(float(x), 6) for x in features],
                phash=perceptual_hash(image),
                width=image.width,
                height=image.height,
                tags=[TagOut(**t.__dict__) for t in result.tags],
                style=StyleOut(**result.style.__dict__) if result.style else None,
                alt_text=result.alt_text,
            )

        try:
            return await run_in_threadpool(work)
        except Exception as e:
            log.exception("Analysis failed")
            raise HTTPException(status_code=503, detail=f"Analysis failed: {e.__class__.__name__}") from e

    return app


app = create_app()
