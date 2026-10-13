import httpx
import pytest
from fastapi.testclient import TestClient

from app.images import ImageFetchError, check_url, decode_image, perceptual_hash
from app.main import build_services, create_app

from .conftest import jpeg_bytes

IMAGE_URL = "https://project.supabase.co/storage/v1/object/sign/private/designs/a.jpg?token=x"


def storage(routes: dict[str, httpx.Response]) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        return routes.get(str(request.url), httpx.Response(404))

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.fixture
def make_client(settings, embedder):
    def make(routes: dict[str, httpx.Response]) -> TestClient:
        services = build_services(settings, embedder=embedder, http=storage(routes))
        return TestClient(create_app(services))

    return make


AUTH = {"Authorization": "Bearer test-token"}


def test_health_needs_no_token(make_client):
    with make_client({}) as client:
        body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["tagger"] == "clip"


def test_analyze_requires_the_shared_token(make_client):
    with make_client({}) as client:
        assert client.post("/v1/analyze", json={"image_url": IMAGE_URL}).status_code == 401
        assert client.post("/v1/analyze", json={"image_url": IMAGE_URL}, headers={"Authorization": "Bearer nope"}).status_code == 401


def test_analyze_returns_fingerprint_and_suggestions(make_client, embedder):
    with make_client({IMAGE_URL: httpx.Response(200, content=jpeg_bytes())}) as client:
        response = client.post("/v1/analyze", json={"image_url": IMAGE_URL}, headers=AUTH)
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["embedding"]) == embedder.dimensions
    assert abs(sum(x * x for x in body["embedding"]) - 1) < 1e-3  # unit length
    assert len(body["phash"]) == 16
    assert (body["width"], body["height"]) == (120, 180)
    assert body["model"] == "fake:test"
    assert isinstance(body["alt_text"], str)


def test_bad_images_fail_permanently_and_missing_ones_are_retried(make_client):
    routes = {
        IMAGE_URL: httpx.Response(200, content=b"not an image"),
        IMAGE_URL + "2": httpx.Response(403),
    }
    with make_client(routes) as client:
        assert client.post("/v1/analyze", json={"image_url": IMAGE_URL}, headers=AUTH).status_code == 422
        assert client.post("/v1/analyze", json={"image_url": IMAGE_URL + "2"}, headers=AUTH).status_code == 502
        other_host = "https://evil.example.com/a.jpg"
        assert client.post("/v1/analyze", json={"image_url": other_host}, headers=AUTH).status_code == 422


def test_only_https_urls_on_allowed_hosts():
    hosts = ("project.supabase.co",)
    check_url("https://project.supabase.co/x.jpg", hosts)
    with pytest.raises(ImageFetchError):
        check_url("http://project.supabase.co/x.jpg", hosts)
    with pytest.raises(ImageFetchError):
        check_url("https://169.254.169.254/latest/meta-data", hosts)


def test_perceptual_hash_survives_recompression():
    original = decode_image(jpeg_bytes())
    import io

    buffer = io.BytesIO()
    original.resize((60, 90)).save(buffer, format="JPEG", quality=50)
    copy = decode_image(buffer.getvalue())
    import imagehash

    assert imagehash.hex_to_hash(perceptual_hash(original)) - imagehash.hex_to_hash(perceptual_hash(copy)) <= 4
