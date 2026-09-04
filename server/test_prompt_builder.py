"""Lamp temperature applies only for night/sunset lighting (UI.md)."""

from prompt_builder import build_prompt

_BASE = {
    "fidelity": 90,
    "style": "photoreal",
    "material": "original",
    "environment": "none",
}


def test_lamp_temp_ignored_outside_night_sunset():
    for lighting in ("daylight", "overcast", "golden_hour"):
        p = build_prompt({**_BASE, "lighting": lighting, "lamp_temp": 3000})
        assert "artificial light sources" not in p.lower(), lighting


def test_lamp_temp_kept_for_night_and_sunset():
    for lighting in ("night", "sunset"):
        p = build_prompt({**_BASE, "lighting": lighting, "lamp_temp": 3000})
        assert "approximately 3000K" in p, lighting


def test_no_lamp_temp_still_fine():
    p = build_prompt({**_BASE, "lighting": "night"})
    assert "approximately" not in p
