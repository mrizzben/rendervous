#!/usr/bin/env python3
"""Regenerate the bundled model catalog from OpenRouter.

The running app refreshes a writable cache at startup and daily. This command
updates the bundled fallback used by new releases.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from server.model_catalog import load_catalog, refresh_catalog  # noqa: E402

OUT = ROOT / "server" / "models_catalog.json"


def main() -> None:
    refresh_catalog(OUT, force=True)
    models = load_catalog(OUT)
    priced = sum(1 for model in models if model.get("price_usd") is not None)
    print(f"wrote {len(models)} models to {OUT} ({priced} priced)")


if __name__ == "__main__":
    main()
