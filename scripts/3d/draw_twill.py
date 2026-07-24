"""Tileable 2x2 carbon twill texture (color + roughness), matched to IMG_8319."""
import math
import random
from PIL import Image

SIZE = 512
CELL = 32  # weave cell in px -> 16 cells per tile

col = Image.new("RGB", (SIZE, SIZE))
rough = Image.new("L", (SIZE, SIZE))
cp = col.load()
rp = rough.load()

random.seed(7)
# per-tow brightness jitter so tows differ slightly, like real fiber bundles
jitter = {}


def tow_jitter(kind, idx):
    key = (kind, idx % (SIZE // CELL))
    if key not in jitter:
        jitter[key] = random.uniform(-0.012, 0.012)
    return jitter[key]


for y in range(SIZE):
    cy, fy = divmod(y, CELL)
    for x in range(SIZE):
        cx, fx = divmod(x, CELL)
        # 2x2 twill: warp (vertical tow) on top when (cx - cy) mod 4 in {0,1}
        warp_over = (cx - cy) % 4 < 2
        if warp_over:
            t = (fx + 0.5) / CELL          # across the vertical tow
            along = (fy + 0.5) / CELL
            base = 0.055 + tow_jitter("w", cx)
        else:
            t = (fy + 0.5) / CELL
            along = (fx + 0.5) / CELL
            base = 0.075 + tow_jitter("f", cy)
        # fiber-bundle sheen: bright crown at tow center, dark in the grooves
        crown = math.sin(math.pi * t)
        v = base + 0.10 * crown ** 2.2
        # faint lengthwise fiber striation
        v += 0.008 * math.sin(along * math.pi * 7 + (cx + cy))
        v = max(0.02, min(0.24, v))
        g = int(v * 255)
        cp[x, y] = (g, g, min(255, g + 2))
        # crowns are glossier (lower roughness) than grooves
        rp[x, y] = int((0.52 - 0.30 * crown ** 2.2) * 255)

OUT = "/private/tmp/claude-501/-Users-frlobo-Documents-Development-Source-Code-Astro-tali/c45c892f-4548-4c1f-89e9-37ae1c7a06f4/scratchpad"
col.save(OUT + "/twill_color.png")
rough.save(OUT + "/twill_rough.png")
# quick 2x2 tiled preview to check seamlessness
prev = Image.new("RGB", (SIZE * 2, SIZE * 2))
for ox in (0, SIZE):
    for oy in (0, SIZE):
        prev.paste(col, (ox, oy))
prev.resize((768, 768), Image.LANCZOS).save(OUT + "/twill_preview.png")
print("saved")
