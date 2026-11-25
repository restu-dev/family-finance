# Membuat ikon PWA (PNG) tanpa dependensi eksternal selain Pillow.
from PIL import Image, ImageDraw
import sys

def icon(size, maskable=False):
    img = Image.new("RGB", (size, size), "#1f4fd8")
    d = ImageDraw.Draw(img)
    pad = size * (0.22 if maskable else 0.16)
    # dompet sederhana: badan, tutup, dan kancing
    x0, y0, x1, y1 = pad, size * 0.30, size - pad, size * 0.78
    d.rounded_rectangle((x0, y0, x1, y1), radius=size * 0.07, fill="white")
    d.rounded_rectangle((x0, size * 0.22, x1 - size * 0.12, size * 0.34), radius=size * 0.04, fill="#c8d6fb")
    d.rounded_rectangle((x1 - size * 0.24, size * 0.46, x1 + size * 0.01, size * 0.62), radius=size * 0.05, fill="#1f4fd8")
    d.ellipse((x1 - size * 0.15, size * 0.515, x1 - size * 0.09, size * 0.575), fill="white")
    return img

for name, size, mask in [("icon-192.png", 192, False), ("icon-512.png", 512, False),
                         ("icon-maskable-512.png", 512, True), ("apple-touch-icon.png", 180, False)]:
    icon(size, mask).save(f"assets/images/{name}")
print("ikon dibuat")
