# Abaya AI service (CPU). Build: docker build -t abaya-ai services/ai
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models
WORKDIR /srv

# CPU-only torch keeps the image small (no CUDA libraries).
RUN pip install --index-url https://download.pytorch.org/whl/cpu "torch>=2.5"
COPY pyproject.toml ./
COPY app ./app
COPY vocabulary.json ./
RUN pip install . \
 # Bake the CLIP weights into the image so containers start without downloading.
 && python -c "import open_clip; open_clip.create_model_and_transforms('ViT-B-32', pretrained='openai')"

RUN useradd --create-home --uid 10001 ai && chown -R ai /srv /models
USER ai
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
