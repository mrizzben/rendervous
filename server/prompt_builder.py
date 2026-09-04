"""Build the generation prompt from the configurable template in prompts.json.

PLAN.md §9: the prompt establishes a strict hierarchy (geometry > camera >
materials > lighting > environment > photography) and the reference geometry is
authoritative. The template lives in prompts.json so it is not hardcoded.
Defaults match UI.md (fidelity default strict, daylight, original materials,
no environment) — the UI sends explicit values and settings merge onto these.
"""

import json
import os

_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompts.json")
_cfg = None

DEFAULTS = {
    "fidelity": 90,
    "style": "photoreal",
    "lighting": "daylight",
    "material": "original",
    "environment": "none",
}


def _load():
    global _cfg
    if _cfg is None:
        try:
            with open(_PATH) as f:
                _cfg = json.load(f)
        except (OSError, ValueError) as e:
            raise RuntimeError(f"prompts.json missing or invalid: {e}") from e
    return _cfg


def fidelity_level(fidelity):
    """Map the 0..100 fidelity slider to a restriction tier (UI.md)."""
    if fidelity is None:
        fidelity = DEFAULTS["fidelity"]
    if fidelity >= 80:
        return "strict"
    if fidelity >= 41:
        return "medium"
    return "creative"


def _section(presets_name, base_name, key):
    cfg = _load()
    base = cfg["sections"][base_name]
    extra = cfg["sections"][presets_name].get(key, "")
    return base + ("\n" + extra if extra else "")


# Advanced settings (Advanced Configs panel) — each maps to a sentence appended
# to the corresponding prompt section. Unset/None means "auto": the lighting or
# photography preset wording stands alone.

_SUN_DIRECTIONS = {
    "front": (
        "The sun is positioned in front of the building relative to the "
        "camera, evenly front-lighting the facade with soft, short shadows."
    ),
    "left": (
        "The sun comes from the left of the camera, raking across the "
        "facade and casting shadows toward the right."
    ),
    "right": (
        "The sun comes from the right of the camera, raking across the "
        "facade and casting shadows toward the left."
    ),
    "behind": (
        "The sun is behind the building, backlighting it: the facade sits "
        "in soft shade against a bright sky, with rim light on roof edges."
    ),
}

# Lighting presets that have a direct sun to aim. Overcast/night have no
# visible sun disc, so direction and elevation do not apply there.
_SUN_LIGHTINGS = ("daylight", "golden_hour", "sunset")

_F_STOP_NOTES = {
    2.8: "shallow depth of field with the background gently blurred",
    4: "shallow depth of field with the background gently blurred",
    5.6: "moderate depth of field",
    8: "sharp focus across the frame",
    11: "sharp focus across the frame",
    16: "deep focus with everything sharp front to back",
}


def _advanced_lighting(s):
    """Sun direction + elevation sentences for the LIGHTING section."""
    lines = []
    direction = _SUN_DIRECTIONS.get(s.get("sun_direction"))
    if direction:
        lines.append(direction)
    elevation = s.get("sun_elevation")
    if (
        s["lighting"] in _SUN_LIGHTINGS
        and isinstance(elevation, (int, float))
        and 0 <= elevation <= 90
    ):
        lines.append(
            f"Override the default sun height: place the sun exactly "
            f"{elevation:.0f}° above the horizon."
        )
    return "\n" + "\n".join(lines) if lines else ""


def _advanced_photography(s):
    """Lens sentence for the PHOTOGRAPHY section."""
    focal = s.get("focal_length")
    f_stop = s.get("f_stop")
    if not isinstance(focal, (int, float)) and not isinstance(f_stop, (int, float)):
        return ""
    parts = []
    if isinstance(focal, (int, float)) and 8 <= focal <= 200:
        parts.append(f"{focal:.0f}mm lens")
    if isinstance(f_stop, (int, float)) and 1 <= f_stop <= 32:
        note = _F_STOP_NOTES.get(f_stop, "sharp focus across the frame")
        parts.append(f"f/{f_stop:g}, {note}")
    return f"\nShot on a {' at '.join(parts) if len(parts) == 2 else parts[0]}."


def _season_weather(s):
    """Season + weather sentences for the ENVIRONMENT section.

    (feature: season-weather) Reads s.get("season") and s.get("weather");
    unset/None means auto — the environment preset wording stands alone.
    """
    seasons = {
        "summer": (
            "Season: midsummer, with dense green foliage and full leafy "
            "trees."
        ),
        "autumn": (
            "Season: autumn, with orange and red autumn foliage and some "
            "fallen leaves on the ground."
        ),
        "winter": (
            "Season: winter, with bare deciduous branches and snow covering "
            "horizontal surfaces, cold muted palette."
        ),
        "spring": (
            "Season: spring, with fresh light-green foliage and blooming "
            "trees."
        ),
    }
    weathers = {
        "clear": "Weather: clear, with no precipitation.",
        "overcast": (
            "Weather: overcast, with a fully cloud-covered sky and soft "
            "even light."
        ),
        "fog": (
            "Weather: light fog, with atmospheric haze increasing with "
            "distance."
        ),
        "rain": (
            "Weather: light rain, with wet reflective ground surfaces and "
            "overcast light."
        ),
        "snow": (
            "Weather: snowfall, with falling snowflakes and snow "
            "accumulating on horizontal surfaces."
        ),
    }
    lines = []
    season = seasons.get(s.get("season"))
    if season:
        lines.append(season)
    weather = weathers.get(s.get("weather"))
    if weather:
        lines.append(weather)
    return "\n" + "\n".join(lines) if lines else ""


_FINISHES = {
    "matte": (
        "Material finish: matte, non-reflective surfaces with a soft "
        "diffuse response."
    ),
    "polished": (
        "Material finish: polished, refined surfaces with crisp realistic "
        "reflections."
    ),
    "weathered": (
        "Material finish: weathered, aged surfaces with visible patina, "
        "fading and staining."
    ),
}


def _material_finish(s):
    """Material finish sentence for the MATERIALS section.

    (feature: material-finish)
    Reads s.get("finish"): matte | polished | weathered; None = auto — the
    material preset wording stands alone.
    """
    finish = _FINISHES.get(s.get("finish"))
    return "\n" + finish if finish else ""


def _sky_type(s):
    """Sky sentence for the LIGHTING section (the sky drives the light).

    (feature: sky-type) Stub returns "" until its branch implements it.
    Reads s.get("sky"); None = auto — the lighting preset's sky wording stands.
    """
    return ""


def _grade_intensity(s):
    """Grade intensity sentence for the PHOTOGRAPHY section.

    (feature: grade-intensity) Stub returns "" until its branch implements it.
    Reads s.get("grade_intensity"): 0-100; None = auto (preset grade stands).
    """
    return ""


def _saturation(s):
    """Color saturation sentence for the PHOTOGRAPHY section.

    (feature: saturation) Stub returns "" until its branch implements it.
    Reads s.get("saturation"): 0-100; None = auto (natural saturation).
    """
    return ""


def build_prompt(settings):
    """settings: {fidelity, lighting, material, environment, custom_instruction,
    negative_prompt} -> assembled prompt string."""
    cfg = _load()
    s = dict(DEFAULTS)
    s.update(settings or {})

    lighting = _section("lighting_presets", "lighting_base", s["lighting"])
    lighting += _advanced_lighting(s)
    lighting += _sky_type(s)
    # Lamp temperature only applies when artificial light sources dominate
    # the scene (night, sunset) — ignored for every other lighting preset.
    kelvin = s.get("lamp_temp")
    if (
        s["lighting"] in ("night", "sunset")
        and isinstance(kelvin, (int, float))
        and 1500 <= kelvin <= 10000
    ):
        tone = (
            "warm amber"
            if kelvin < 3500
            else "neutral white"
            if kelvin < 5000
            else "cool slightly blue-tinted"
        )
        lighting += (
            f"\nAll artificial light sources (lamps, lightbulbs, interior "
            f"fixtures) emit {tone} light at approximately {kelvin:.0f}K."
        )

    extras = []
    if s.get("custom_instruction"):
        extras.append("ADDITIONAL INSTRUCTION: " + s["custom_instruction"])
    if s.get("negative_prompt"):
        extras.append("Avoid: " + s["negative_prompt"])

    return cfg["template"].format(
        geometry=cfg["sections"]["geometry"],
        camera=cfg["sections"]["camera"],
        materials=_section("materials_presets", "materials_base", s["material"])
        + _material_finish(s),
        lighting=lighting,
        environment=_section(
            "environment_presets", "environment_base", s["environment"]
        )
        + _season_weather(s),
        style=_section("style_presets", "photography", s["style"])
        + _advanced_photography(s)
        + _grade_intensity(s)
        + _saturation(s),
        restriction=cfg["fidelity"][fidelity_level(s["fidelity"])],
        extra="\n\n".join(extras),
    )
