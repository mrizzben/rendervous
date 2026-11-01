"""Smoke-check catalog refresh; run `.venv/bin/python -m server.test_model_catalog`."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

import requests

from server import openrouter
from server.model_catalog import load_catalog, refresh_catalog


def test_refresh_catalog() -> None:
    with TemporaryDirectory() as tmp:
        path = Path(tmp) / "models_catalog.json"
        models_response = Mock()
        models_response.json.return_value = {
            "data": [{"id": "example/image", "name": "Example Image"}]
        }
        prices_response = Mock()
        prices_response.json.return_value = {
            "endpoints": [
                {
                    "pricing": [
                        {
                            "billable": "output_image",
                            "unit": "image",
                            "cost_usd": "0.04",
                        }
                    ]
                }
            ]
        }

        def fake_get(url: str, timeout):
            return models_response if url.endswith("/images/models") else prices_response

        with patch("server.model_catalog.requests.get", side_effect=fake_get):
            assert refresh_catalog(path, force=True)

        model = load_catalog(path)[0]
        assert model["id"] == "example/image"
        assert model["price_usd"] == 0.04
        assert model["price_unit"] == "image"

        with patch("server.model_catalog.requests.get") as get_request:
            assert not refresh_catalog(path)
            get_request.assert_not_called()

        last_good = path.read_bytes()
        with patch(
            "server.model_catalog.requests.get",
            side_effect=requests.ConnectionError("offline"),
        ):
            try:
                refresh_catalog(path, force=True)
            except requests.ConnectionError:
                pass
            else:
                raise AssertionError("offline refresh should report failure")
        assert path.read_bytes() == last_good


def test_runtime_cache_falls_back_to_bundle() -> None:
    with TemporaryDirectory() as tmp:
        cache = Path(tmp) / "cache.json"
        bundled = Path(tmp) / "bundled.json"
        cache.write_text(json.dumps({"models": [{"id": "cached", "name": "Cached"}]}))
        bundled.write_text(json.dumps({"models": [{"id": "bundled", "name": "Bundled"}]}))
        with patch.object(openrouter, "CACHE_CATALOG_PATH", str(cache)), patch.object(
            openrouter, "CATALOG_PATH", str(bundled)
        ):
            assert openrouter.list_models()[0]["id"] == "cached"
            cache.write_text("not json")
            assert openrouter.list_models()[0]["id"] == "bundled"


if __name__ == "__main__":
    test_refresh_catalog()
    test_runtime_cache_falls_back_to_bundle()
    print("model catalog refresh/cache ok")
