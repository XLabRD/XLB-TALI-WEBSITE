"""Generate the render textures used by hub_render.py (and explode_render.py).

These were originally built in a session scratchpad that has since been cleaned
up, which left both render scripts unrunnable. They live here now so the renders
can be reproduced. Usage: python3 textures.py <out_dir>

Both are authored as SVG and rasterised with qlmanage, which is the only
rasteriser on this machine. Output: twill_color.png, twill_rough.png, epaper_ui.png
"""
import os, subprocess, sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


def rasterise(svg, name, size):
    src = os.path.join(OUT, name + ".svg")
    open(src, "w").write(svg)
    subprocess.run(["qlmanage", "-t", "-s", str(size), "-o", OUT, src],
                   capture_output=True)
    # qlmanage writes <name>.svg.png
    os.replace(os.path.join(OUT, name + ".svg.png"), os.path.join(OUT, name + ".png"))
    os.remove(src)
    print("wrote", name + ".png")


# ---------- carbon twill: 2/2 weave, tileable ----------
# 16 tows per tile. At the proven TWILL_SCALE of 0.42 the tile lands at ~2.4cm,
# so one tow is ~1.5mm — real 3k twill. The previous version outlined every cell
# with a light stroke, which at render scale collapsed into a grille; the tows
# are now filled bars with a cross-gradient and no outlines at all.
CELL, N = 32, 16
S = CELL * N


def twill(colour):
    """colour=True -> albedo tile; False -> roughness tile."""
    if colour:
        edge, mid, base = "#151518", "#3c3c44", "#0e0e10"
    else:
        # fibres read smoother along a tow than across it
        edge, mid, base = "#8a8a8a", "#5f5f5f", "#7d7d7d"

    parts = [f'<rect width="{S}" height="{S}" fill="{base}"/>']
    for j in range(N):
        for i in range(N):
            warp = ((i + j) % 4) < 2      # warp floats over two, shifted one per row
            x, y = i * CELL, j * CELL
            if warp:                       # tow runs vertically
                parts.append(f'<rect x="{x+1}" y="{y-1}" width="{CELL-2}" height="{CELL+2}" '
                             f'rx="{CELL*0.28:.1f}" fill="url(#gw)"/>')
            else:                          # tow runs horizontally
                parts.append(f'<rect x="{x-1}" y="{y+1}" width="{CELL+2}" height="{CELL-2}" '
                             f'rx="{CELL*0.28:.1f}" fill="url(#gf)"/>')
    fil = []
    for k in range(0, S, 4):
        fil.append(f'<line x1="{k}" y1="0" x2="{k}" y2="{S}" stroke="{mid}" '
                   f'stroke-opacity="0.10" stroke-width="1"/>')
        fil.append(f'<line x1="0" y1="{k}" x2="{S}" y2="{k}" stroke="{mid}" '
                   f'stroke-opacity="0.07" stroke-width="1"/>')

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}" viewBox="0 0 {S} {S}">
  <defs>
    <linearGradient id="gw" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="{edge}"/><stop offset="0.5" stop-color="{mid}"/>
      <stop offset="1" stop-color="{edge}"/>
    </linearGradient>
    <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{edge}"/><stop offset="0.5" stop-color="{mid}"/>
      <stop offset="1" stop-color="{edge}"/>
    </linearGradient>
  </defs>
  {''.join(parts)}
  {''.join(fil)}
</svg>'''


rasterise(twill(True), "twill_color", S)
rasterise(twill(False), "twill_rough", S)

# ---------- e-paper UI ----------
W, H = 800, 480
F = "Helvetica Neue, Helvetica, Arial"
# qlmanage pads to a square anchored top-left, so author the panel centred in
# an 800x800 canvas — then a centred sips crop lifts it back out exactly.
PAD = (W - H) // 2
ui = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{W}" viewBox="0 0 {W} {W}">
  <g transform="translate(0 {PAD})">
  <rect width="{W}" height="{H}" fill="#0b0b0c"/>
  <g fill="#f2f1ee" font-family="{F}">
    <text x="52" y="58" font-size="30">1/4 Cava Derecha</text>
    <g transform="translate(700 34)">
      <rect x="0" y="6" width="40" height="20" rx="4" fill="none" stroke="#f2f1ee" stroke-width="3"/>
      <rect x="4" y="10" width="32" height="12" fill="#f2f1ee"/>
      <rect x="41" y="12" width="5" height="8" rx="2" fill="#f2f1ee"/>
    </g>
    <text x="52" y="248" font-size="150" font-weight="600">18.0</text>
    <text x="348" y="196" font-size="52">&#176;</text>
    <text x="348" y="248" font-size="52">C</text>
    <text x="52" y="306" font-size="34" fill="#c9c7c2">&#9662; 16&#176;C &#160;&#160; &#9652; 18&#176;C</text>
    <text x="440" y="248" font-size="150" font-weight="600">76</text>
    <text x="628" y="248" font-size="52">%</text>
    <text x="440" y="306" font-size="34" fill="#c9c7c2">&#9662; 70% &#160;&#160; &#9652; 83%</text>
    <line x1="410" y1="90" x2="410" y2="330" stroke="#5a5955" stroke-width="3"/>
    <line x1="52" y1="372" x2="748" y2="372" stroke="#5a5955" stroke-width="3"/>
    <text x="52" y="432" font-size="34" fill="#c9c7c2">14:23</text>
    <text x="748" y="432" font-size="34" fill="#c9c7c2" text-anchor="end">02 Jul 2026</text>
  </g>
  </g>
</svg>'''
rasterise(ui, "epaper_ui", W)
subprocess.run(["sips", "-c", str(H), str(W), os.path.join(OUT, "epaper_ui.png")], capture_output=True)
print("cropped epaper_ui.png to", W, "x", H)
