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


def test_lighting_presets_bake_sun_elevation():
    assert "45–60°" in build_prompt({**_BASE, "lighting": "daylight"})
    assert "6–10°" in build_prompt({**_BASE, "lighting": "golden_hour"})
    assert "0–5°" in build_prompt({**_BASE, "lighting": "sunset"})


def test_sun_direction_raking_light():
    p = build_prompt({**_BASE, "lighting": "daylight", "sun_direction": "left"})
    assert "raking across the facade" in p


def test_sun_elevation_overrides_preset_height():
    p = build_prompt({**_BASE, "lighting": "golden_hour", "sun_elevation": 30})
    assert "exactly 30° above the horizon" in p


def test_sun_elevation_ignored_without_direct_sun():
    for lighting in ("overcast", "night"):
        p = build_prompt({**_BASE, "lighting": lighting, "sun_elevation": 30})
        assert "exactly 30°" not in p, lighting


def test_focal_length_and_f_stop():
    p = build_prompt({**_BASE, "lighting": "daylight", "focal_length": 35, "f_stop": 8})
    assert "35mm lens at f/8, sharp focus across the frame" in p


def test_focal_length_alone():
    p = build_prompt({**_BASE, "lighting": "daylight", "focal_length": 24})
    assert "Shot on a 24mm lens." in p


def test_wide_aperture_gets_dof_note():
    p = build_prompt({**_BASE, "lighting": "daylight", "f_stop": 2.8})
    assert "background gently blurred" in p


def test_no_advanced_settings_unchanged():
    p = build_prompt({**_BASE, "lighting": "daylight"})
    assert "Shot on a" not in p
    assert "raking" not in p


def test_strict_fidelity_occlusion_guardrails():
    p = build_prompt(
        {**_BASE, "fidelity": 95, "lighting": "sunset", "environment": "tropical"}
    )
    assert "never remove or modify structure to reveal environment" in p
    assert "remain occluded behind the architecture" in p
    assert "strictly outside the building footprint" in p


# --- P1 feature branches: add tests ONLY below your own marker -------------


# >>> tests: season-weather (season_/weather_ tests here) <<<


def test_season_appended_to_environment():
    p = build_prompt({**_BASE, "season": "winter"})
    assert "bare deciduous branches" in p


def test_weather_appended():
    p = build_prompt({**_BASE, "weather": "fog"})
    assert "haze increasing with distance" in p


def test_season_and_weather_combined():
    p = build_prompt({**_BASE, "season": "autumn", "weather": "rain"})
    assert "autumn foliage" in p
    assert "wet reflective ground surfaces" in p


def test_season_weather_absent_by_default():
    p = build_prompt(dict(_BASE))
    assert "Season:" not in p
    assert "Weather:" not in p

# >>> tests: material-finish (finish_ tests here) <<<

# >>> tests: sky-type (sky_ tests here) <<<

# >>> tests: grade-intensity (grade_ tests here) <<<

# >>> tests: saturation (saturation_ tests here) <<<
