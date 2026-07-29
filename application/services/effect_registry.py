from infrastructure.audio.effects import (
    ReverbEffect,
    Rotate8DEffect,
    StereoWidthEffect,
    VinylWarmthEffect,
)

EFFECT_REGISTRY = {
    "8d_rotate": Rotate8DEffect(),
    "reverb": ReverbEffect(),
    "stereo_width": StereoWidthEffect(),
    "vinyl_warmth": VinylWarmthEffect(),
}

DEFAULT_EFFECT_IDS = ["8d_rotate", "reverb"]

def build_effect_chain(effect_ids: list[str] | None):

    selected_ids = effect_ids or DEFAULT_EFFECT_IDS

    chain = []

    for effect_id in selected_ids:

        if effect_id not in EFFECT_REGISTRY:

            raise ValueError(f"Unknown effect: '{effect_id}'.")

        chain.append(EFFECT_REGISTRY[effect_id])

    return chain
