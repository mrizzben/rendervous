"""OpenRouter client for Rendervous.

Uses the dedicated image endpoints: GET /api/v1/images/models to list
image-generation models, POST /api/v1/images to generate (response image is
at data[0].b64_json). Reference images (img2img) go in input_references.

Users bring their own API key: pass api_key per call; we never store it. When
omitted we fall back to the OPENROUTER_API_KEY env var.
"""

import base64
import json
import os
import time

import requests

from . import db

API_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "google/gemini-2.5-flash-image"
RECOMMENDED = {
    "google/gemini-2.5-flash-image",
    "google/gemini-3.1-flash-image",
}
MODEL_CACHE_KEY = "models"
MODEL_CACHE_TTL = 3600


class OpenRouterError(Exception):
    """Raised when OpenRouter returns a non-200 or a malformed response."""


def resolve_key(api_key):
    """Per-request key wins; env var is the fallback. Never persisted."""
    if api_key:
        return api_key
    return os.environ.get("OPENROUTER_API_KEY", "")


def _to_int(v):
    """Coerce job-param values (may be floats/strings from JSON) to int or None."""
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def list_models(api_key=None, force=False):
    """Image-generation models from the dedicated list endpoint, cached 1h.

    Returns list of {id, name, recommended, input_price, image_price,
    context_length}. The images/models endpoint carries no pricing, so the
    price fields are null; clients show "—" and sort by id.
    Sorted by recommended first, then id.
    """
    key = resolve_key(api_key)
    cached = None if force else db.get_cache(MODEL_CACHE_KEY)
    if cached:
        payload, fetched_at = cached
        try:
            if int(time.time()) - fetched_at < MODEL_CACHE_TTL:
                return json.loads(payload)
        except (ValueError, TypeError):
            pass  # corrupt cache line — fall through to a fresh fetch

    resp = requests.get(
        f"{API_URL}/images/models",
        headers={"Authorization": f"Bearer {key}"} if key else {},
        timeout=30,
    )
    if resp.status_code != 200:
        raise OpenRouterError(
            f"failed to list models: HTTP {resp.status_code} {resp.text[:300]}"
        )

    # No modality filtering needed: this endpoint only returns image models.
    models = [
        {
            "id": m["id"],
            "name": m.get("name") or m["id"],
            "recommended": m["id"] in RECOMMENDED,
            "input_price": None,
            "image_price": None,
            "context_length": None,
        }
        for m in resp.json().get("data", [])
    ]
    models.sort(key=lambda x: (not x["recommended"], x["id"]))
    db.set_cache(MODEL_CACHE_KEY, json.dumps(models))
    return models


def generate(
    model,
    prompt,
    image_url=None,
    api_key=None,
    seed=None,
) -> bytes:
    """Call the OpenRouter image generation endpoint (POST /images).

    image_url: optional data URL of the reference image (img2img, mapped to
    input_references), or ""/None for pure text-to-image.
    Returns the decoded output PNG bytes (data[0].b64_json).
    """
    key = resolve_key(api_key)
    if not key:
        raise OpenRouterError(
            "No OpenRouter API key configured. Set OPENROUTER_API_KEY or pass "
            "your key (X-OpenRouter-Key header / api_key field). Your key is "
            "never stored."
        )

    body = {
        "model": model or DEFAULT_MODEL,
        "prompt": prompt,
        "n": 1,
        "output_format": "png",
    }
    if image_url:
        body["input_references"] = [
            {"type": "image_url", "image_url": {"url": image_url}}
        ]
    seed_i = _to_int(seed)
    if seed_i is not None and seed_i != -1:
        body["seed"] = seed_i

    resp = requests.post(
        f"{API_URL}/images",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=300,
    )
    if resp.status_code != 200:
        detail = ""
        try:
            detail = resp.json().get("error", {}).get("message", resp.text[:400])
        except Exception:
            detail = resp.text[:400]
        raise OpenRouterError(f"OpenRouter error {resp.status_code}: {detail}")

    data = resp.json()
    try:
        b64 = data["data"][0]["b64_json"]
    except (KeyError, IndexError, TypeError) as e:
        raise OpenRouterError(f"Unexpected OpenRouter response: {e}") from e
    return base64.b64decode(b64)
