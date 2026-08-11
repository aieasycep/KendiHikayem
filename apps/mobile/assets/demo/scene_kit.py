"""scene_kit.py — demo görselleri için küçük kompozisyon kütüphanesi.

⚠️ BU İLLÜSTRASYON DEĞİLDİR. Burada bir çizer ya da görsel üreten model yok.
Elimizdeki tek araç Pillow: degrade, radyal parlama, siluet poligonları, nokta
alanları, bulanıklık ve grain. Üretilen şey "sahneyi TEMSİL EDEN kompozisyon"dur
— gece göğü, ışık huzmesi, merdiven silueti, ateş böceği noktaları. Faz 2'de
gerçek illüstrasyon modeli bunların yerini alacak.

Her fonksiyon deterministiktir (seed verilir): aynı kod her çalıştığında
BİREBİR aynı dosyayı üretir, böylece görseller diff'te gürültü yapmaz.
"""

from __future__ import annotations

import math
import random
from typing import Iterable, Sequence

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

RGB = tuple[int, int, int]

# ── Palet (packages/ui/src/tokens/colors.ts ile birebir) ──────────────────────
P = {
    "cream": (250, 248, 244),
    "warmWhite": (255, 249, 242),
    "sand": (242, 237, 230),
    "linen": (232, 224, 212),
    "ink900": (44, 40, 37),
    "taupe600": (122, 109, 98),
    "purple600": (124, 92, 191),
    "purple700": (106, 76, 168),
    "purple800": (90, 65, 144),
    "lavender": (176, 156, 224),
    "lavenderPale": (212, 200, 240),
    "dustyBlue": (123, 167, 201),
    "peach": (245, 196, 168),
    "sage": (141, 184, 154),
    "babyBlue": (184, 216, 232),
    "mintGreen": (197, 223, 200),
    "coral": (240, 139, 110),
    "amber300": (255, 210, 125),
    "night950": (13, 27, 46),
    "night900": (22, 32, 53),
    "night800": (30, 45, 69),
    "night700": (44, 61, 92),
    "nightMuted": (107, 122, 148),
    "nightPurple": (155, 127, 212),
    "nightBlue": (74, 127, 181),
    "deepPlum": (26, 15, 60),
    "royalPurple": (45, 27, 105),
    "moonGold": (255, 220, 150),
}

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def mix(a: RGB, b: RGB, t: float) -> RGB:
    """İki rengi t oranında karıştırır."""
    return (
        round(a[0] + (b[0] - a[0]) * t),
        round(a[1] + (b[1] - a[1]) * t),
        round(a[2] + (b[2] - a[2]) * t),
    )


def shade(color: RGB, amount: float) -> RGB:
    """amount < 0 karartır, > 0 açar."""
    target = (255, 255, 255) if amount > 0 else (0, 0, 0)
    return mix(color, target, abs(amount))


# ── Zemin ─────────────────────────────────────────────────────────────────────


def vertical_gradient(size: int, stops: Sequence[tuple[float, RGB]]) -> Image.Image:
    """Çok duraklı dikey degrade. Küçük şerit üretilip büyütülür (hızlı + pürüzsüz)."""
    strip_h = 512
    strip = Image.new("RGB", (1, strip_h))
    px = strip.load()
    ordered = sorted(stops, key=lambda s: s[0])
    for y in range(strip_h):
        t = y / (strip_h - 1)
        lo = ordered[0]
        hi = ordered[-1]
        for i in range(len(ordered) - 1):
            if ordered[i][0] <= t <= ordered[i + 1][0]:
                lo, hi = ordered[i], ordered[i + 1]
                break
        span = max(1e-6, hi[0] - lo[0])
        px[0, y] = mix(lo[1], hi[1], (t - lo[0]) / span)
    return strip.resize((size, size), Image.BICUBIC)


def radial_mask(size: int, center: tuple[float, float], radius: float, falloff: float = 2.0) -> Image.Image:
    """Merkezden dışa sönen 'L' maske. Küçük üretilip büyütülür."""
    small = 192
    mask = Image.new("L", (small, small), 0)
    px = mask.load()
    cx, cy = center[0] * small, center[1] * small
    r = max(1.0, radius * small)
    for y in range(small):
        dy2 = (y - cy) ** 2
        for x in range(small):
            d = math.sqrt((x - cx) ** 2 + dy2) / r
            if d < 1.0:
                px[x, y] = int(255 * ((1.0 - d) ** falloff))
    return mask.resize((size, size), Image.BICUBIC)


def add_glow(
    base: Image.Image,
    center: tuple[float, float],
    radius: float,
    color: RGB,
    strength: float = 1.0,
    falloff: float = 2.0,
) -> Image.Image:
    """Ekran (screen) karışımıyla ışık ekler — zemini yakmadan aydınlatır."""
    size = base.size[0]
    mask = radial_mask(size, center, radius, falloff)
    if strength != 1.0:
        mask = mask.point(lambda v: int(min(255, v * strength)))
    layer = Image.new("RGB", base.size, color)
    return Image.composite(ImageChops.screen(base, layer), base, mask)


# ── Siluetler ─────────────────────────────────────────────────────────────────


def new_layer(size: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    return layer, ImageDraw.Draw(layer)


def paste_layer(base: Image.Image, layer: Image.Image, blur: float = 0.0) -> Image.Image:
    if blur > 0:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    out = base.convert("RGBA")
    out.alpha_composite(layer)
    return out.convert("RGB")


def scale_pts(points: Iterable[tuple[float, float]], size: int) -> list[tuple[float, float]]:
    return [(x * size, y * size) for x, y in points]


def child_silhouette(
    draw: ImageDraw.ImageDraw,
    size: int,
    cx: float,
    base_y: float,
    height: float,
    color: tuple[int, int, int, int],
    facing: int = 1,
    arm_up: bool = False,
    hair: str = "bob",
) -> None:
    """Bir çocuk SİLUETİ: kafa + gövde + kol. Yüz yok, ayrıntı yok — karşı ışıkta
    duran bir figürün okunabilir gölgesi. Gerçek karakter illüstrasyonu DEĞİL."""
    h = height * size
    x = cx * size
    y0 = base_y * size
    head_r = h * 0.155
    head_cy = y0 - h + head_r
    # gövde: omuzdan etek/pijama ucuna doğru genişleyen yamuk
    shoulder_y = head_cy + head_r * 1.5
    body_w_top = h * 0.19
    body_w_bot = h * 0.27
    draw.polygon(
        [
            (x - body_w_top, shoulder_y),
            (x + body_w_top, shoulder_y),
            (x + body_w_bot, y0),
            (x - body_w_bot, y0),
        ],
        fill=color,
    )
    # kafa
    draw.ellipse([x - head_r, head_cy - head_r, x + head_r, head_cy + head_r], fill=color)
    # saç kütlesi
    if hair == "bob":
        draw.ellipse(
            [x - head_r * 1.18, head_cy - head_r * 1.12, x + head_r * 1.18, head_cy + head_r * 0.55],
            fill=color,
        )
    elif hair == "ponytail":
        draw.ellipse(
            [x - head_r * 1.1, head_cy - head_r * 1.1, x + head_r * 1.1, head_cy + head_r * 0.4],
            fill=color,
        )
        draw.ellipse(
            [
                x - facing * head_r * 2.0,
                head_cy - head_r * 0.3,
                x - facing * head_r * 0.9,
                head_cy + head_r * 1.5,
            ],
            fill=color,
        )
    # kol
    arm_w = h * 0.055
    if arm_up:
        draw.line(
            [(x + facing * body_w_top * 0.8, shoulder_y + h * 0.05), (x + facing * h * 0.24, shoulder_y - h * 0.14)],
            fill=color,
            width=int(arm_w * 2),
        )
    else:
        draw.line(
            [(x + facing * body_w_top * 0.85, shoulder_y + h * 0.04), (x + facing * h * 0.16, shoulder_y + h * 0.30)],
            fill=color,
            width=int(arm_w * 2),
        )


def fox_silhouette(
    draw: ImageDraw.ImageDraw,
    size: int,
    cx: float,
    base_y: float,
    height: float,
    color: tuple[int, int, int, int],
) -> None:
    """Peluş tilki silueti: yuvarlak gövde + iki kulak (biri kıvrık) + kuyruk."""
    h = height * size
    x = cx * size
    y0 = base_y * size
    body_r = h * 0.34
    body_cy = y0 - body_r
    draw.ellipse([x - body_r, body_cy - body_r * 0.95, x + body_r, y0], fill=color)
    head_r = h * 0.27
    head_cy = body_cy - body_r * 0.75
    draw.ellipse([x - head_r, head_cy - head_r, x + head_r, head_cy + head_r], fill=color)
    # kulaklar — sağdaki KIVRIK (karakter kanonu: tek kulağı hafif kıvrık)
    draw.polygon(
        [
            (x - head_r * 0.85, head_cy - head_r * 0.45),
            (x - head_r * 0.28, head_cy - head_r * 1.65),
            (x - head_r * 0.02, head_cy - head_r * 0.6),
        ],
        fill=color,
    )
    draw.polygon(
        [
            (x + head_r * 0.05, head_cy - head_r * 0.62),
            (x + head_r * 0.62, head_cy - head_r * 1.5),
            (x + head_r * 0.95, head_cy - head_r * 0.9),
            (x + head_r * 0.72, head_cy - head_r * 0.35),
        ],
        fill=color,
    )
    # kuyruk
    draw.ellipse(
        [x + body_r * 0.55, y0 - h * 0.42, x + body_r * 1.85, y0 + h * 0.04],
        fill=color,
    )


# ── Nokta alanları ────────────────────────────────────────────────────────────


def scatter_dots(
    base: Image.Image,
    seed: int,
    count: int,
    box: tuple[float, float, float, float],
    color: RGB,
    size_px: tuple[float, float] = (2.0, 4.0),
    alpha: tuple[int, int] = (70, 200),
    glow: float = 0.0,
) -> Image.Image:
    """Yıldız / toz zerresi / ateş böceği alanı."""
    rnd = random.Random(seed)
    px = base.size[0]
    layer, draw = new_layer(px)
    x0, y0, x1, y1 = box
    for _ in range(count):
        x = rnd.uniform(x0, x1) * px
        y = rnd.uniform(y0, y1) * px
        r = rnd.uniform(*size_px) / 2
        a = rnd.randint(*alpha)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(*color, a))
    out = base
    if glow > 0:
        soft = layer.filter(ImageFilter.GaussianBlur(glow))
        out = paste_layer(out, soft)
    return paste_layer(out, layer)


# ── Bitiriciler ───────────────────────────────────────────────────────────────


def grain(base: Image.Image, seed: int, amount: int = 7) -> Image.Image:
    """İnce film grenini ekler — düz degradelerin 'plastik' görünmesini engeller."""
    rnd = random.Random(seed)
    small = 256
    noise = Image.frombytes(
        "L", (small, small), bytes(rnd.randrange(256) for _ in range(small * small))
    ).resize(base.size, Image.BICUBIC)
    noise = noise.point(lambda v: 128 + int((v - 128) * amount / 100))
    return ImageChops.overlay(base, noise.convert("RGB"))


def vignette(base: Image.Image, strength: float = 0.42) -> Image.Image:
    size = base.size[0]
    mask = radial_mask(size, (0.5, 0.5), 0.82, falloff=1.5)
    dark = Image.new("RGB", base.size, (0, 0, 0))
    faded = Image.blend(base, dark, strength)
    return Image.composite(base, faded, mask)


def safe_zone(base: Image.Image, zone: str, strength: float = 0.55) -> Image.Image:
    """Metin kutusunun oturacağı bölgeyi SAKİNLEŞTİRİR (koyultur).

    Sözleşmedeki `safeZone` alanının görsel karşılığı: metin oraya basıldığında
    okunabilir kalsın diye o şerit bilinçli olarak boşaltılır.
    """
    size = base.size[0]
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    band = int(size * 0.34)
    if zone == "bottom":
        d.rectangle([0, size - band, size, size], fill=255)
    elif zone == "top":
        d.rectangle([0, 0, size, band], fill=255)
    elif zone == "left":
        d.rectangle([0, 0, band, size], fill=255)
    else:
        d.rectangle([size - band, 0, size, size], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(size * 0.09))
    dark = Image.new("RGB", base.size, (6, 10, 20))
    return Image.composite(Image.blend(base, dark, strength), base, mask)


def demo_mark(base: Image.Image, label: str = "DEMO") -> Image.Image:
    """Köşeye küçük, soluk bir 'DEMO' damgası.

    Bu görseller ekran görüntüsü olarak dolaşacak; damga olmadan gerçek ürün
    illüstrasyonu sanılabilirler. Damga KASITLI olarak siliktir ama okunur.
    """
    size = base.size[0]
    layer, draw = new_layer(size)
    font = ImageFont.truetype(FONT_PATH, max(11, int(size * 0.021)))
    pad = int(size * 0.028)
    box = draw.textbbox((0, 0), label, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    x, y = size - w - pad - int(size * 0.012), size - h - pad - int(size * 0.014)
    draw.rounded_rectangle(
        [x - size * 0.014, y - size * 0.011, x + w + size * 0.014, y + h + size * 0.014],
        radius=size * 0.012,
        fill=(0, 0, 0, 70),
    )
    draw.text((x, y), label, font=font, fill=(255, 255, 255, 150))
    return paste_layer(base, layer)


def finish(
    img: Image.Image,
    seed: int,
    zone: str | None = "bottom",
    vig: float = 0.42,
    mark: bool = True,
) -> Image.Image:
    if zone is not None:
        img = safe_zone(img, zone)
    img = vignette(img, vig)
    img = grain(img, seed)
    if mark:
        img = demo_mark(img)
    return img


def save_webp(img: Image.Image, path: str, quality: int = 78) -> int:
    img.save(path, "WEBP", quality=quality, method=6)
    import os

    return os.path.getsize(path)
