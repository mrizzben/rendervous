"""Refresh and validate OpenRouter's image-model catalog."""

import json
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

API = "https://openrouter.ai/api/v1"
REFRESH_INTERVAL_SECONDS = 24 * 60 * 60
UNIT_PRIORITY = ["image", "megapixel", "token"]


def output_price(endpoints: list) -> tuple[float | None, str | None]:
    """Return the cheapest output-image price, preferring natural units."""
    lines = []
    for endpoint in endpoints:
        if not isinstance(endpoint, dict):
            continue
        prices = endpoint.get("pricing")
        if not isinstance(prices, list):
            continue
        for price in prices:
            if not isinstance(price, dict) or price.get("billable") != "output_image":
                continue
            unit = price.get("unit")
            if unit not in UNIT_PRIORITY:
                continue
            try:
                cost = float(price["cost_usd"])
            except (KeyError, TypeError, ValueError):
                continue
            lines.append((UNIT_PRIORITY.index(unit), cost, bool(price.get("variant"))))
    if not lines:
        return None, None
    best_unit = min(line[0] for line in lines)
    candidates = [(cost, variant) for unit, cost, variant in lines if unit == best_unit]
    base_prices = [cost for cost, variant in candidates if not variant]
    return min(base_prices or [cost for cost, _ in candidates]), UNIT_PRIORITY[best_unit]


def load_catalog(path: str | Path) -> list[dict]:
    """Read a valid, non-empty catalog from disk."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValueError(f"invalid catalog at {path}: {exc}") from exc
    models = data.get("models") if isinstance(data, dict) else None
    if not isinstance(models, list) or not models:
        raise ValueError("catalog must contain at least one model")
    if any(
        not isinstance(model, dict) or not model.get("id") or not model.get("name")
        for model in models
    ):
        raise ValueError("catalog contains a model without an id or name")
    return models


def _model_endpoints(model_id: str) -> list:
    try:
        response = requests.get(
            f"{API}/images/models/{model_id}/endpoints", timeout=(3, 8)
        )
        response.raise_for_status()
        endpoints = response.json().get("endpoints") or []
        return endpoints if isinstance(endpoints, list) else []
    except (requests.RequestException, ValueError, AttributeError):
        return []


def fetch_catalog() -> dict:
    """Fetch model names and provider pricing from OpenRouter."""
    response = requests.get(f"{API}/images/models", timeout=(3, 10))
    response.raise_for_status()
    payload = response.json()
    entries = payload.get("data") if isinstance(payload, dict) else None
    entries = [
        model for model in entries or []
        if isinstance(model, dict) and isinstance(model.get("id"), str) and model["id"]
    ]
    if not entries:
        raise ValueError("OpenRouter returned an empty image-model list")

    with ThreadPoolExecutor(max_workers=8) as pool:
        endpoints = list(pool.map(_model_endpoints, [model["id"] for model in entries]))

    models = []
    for item, model_endpoints in zip(entries, endpoints, strict=True):
        price_usd, price_unit = output_price(model_endpoints)
        model_id = item["id"]
        models.append(
            {
                "id": model_id,
                "name": item.get("name") or model_id,
                "price_usd": price_usd,
                "price_unit": price_unit,
            }
        )
    models.sort(key=lambda model: model["id"])
    return {"models": models}


def refresh_catalog(
    path: str | Path,
    max_age_seconds: int = REFRESH_INTERVAL_SECONDS,
    force: bool = False,
) -> bool:
    """Refresh a stale catalog atomically; return whether it was updated."""
    destination = Path(path)
    if not force and destination.is_file():
        try:
            load_catalog(destination)
            fresh = (
                max_age_seconds > 0
                and time.time() - destination.stat().st_mtime < max_age_seconds
            )
        except (OSError, ValueError, KeyError, TypeError):
            fresh = False
        if fresh:
            return False

    catalog = fetch_catalog()
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=destination.parent,
            prefix=f".{destination.name}.",
            suffix=".tmp",
            delete=False,
        ) as temp:
            temp_path = temp.name
            json.dump(catalog, temp, indent=1)
            temp.write("\n")
            temp.flush()
            os.fsync(temp.fileno())
        os.replace(temp_path, destination)
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)
    return True
