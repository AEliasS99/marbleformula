"""YouTube thumbnail: a clean 1080p still of the race, graded a touch punchier,
with the Grand Prix name in heavy type and the round on a yellow tab.

    python3 scripts/thumbnail.py still.png thumb.jpg "MONACO" "ROUND 1"
"""
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

src, dst, big, tab = sys.argv[1:5]
img = Image.open(src).convert("RGB").resize((1280, 720), Image.LANCZOS)
img = ImageEnhance.Contrast(ImageEnhance.Color(img).enhance(1.25)).enhance(1.12)
# Darken the left third so the text reads.
shade = Image.new("L", (1280, 720), 0)
d = ImageDraw.Draw(shade)
for x in range(640):
    d.line([(x, 0), (x, 720)], fill=int(170 * (1 - x / 640) ** 1.5))
img = Image.composite(Image.new("RGB", img.size, (8, 9, 12)), img, shade)


FONT = "/System/Library/Fonts/Avenir Next.ttc"


def font(size, index):
    # No fallback: PIL's default font is ~10 px, which would ship an unreadable
    # thumbnail. Fail loudly instead (the factory then retries / reports it).
    try:
        return ImageFont.truetype(FONT, size, index=index)
    except Exception as e:
        sys.exit(f"thumbnail.py: cannot load {FONT} (face {index}): {e}")


draw = ImageDraw.Draw(img)
heavy = font(150 if len(big) <= 7 else 112, 8)  # Avenir Next Heavy
draw.text((52, 300), big, font=heavy, fill="white", stroke_width=6, stroke_fill=(10, 10, 14))
small = font(54, 0)
w = draw.textlength(tab, font=small) + 40
draw.rounded_rectangle([52, 224, 52 + w, 294], radius=14, fill=(255, 204, 0))
draw.text((72, 230), tab, font=small, fill=(17, 18, 22))
draw.text((56, 470), "MARBLE FORMULA 2027", font=font(44, 0), fill=(255, 255, 255), stroke_width=3, stroke_fill=(10, 10, 14))
img.filter(ImageFilter.UnsharpMask(2, 80, 2)).save(dst, quality=92)
