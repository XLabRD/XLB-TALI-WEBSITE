"""Draw the Tali e-paper UI texture, matching the prototype photo layout."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1664, 960
img = Image.new("RGB", (W, H), (12, 12, 13))
d = ImageDraw.Draw(img)
WHITE = (238, 238, 235)

F = "/System/Library/Fonts/Helvetica.ttc"


def font(size, bold=True):
    return ImageFont.truetype(F, size, index=1 if bold else 0)


def text(xy, s, size, bold=True, anchor="la", fill=WHITE):
    d.text(xy, s, font=font(size, bold), fill=fill, anchor=anchor)


def tri(x, y, s, up=True):
    if up:
        d.polygon([(x, y + s), (x + s, y + s), (x + s / 2, y)], fill=WHITE)
    else:
        d.polygon([(x, y), (x + s, y), (x + s / 2, y + s)], fill=WHITE)


PAD = 150
DIV_X = int(W * 0.56)

# top bar: zone name left, battery + signal right
text((PAD, PAD), "Metal", 56, bold=False)
# battery icon
bx, by = W - PAD - 110, PAD
d.rounded_rectangle([bx, by, bx + 84, by + 42], radius=8, outline=WHITE, width=5)
d.rectangle([bx + 88, by + 12, bx + 98, by + 30], fill=WHITE)
d.rectangle([bx + 8, by + 8, bx + 62, by + 34], fill=WHITE)
# signal arcs
sx, sy = bx - 90, by + 36
for r, wdt in [(16, 5), (30, 5), (44, 5)]:
    d.arc([sx - r, sy - r, sx + r, sy + r], 300, 360, fill=WHITE, width=wdt)

# left: temperature
text((PAD, H * 0.30), "25.0", 300)
text((PAD + 570, H * 0.33), "°c", 110, bold=False)
tri(PAD, H * 0.68 + 14, 44, up=False)
text((PAD + 62, H * 0.68), "-1°C", 64, bold=False)
tri(PAD + 280, H * 0.68 + 14, 44, up=True)
text((PAD + 342, H * 0.68), "31°C", 64, bold=False)
text((PAD, H - PAD - 50), "9:36", 54, bold=False)

# divider
d.line([DIV_X, PAD, DIV_X, H - PAD], fill=WHITE, width=4)

# right: humidity
RX = DIV_X + 60
text((RX, H * 0.22), "64", 230)
text((RX + 310, H * 0.24), "%", 120, bold=False)
tri(RX, H * 0.58 + 12, 40, up=False)
text((RX + 56, H * 0.58), "26%", 58, bold=False)
tri(RX + 250, H * 0.58 + 12, 40, up=True)
text((RX + 306, H * 0.58), "95%", 58, bold=False)
d.line([RX, int(H * 0.74), W - PAD, int(H * 0.74)], fill=WHITE, width=3)
text((RX, H * 0.79), "12 May 2026", 60, bold=False)

img.save(
    "/private/tmp/claude-501/-Users-frlobo-Documents-Development-Source-Code-Astro-tali/c45c892f-4548-4c1f-89e9-37ae1c7a06f4/scratchpad/epaper_ui.png"
)
print("saved")
