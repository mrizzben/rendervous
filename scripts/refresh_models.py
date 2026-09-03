#!/usr/bin/env python3
"""Regenerate server/models_catalog.json from OpenRouter.

Run regularly (weekly cron, or manually) to refresh image model names/prices:
    python3 scripts/refresh_models.py

Uses the documented dedicated Image API (openrouter.ai/docs/guides/overview/
multimodal/image-generation):
    GET /api/v1/images/models                     -> image model list
    GET /api/v1/images/models/{id}/endpoints      -> per-provider pricing

Pricing lines are billable=output_image with unit=image | megapixel | token
and an optional resolution variant. The catalog stores the resolved display
price: cheapest non-variant line (or cheapest variant if none) in the natural
unit (USD/image, USD/megapixel, USD/token). Clients display token prices as
per-million. Models with no output_image pricing get price_usd=null ("—").

The bundled catalog is served by /api/models without any live OpenRouter call.
"""

import json
from pathlib import Path

import requests

API = "https://openrouter.ai/api/v1"
OUT = Path(__file__).resolve().parent.parent / "server" / "models_catalog.json"

# Prefer per-image pricing; megapixel (flux) and token (google/openai/msft)
# models fall back in order. A per-image answer is what we show in the path.
UNIT_PRIORITY = ["image", "megapixel", "token"]


def output_price(endpoints: list) -> tuple[float | None, str | None]:
    """Cheapest output_image line across endpoints.

    Returns (cost_usd, unit). Picks the cheapest non-variant line when one
    exists, else the cheapest variant line (e.g. grok-imagine lists only
    low/medium tiers). Unit priority image > megapixel > token.
    """
    lines = []  # (priority, cost, is_variant)
    for ep in endpoints:
        for p in ep.get("pricing", []):
            if p.get("billable") != "output_image":
                continue
            unit = p.get("unit")
            if unit not in UNIT_PRIORITY:
                continue
            try:
                cost = float(p["cost_usd"])
            except (KeyError, TypeError, ValueError):
                continue
            lines.append((UNIT_PRIORITY.index(unit), cost, bool(p.get("variant"))))
    if not lines:
        return None, None
    best_unit = min(line[0] for line in lines)
    candidates = [(c, v) for u, c, v in lines if u == best_unit]
    base = [c for c, v in candidates if not v]
    pool = base if base else [c for c, _ in candidates]
    return min(pool), UNIT_PRIORITY[best_unit]


def main() -> None:
    resp = requests.get(f"{API}/images/models", timeout=30)
    resp.raise_for_status()
    session = requests.Session()
    models = []
    for m in resp.json().get("data", []):
        mid = m["id"]
        try:
            eps = (
                session.get(f"{API}/images/models/{mid}/endpoints", timeout=30)
                .json()
                .get("endpoints")
                or []
            )
        except requests.RequestException:
            eps = []
        price_usd, price_unit = output_price(eps)
        models.append(
            {
                "id": mid,
                "name": m.get("name") or mid,
                "price_usd": price_usd,
                "price_unit": price_unit,
            }
        )
    models.sort(key=lambda x: x["id"])
    OUT.write_text(json.dumps({"models": models}, indent=1) + "\n")
    n_priced = sum(1 for x in models if x["price_usd"] is not None)
    print(f"wrote {len(models)} models to {OUT} ({n_priced} priced)")


if __name__ == "__main__":
    main()
