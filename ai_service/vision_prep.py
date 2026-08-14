"""Shrink a photograph before it goes to a vision model.

WHY
---
A phone photo is 3000-4000px on the long side. Vision models tile the image
into patches, so the token cost grows with area, and a raw upload eats most of
a small context window before the prompt is even added. On a 4096-token local
context that produced:

    request (4267 tokens) exceeds the available context size (4096 tokens)

...for an image that only needed to be legible enough to see lesions.

768px on the long side is ample for what these prompts actually ask about --
blister-blight lesions, mite webbing, whether a shoot is two-leaves-and-a-bud.
It also cuts Gemini's image-token cost and makes local inference noticeably
faster on a laptop.

SCOPE
-----
Used ONLY by the two leaf endpoints. Document extraction (/extract-worker)
still sends the original, because reading small printed text off an ID card is
exactly the case where downscaling destroys the information.

FAILURE BEHAVIOUR
-----------------
If Pillow is missing or the image cannot be decoded, the ORIGINAL bytes are
returned unchanged. A resize is an optimisation; it must never be the reason a
photograph cannot be graded.
"""

import io
import os

MAX_EDGE = int(os.getenv("VISION_MAX_EDGE", "768"))
JPEG_QUALITY = int(os.getenv("VISION_JPEG_QUALITY", "85"))

try:
    from PIL import Image, ImageOps  # type: ignore
    _PIL = True
except Exception:  # noqa: BLE001 - Pillow is optional
    _PIL = False


def available() -> bool:
    return _PIL


def downscale(data: bytes, content_type: str = "image/jpeg"):
    """Return (bytes, content_type, note).

    `note` is None when the image was resized, or a short human-readable reason
    when it was passed through untouched -- so the caller can log why a request
    is larger than expected instead of guessing.
    """
    if not data:
        return data, content_type, "empty image"
    if not _PIL:
        return data, content_type, (
            "Pillow is not installed, image sent at full size "
            "(pip install Pillow) -- a large photo may exceed the local context window"
        )

    try:
        img = Image.open(io.BytesIO(data))
        # Honour EXIF rotation. A phone photo held sideways would otherwise be
        # analysed rotated, and a model asked about leaf shape cares.
        img = ImageOps.exif_transpose(img)

        # Flatten transparency onto white; JPEG has no alpha channel and
        # otherwise renders it black, which reads as disease spotting.
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")

        w, h = img.size
        longest = max(w, h)
        if longest > MAX_EDGE:
            scale = MAX_EDGE / float(longest)
            img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))),
                             Image.LANCZOS)

        out = io.BytesIO()
        img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        shrunk = out.getvalue()

        # If "shrinking" made it bigger (a small PNG screenshot, say), keep the
        # original. The point is fewer bytes, not JPEG for its own sake.
        if len(shrunk) >= len(data) and longest <= MAX_EDGE:
            return data, content_type, None
        return shrunk, "image/jpeg", None
    except Exception as e:  # noqa: BLE001
        return data, content_type, f"could not resize ({type(e).__name__}), sent at full size"
