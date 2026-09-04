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


def build_prompt(settings):
    """settings: {fidelity, lighting, material, environment, custom_instruction,
    negative_prompt} -> assembled prompt string."""
    cfg = _load()
    s = dict(DEFAULTS)
    s.update(settings or {})

    lighting = _section("lighting_presets", "lighting_base", s["lighting"])
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
        materials=_section("materials_presets", "materials_base", s["material"]),
        lighting=lighting,
        environment=_section(
            "environment_presets", "environment_base", s["environment"]
        ),
        style=_section("style_presets", "photography", s["style"]),
        restriction=cfg["fidelity"][fidelity_level(s["fidelity"])],
        extra="\n\n".join(extras),
    )
