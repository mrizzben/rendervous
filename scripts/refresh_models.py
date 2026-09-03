#!/usr/bin/env python3
"""Regenerate server/models_catalog.json from OpenRouter.

Run regularly (weekly cron, or manually) to refresh image model names/prices:
    python3 scripts/refresh_models.py

List + prices come from a single call:
    GET /api/v1/models?output_modalities=image&input_modalities=text,image
Price per image is pricing.image_output (USD per image). Models with no
published price get null and the UI shows "—". The bundled catalog is served
by /api/models without any live OpenRouter call.
"""

import json
from pathlib import Path

import requests

API = "https://openrouter.ai/api/v1"
OUT = Path(__file__).resolve().parent.parent / "server" / "models_catalog.json"


def main() -> None:
    resp = requests.get(
        f"{API}/models",
        params={"output_modalities": "image", "input_modalities": "text,image"},
        timeout=30,
    )
    resp.raise_for_status()
    models = []
    for m in resp.json().get("data", []):
        price = (m.get("pricing") or {}).get("image_output")
        try:
            image_price = float(price) if price else None
        except (TypeError, ValueError):
            image_price = None  # malformed price from upstream; show as "—"
        models.append(
            {
                "id": m["id"],
                "name": m.get("name") or m["id"],
                "image_price": image_price,
            }
        )
    models.sort(key=lambda x: x["id"])
    OUT.write_text(json.dumps({"models": models}, indent=1) + "\n")
    print(f"wrote {len(models)} models to {OUT}")


if __name__ == "__main__":
    main()
