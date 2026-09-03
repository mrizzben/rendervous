"""OpenRouter client for Rendervous.

Image generation happens through the chat-completions endpoint with modalities
["image","text"] (verified live: response image is at
message.images[0].image_url.url as a base64 data URL).

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


def _to_float(v):
    """OpenRouter returns prices as strings ("0.0032"); parse to float or pass through."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return v


def list_models(api_key=None, force=False):
    """Image-capable models (image input AND image output), cached 1h.

    Returns list of {id, name, recommended, input_price, image_price,
    context_length}. Sorted by recommended first, then image_price, then id.
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
        f"{API_URL}/models",
        headers={"Authorization": f"Bearer {key}"} if key else {},
        timeout=30,
    )
    if resp.status_code != 200:
        raise OpenRouterError(
            f"failed to list models: HTTP {resp.status_code} {resp.text[:300]}"
        )

    models = []
    for m in resp.json().get("data", []):
        arch = m.get("architecture") or {}
        in_mods = arch.get("input_modalities") or []
        out_mods = arch.get("output_modalities") or []
        if "image" not in in_mods or "image" not in out_mods:
            continue
        pricing = m.get("pricing") or {}
        # OpenRouter returns prices as strings ("0.0032"); coerce to float
        # so clients can do numeric math (sorting, .toFixed display).
        def to_float(v):
            try:
                return float(v)
            except (TypeError, ValueError):
                return v

        models.append(
            {
                "id": m["id"],
                "name": m.get("name") or m["id"],
                "recommended": m["id"] in RECOMMENDED,
                "input_price": to_float(pricing.get("prompt")),
                "image_price": to_float(pricing.get("image")),
                "context_length": m.get("context_length"),
            }
        )
    models.sort(
        key=lambda x: (
            not x["recommended"],
            x["image_price"] if isinstance(x["image_price"], (int, float)) else 1e9,
            x["id"],
        )
    )
    db.set_cache(MODEL_CACHE_KEY, json.dumps(models))
    return models


def generate(
    model,
    prompt,
    image_url=None,
    api_key=None,
    width=None,
    height=None,
    steps=None,
    cfg=None,
    denoise=None,
    seed=None,
) -> bytes:
    """Call OpenRouter image generation.

    image_url: optional data URL of the reference image (img2img), or "" for
    pure text-to-image. The model list guarantees image input+output support,
    so txt2img just omits the image part.
    Returns the decoded output PNG/JPEG bytes.
    """
    key = resolve_key(api_key)
    if not key:
        raise OpenRouterError(
            "No OpenRouter API key configured. Set OPENROUTER_API_KEY or pass "
            "your key (X-OpenRouter-Key header / api_key field). Your key is "
            "never stored."
        )

    content = []
    if image_url:
        content.append({"type": "image_url", "image_url": {"url": image_url}})
    content.append({"type": "text", "text": prompt})

    body = {
        "model": model or DEFAULT_MODEL,
        "messages": [{"role": "user", "content": content}],
        "modalities": ["image", "text"],
    }
    # A1111-style knobs mapped onto the handful OpenRouter image models accept.
    # gemini ignores unknown fields safely; we pass what applies.
    steps_i = _to_int(steps)
    if steps_i:
        body["max_tokens"] = steps_i * 100
    seed_i = _to_int(seed)
    if seed_i is not None and seed_i != -1:
        body["seed"] = seed_i

    resp = requests.post(
        f"{API_URL}/chat/completions",
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
        images = data["choices"][0]["message"]["images"]
        url = images[0]["image_url"]["url"]
    except (KeyError, IndexError, TypeError) as e:
        raise OpenRouterError(f"Unexpected OpenRouter response: {e}") from e

    if url.startswith("data:"):
        b64 = url.split(",", 1)[1]
        return base64.b64decode(b64)
    # Remote URL (rare): fetch it.
    img_resp = requests.get(url, timeout=60)
    img_resp.raise_for_status()
    return img_resp.content
