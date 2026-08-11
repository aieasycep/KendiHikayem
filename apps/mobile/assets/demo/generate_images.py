"""generate_images.py — demo APK'sına gömülen sahne görsellerini üretir.

    python3 apps/mobile/assets/demo/generate_images.py

⚠️ DÜRÜSTLÜK NOTU
Bunlar İLLÜSTRASYON DEĞİLDİR. Bu ortamda görsel üreten bir model yok; elimizde
yalnızca Pillow var. Üretilenler, sayfa metnine karşılık gelen KOMPOZİSYONLAR:
gece degradesi, ışık huzmesi, merdiven/lamba/pencere siluetleri, ateş böceği
noktaları. Amaç, kullanıcının sayfaları çevirdiğinde kırık ikon değil, sahneyle
uyumlu ve göze hoş gelen bir görsel görmesi. Her karede küçük bir "DEMO" damgası
vardır. Faz 2'de gerçek illüstrasyon modeli bunların yerini alacak.

Sahneler `packages/mock/src/fixtures/story-text.ts` içindeki metne göre kurulur;
listedeki yorumlar hangi cümleye karşılık geldiklerini söyler.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

from scene_kit import (  # noqa: E402
    P,
    RGB,
    add_glow,
    child_silhouette,
    finish,
    fox_silhouette,
    mix,
    new_layer,
    paste_layer,
    save_webp,
    scatter_dots,
    shade,
    vertical_gradient,
)

OUT = os.path.dirname(os.path.abspath(__file__))
PAGE = 1024
CARD = 640
SWATCH = 512

INK = (4, 8, 16, 255)


def _room(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    return vertical_gradient(size, [(0.0, top), (0.55, mix(top, bottom, 0.6)), (1.0, bottom)])


# ── 1. Elif ve Tavan Arasındaki Işık — 12 sayfa ───────────────────────────────


def elif_page_1(size: int) -> Image.Image:
    """"Tahtanın kenarından ince, sarı bir ışık sızıyordu." — oda, tavandaki kapak."""
    img = _room(size, P["night950"], shade(P["night900"], 0.06))
    layer, d = new_layer(size)
    # tavan düzlemi (perspektif yamuk)
    d.polygon(
        [(0, 0), (size, 0), (size * 0.80, size * 0.30), (size * 0.20, size * 0.30)],
        fill=(*shade(P["night900"], -0.35), 255),
    )
    # tavan arası kapağı
    d.polygon(
        [
            (size * 0.34, size * 0.075),
            (size * 0.66, size * 0.075),
            (size * 0.615, size * 0.245),
            (size * 0.385, size * 0.245),
        ],
        fill=(*shade(P["night950"], -0.45), 255),
    )
    img = paste_layer(img, layer)
    # kapağın kenarından sızan sarı çizgi
    crack, dc = new_layer(size)
    dc.polygon(
        [
            (size * 0.386, size * 0.243),
            (size * 0.614, size * 0.243),
            (size * 0.610, size * 0.256),
            (size * 0.390, size * 0.256),
        ],
        fill=(*P["moonGold"], 235),
    )
    img = paste_layer(img, crack.filter(ImageFilter.GaussianBlur(size * 0.012)))
    img = paste_layer(img, crack)
    img = add_glow(img, (0.5, 0.26), 0.40, P["moonGold"], 0.55, falloff=2.6)
    # yatak: başlık + şilte + yorgan tümseği + yastık + kafa silueti
    bed, db = new_layer(size)
    db.rounded_rectangle(
        [size * 0.14, size * 0.545, size * 0.86, size * 0.70],
        radius=size * 0.045,
        fill=(*shade(P["night800"], -0.42), 255),
    )  # başlık
    db.rectangle([size * 0.06, size * 0.735, size * 0.94, size * 1.0], fill=(*shade(P["night800"], -0.34), 255))
    db.ellipse(
        [size * 0.02, size * 0.700, size * 0.98, size * 1.06],
        fill=(*shade(P["night700"], -0.30), 255),
    )  # yorgan tümseği
    db.ellipse([size * 0.30, size * 0.655, size * 0.66, size * 0.755], fill=(*shade(P["night700"], -0.10), 255))
    db.ellipse([size * 0.415, size * 0.640, size * 0.545, size * 0.740], fill=INK)  # kafa
    db.ellipse([size * 0.405, size * 0.630, size * 0.560, size * 0.706], fill=INK)  # saç
    # başucu masası
    db.rounded_rectangle(
        [size * 0.845, size * 0.760, size * 0.995, size * 0.985],
        radius=size * 0.012,
        fill=(*shade(P["night800"], -0.50), 255),
    )
    db.rectangle([size * 0.845, size * 0.760, size * 0.995, size * 0.786], fill=(*shade(P["night700"], -0.34), 255))
    img = paste_layer(img, bed)
    img = scatter_dots(img, 101, 26, (0.05, 0.30, 0.95, 0.62), P["lavenderPale"], (1.5, 3.2), (40, 120))
    return finish(img, 1, "bottom")


def elif_page_2(size: int) -> Image.Image:
    """"Fındık'ın tek kulağı hep biraz kıvrıktı." — yorgan altı, tilki, ay ışığı."""
    img = _room(size, shade(P["night900"], 0.04), P["night950"])
    img = add_glow(img, (0.80, 0.24), 0.34, P["babyBlue"], 0.42)
    layer, d = new_layer(size)
    # pencere + ay
    d.rectangle([size * 0.66, size * 0.10, size * 0.95, size * 0.42], fill=(*shade(P["night800"], 0.10), 255))
    d.ellipse([size * 0.755, size * 0.155, size * 0.855, size * 0.255], fill=(*P["moonGold"], 235))
    d.rectangle([size * 0.803, size * 0.10, size * 0.813, size * 0.42], fill=(*shade(P["night950"], -0.2), 255))
    d.rectangle([size * 0.66, size * 0.255, size * 0.95, size * 0.265], fill=(*shade(P["night950"], -0.2), 255))
    img = paste_layer(img, layer)
    img = add_glow(img, (0.805, 0.20), 0.16, P["moonGold"], 0.85)
    # yorgan dalgası + iki siluet
    quilt, dq = new_layer(size)
    dq.ellipse([-size * 0.20, size * 0.62, size * 1.20, size * 1.45], fill=(*shade(P["night800"], -0.22), 255))
    img = paste_layer(img, quilt)
    figs, df = new_layer(size)
    df.ellipse([size * 0.285, size * 0.545, size * 0.435, size * 0.695], fill=INK)  # kafa
    df.ellipse([size * 0.272, size * 0.532, size * 0.448, size * 0.640], fill=INK)  # saç
    df.ellipse([size * 0.245, size * 0.585, size * 0.315, size * 0.720], fill=INK)  # at kuyruğu
    fox_silhouette(df, size, 0.60, 0.735, 0.22, INK)
    img = paste_layer(img, figs)
    img = scatter_dots(img, 202, 18, (0.05, 0.06, 0.60, 0.45), P["lavender"], (1.5, 3.0), (35, 110))
    return finish(img, 2, "bottom")


def elif_page_3(size: int) -> Image.Image:
    """"Merdiven, ay ışığında gümüş gibi parlıyordu." — koridor, ilk basamak gıcırdar."""
    img = _room(size, shade(P["night900"], 0.10), P["night950"])
    layer, d = new_layer(size)
    # koridor duvarları (perspektif)
    d.polygon([(0, 0), (size * 0.22, size * 0.16), (size * 0.22, size * 0.92), (0, size)], fill=(*shade(P["night950"], -0.25), 255))
    d.polygon([(size, 0), (size * 0.78, size * 0.16), (size * 0.78, size * 0.92), (size, size)], fill=(*shade(P["night950"], -0.35), 255))
    img = paste_layer(img, layer)
    # merdiven basamakları — yukarı doğru daralan, ay ışığı vuran
    steps, ds = new_layer(size)
    n = 8
    for i in range(n):
        t = i / (n - 1)
        y = size * (0.86 - t * 0.50)
        half = size * (0.30 - t * 0.14)
        h = size * (0.045 - t * 0.016)
        bright = 0.20 + t * 0.55
        ds.rectangle(
            [size * 0.5 - half, y, size * 0.5 + half, y + h],
            fill=(*mix(P["night700"], P["lavenderPale"], bright * 0.55), 255),
        )
        ds.rectangle(
            [size * 0.5 - half, y + h, size * 0.5 + half, y + h + size * 0.028],
            fill=(*shade(P["night950"], -0.15), 255),
        )
    img = paste_layer(img, steps)
    img = add_glow(img, (0.5, 0.30), 0.30, P["moonGold"], 0.50, falloff=2.4)
    figs, df = new_layer(size)
    child_silhouette(df, size, 0.50, 0.885, 0.30, INK, facing=1, hair="ponytail")
    img = paste_layer(img, figs)
    img = scatter_dots(img, 303, 20, (0.10, 0.10, 0.90, 0.55), P["lavenderPale"], (1.4, 3.0), (30, 100))
    return finish(img, 3, "bottom")


def elif_page_4(size: int) -> Image.Image:
    """"Bir... iki... üç..." — basamakları sayarken kapak tam önünde."""
    img = _room(size, shade(P["royalPurple"], -0.35), P["night950"])
    img = add_glow(img, (0.52, 0.17), 0.42, P["moonGold"], 0.75, falloff=2.2)
    layer, d = new_layer(size)
    # üstteki kapak, aralanmış
    d.polygon(
        [(size * 0.30, size * 0.02), (size * 0.74, size * 0.02), (size * 0.68, size * 0.20), (size * 0.36, size * 0.20)],
        fill=(*shade(P["night950"], -0.5), 255),
    )
    d.polygon(
        [(size * 0.355, size * 0.196), (size * 0.685, size * 0.196), (size * 0.70, size * 0.235), (size * 0.34, size * 0.235)],
        fill=(*P["moonGold"], 220),
    )
    img = paste_layer(img, layer)
    steps, ds = new_layer(size)
    n = 7
    for i in range(n):
        t = i / (n - 1)
        y = size * (0.94 - t * 0.52)
        half = size * (0.40 - t * 0.16)
        ds.polygon(
            [
                (size * 0.5 - half, y),
                (size * 0.5 + half, y),
                (size * 0.5 + half * 0.94, y + size * 0.058),
                (size * 0.5 - half * 0.94, y + size * 0.058),
            ],
            fill=(*mix(P["night800"], P["moonGold"], 0.06 + t * 0.30), 255),
        )
    img = paste_layer(img, steps)
    figs, df = new_layer(size)
    child_silhouette(df, size, 0.47, 0.72, 0.33, INK, facing=1, arm_up=True, hair="ponytail")
    img = paste_layer(img, figs)
    img = scatter_dots(img, 404, 30, (0.15, 0.08, 0.85, 0.45), P["moonGold"], (1.5, 3.4), (40, 140), glow=size * 0.006)
    return finish(img, 4, "bottom")


def elif_page_5(size: int) -> Image.Image:
    """"Sandıklar, yün yumakları ve dedesinin kırmızı bisikleti." — tavan arası."""
    img = vertical_gradient(
        size,
        [(0.0, shade(P["night900"], 0.10)), (0.45, mix(P["night800"], P["peach"], 0.18)), (1.0, shade(P["night950"], 0.05))],
    )
    layer, d = new_layer(size)
    # çatı eğimleri
    d.polygon([(0, 0), (size * 0.5, size * 0.16), (0, size * 0.52)], fill=(*shade(P["night950"], -0.30), 255))
    d.polygon([(size, 0), (size * 0.5, size * 0.16), (size, size * 0.52)], fill=(*shade(P["night950"], -0.40), 255))
    # ışık huzmesi (pencereden)
    d.polygon(
        [(size * 0.60, size * 0.10), (size * 0.80, size * 0.10), (size * 1.00, size * 0.86), (size * 0.44, size * 0.86)],
        fill=(*P["moonGold"], 42),
    )
    img = paste_layer(img, layer.filter(ImageFilter.GaussianBlur(size * 0.004)))
    # eşyalar
    props, dp = new_layer(size)
    dp.rectangle([size * 0.06, size * 0.60, size * 0.30, size * 0.80], fill=(*shade(P["night800"], -0.30), 255))
    dp.rectangle([size * 0.06, size * 0.585, size * 0.30, size * 0.615], fill=(*shade(P["night700"], -0.15), 255))
    dp.rectangle([size * 0.24, size * 0.70, size * 0.44, size * 0.84], fill=(*shade(P["night800"], -0.42), 255))
    for cx, cy, r in ((0.50, 0.84, 0.035), (0.575, 0.855, 0.028)):
        dp.ellipse(
            [size * (cx - r), size * (cy - r), size * (cx + r), size * (cy + r)],
            fill=(*mix(P["sand"], P["night800"], 0.35), 255),
        )
    # kırmızı bisiklet: iki tekerlek + iskelet çizgileri
    bike, db = new_layer(size)
    red = (*mix(P["coral"], (120, 30, 20), 0.35), 255)
    for cx in (0.655, 0.865):
        db.ellipse(
            [size * (cx - 0.082), size * 0.700, size * (cx + 0.082), size * 0.864],
            outline=red,
            width=int(size * 0.011),
        )
    db.line([(size * 0.655, size * 0.782), (size * 0.735, size * 0.660)], fill=red, width=int(size * 0.011))
    db.line([(size * 0.735, size * 0.660), (size * 0.865, size * 0.782)], fill=red, width=int(size * 0.011))
    db.line([(size * 0.735, size * 0.660), (size * 0.700, size * 0.782)], fill=red, width=int(size * 0.010))
    db.line([(size * 0.700, size * 0.782), (size * 0.865, size * 0.782)], fill=red, width=int(size * 0.010))
    db.line([(size * 0.712, size * 0.648), (size * 0.775, size * 0.640)], fill=red, width=int(size * 0.010))
    img = paste_layer(img, props)
    img = paste_layer(img, bike)
    # ışıkta uçuşan toz zerreleri
    img = scatter_dots(img, 505, 150, (0.45, 0.10, 1.00, 0.86), P["moonGold"], (2.0, 5.0), (55, 190), glow=size * 0.008)
    img = scatter_dots(img, 506, 40, (0.02, 0.10, 0.50, 0.80), P["peach"], (1.5, 3.2), (30, 90))
    figs, df = new_layer(size)
    child_silhouette(df, size, 0.30, 0.90, 0.30, INK, facing=1, hair="ponytail")
    img = paste_layer(img, figs)
    return finish(img, 5, "top")


def elif_page_6(size: int) -> Image.Image:
    """"Lambanın camının içinde altın sarısı bir ateş böceği vardı." — gaz lambası."""
    img = _room(size, shade(P["night950"], 0.04), (6, 12, 22))
    img = add_glow(img, (0.5, 0.46), 0.52, P["moonGold"], 0.95, falloff=2.8)
    lamp, d = new_layer(size)
    dark = (*shade(P["night950"], -0.55), 255)
    # taban
    d.polygon(
        [(size * 0.40, size * 0.80), (size * 0.60, size * 0.80), (size * 0.565, size * 0.70), (size * 0.435, size * 0.70)],
        fill=dark,
    )
    d.rectangle([size * 0.455, size * 0.63, size * 0.545, size * 0.71], fill=dark)
    # cam gövde
    d.polygon(
        [
            (size * 0.415, size * 0.63),
            (size * 0.585, size * 0.63),
            (size * 0.555, size * 0.40),
            (size * 0.445, size * 0.40),
        ],
        fill=(*mix(P["moonGold"], P["night800"], 0.55), 170),
    )
    # metal kapak
    d.rectangle([size * 0.425, size * 0.355, size * 0.575, size * 0.402], fill=dark)
    d.rectangle([size * 0.468, size * 0.318, size * 0.532, size * 0.358], fill=dark)
    # sap
    d.arc([size * 0.40, size * 0.245, size * 0.60, size * 0.375], start=180, end=360, fill=dark, width=int(size * 0.012))
    img = paste_layer(img, lamp)
    # camın içindeki ateş böceği
    img = add_glow(img, (0.50, 0.515), 0.10, (255, 236, 180), 1.0, falloff=1.7)
    fly, df = new_layer(size)
    df.ellipse([size * 0.489, size * 0.505, size * 0.511, size * 0.527], fill=(255, 248, 214, 255))
    img = paste_layer(img, fly)
    img = scatter_dots(img, 606, 24, (0.10, 0.10, 0.90, 0.60), P["moonGold"], (1.4, 3.0), (30, 95))
    return finish(img, 6, "bottom")


def elif_page_7(size: int) -> Image.Image:
    """"Bahçenin dibinde yüzlerce küçük ışık yanıp sönüyordu." — pencereden bakış."""
    img = vertical_gradient(
        size, [(0.0, shade(P["royalPurple"], -0.45)), (0.55, P["night900"]), (1.0, (8, 16, 14))]
    )
    img = scatter_dots(img, 701, 40, (0.06, 0.06, 0.94, 0.42), P["lavenderPale"], (1.4, 3.0), (40, 150))
    # bahçe: tepe silueti + ağaç
    garden, dg = new_layer(size)
    dg.ellipse([-size * 0.30, size * 0.62, size * 0.75, size * 1.25], fill=(*shade((18, 34, 30), -0.15), 255))
    dg.ellipse([size * 0.45, size * 0.70, size * 1.35, size * 1.30], fill=(*shade((14, 28, 26), -0.10), 255))
    dg.rectangle([size * 0.775, size * 0.55, size * 0.815, size * 0.80], fill=(10, 18, 18, 255))
    dg.ellipse([size * 0.67, size * 0.36, size * 0.93, size * 0.60], fill=(12, 24, 22, 255))
    img = paste_layer(img, garden)
    # ateş böcekleri
    img = scatter_dots(img, 702, 220, (0.03, 0.50, 0.97, 0.97), P["moonGold"], (2.0, 5.2), (70, 235), glow=size * 0.010)
    # pencere çerçevesi (ön planda, karşı ışıkta)
    frame, dfm = new_layer(size)
    fc = (5, 9, 16, 255)
    dfm.rectangle([0, 0, size, size * 0.055], fill=fc)
    dfm.rectangle([0, size * 0.945, size, size], fill=fc)
    dfm.rectangle([0, 0, size * 0.055, size], fill=fc)
    dfm.rectangle([size * 0.945, 0, size, size], fill=fc)
    dfm.rectangle([size * 0.485, 0, size * 0.515, size], fill=fc)
    dfm.rectangle([0, size * 0.485, size, size * 0.515], fill=fc)
    img = paste_layer(img, frame)
    return finish(img, 7, "bottom", vig=0.30)


def elif_page_8(size: int) -> Image.Image:
    """""Yapamıyorum," dedi." — sıkışan metal kapak, bir kere daha denemek."""
    img = _room(size, shade(P["night800"], -0.25), (5, 9, 18))
    img = add_glow(img, (0.30, 0.40), 0.42, mix(P["moonGold"], P["coral"], 0.35), 0.62, falloff=2.6)
    lamp, d = new_layer(size)
    dark = (4, 8, 14, 255)
    d.polygon(
        [(size * 0.33, size * 0.92), (size * 0.71, size * 0.92), (size * 0.655, size * 0.76), (size * 0.385, size * 0.76)],
        fill=dark,
    )
    d.polygon(
        [(size * 0.355, size * 0.77), (size * 0.685, size * 0.77), (size * 0.635, size * 0.40), (size * 0.405, size * 0.40)],
        fill=(*mix(P["moonGold"], P["night950"], 0.62), 190),
    )
    d.rectangle([size * 0.375, size * 0.325, size * 0.665, size * 0.408], fill=dark)
    img = paste_layer(img, lamp)
    # iki el silueti kapağa bastırıyor
    hands, dh = new_layer(size)
    dh.ellipse([size * 0.235, size * 0.290, size * 0.435, size * 0.425], fill=dark)
    dh.ellipse([size * 0.605, size * 0.290, size * 0.805, size * 0.425], fill=dark)
    dh.polygon([(size * 0.12, size * 0.62), (size * 0.32, size * 0.33), (size * 0.40, size * 0.40), (size * 0.22, size * 0.68)], fill=dark)
    dh.polygon([(size * 0.88, size * 0.62), (size * 0.68, size * 0.33), (size * 0.60, size * 0.40), (size * 0.78, size * 0.68)], fill=dark)
    img = paste_layer(img, hands)
    img = add_glow(img, (0.52, 0.53), 0.11, P["moonGold"], 0.75)
    img = scatter_dots(img, 808, 22, (0.05, 0.10, 0.95, 0.55), P["peach"], (1.4, 3.0), (25, 85))
    return finish(img, 8, "bottom")


def elif_page_9(size: int) -> Image.Image:
    """"Minicik bir 'tık' sesi duyuldu ve kapak açıldı." — Işıl havalanır."""
    img = _room(size, shade(P["royalPurple"], -0.30), (6, 11, 20))
    img = add_glow(img, (0.42, 0.60), 0.40, P["moonGold"], 0.70, falloff=2.4)
    lamp, d = new_layer(size)
    dark = (4, 8, 14, 255)
    d.polygon(
        [(size * 0.28, size * 1.00), (size * 0.60, size * 1.00), (size * 0.555, size * 0.84), (size * 0.325, size * 0.84)],
        fill=dark,
    )
    d.polygon(
        [(size * 0.30, size * 0.85), (size * 0.58, size * 0.85), (size * 0.545, size * 0.58), (size * 0.335, size * 0.58)],
        fill=(*mix(P["moonGold"], P["night950"], 0.55), 175),
    )
    # açılmış kapak — yana devrik
    d.polygon(
        [(size * 0.30, size * 0.575), (size * 0.575, size * 0.575), (size * 0.62, size * 0.505), (size * 0.345, size * 0.505)],
        fill=dark,
    )
    img = paste_layer(img, lamp)
    # ışın hüzmeleri
    rays, dr = new_layer(size)
    for i in range(9):
        ang = -0.9 + i * 0.225
        import math

        x2 = size * (0.44 + math.cos(ang - 1.57) * 0.9)
        y2 = size * (0.55 + math.sin(ang - 1.57) * 0.9)
        dr.line([(size * 0.44, size * 0.55), (x2, y2)], fill=(*P["moonGold"], 34), width=int(size * 0.012))
    img = paste_layer(img, rays.filter(ImageFilter.GaussianBlur(size * 0.006)))
    # ateş böceğinin izi — pencereye doğru yay
    trail, dt = new_layer(size)
    pts = [(0.44, 0.55), (0.52, 0.44), (0.62, 0.36), (0.70, 0.30), (0.77, 0.26), (0.83, 0.235)]
    for i, (x, y) in enumerate(pts):
        r = size * (0.006 + i * 0.0022)
        a = 90 + i * 30
        dt.ellipse([size * x - r, size * y - r, size * x + r, size * y + r], fill=(255, 246, 205, min(255, a)))
    img = paste_layer(img, trail.filter(ImageFilter.GaussianBlur(size * 0.004)))
    img = paste_layer(img, trail)
    img = add_glow(img, (0.83, 0.235), 0.13, (255, 240, 190), 0.95, falloff=1.8)
    # aralanmış pencere
    win, dw = new_layer(size)
    dw.rectangle([size * 0.72, size * 0.10, size * 0.98, size * 0.40], fill=(*shade(P["night800"], -0.10), 90))
    dw.rectangle([size * 0.72, size * 0.10, size * 0.735, size * 0.40], fill=(4, 8, 14, 255))
    img = paste_layer(img, win)
    return finish(img, 9, "top")


def elif_page_10(size: int) -> Image.Image:
    """"Karanlık bahçe bir anda gökyüzüne benzedi." — yüzlerce ateş böceği."""
    img = vertical_gradient(
        size,
        [(0.0, shade(P["royalPurple"], -0.40)), (0.40, shade(P["night900"], 0.10)), (1.0, (10, 22, 20))],
    )
    img = scatter_dots(img, 1001, 55, (0.02, 0.02, 0.98, 0.40), P["lavenderPale"], (1.4, 3.2), (45, 165))
    hills, dh = new_layer(size)
    dh.ellipse([-size * 0.35, size * 0.55, size * 0.85, size * 1.30], fill=(*shade((16, 32, 28), 0.02), 255))
    dh.ellipse([size * 0.30, size * 0.66, size * 1.45, size * 1.35], fill=(11, 24, 22, 255))
    dh.rectangle([size * 0.20, size * 0.52, size * 0.235, size * 0.74], fill=(9, 18, 18, 255))
    dh.ellipse([size * 0.10, size * 0.34, size * 0.34, size * 0.58], fill=(12, 26, 24, 255))
    img = paste_layer(img, hills)
    img = scatter_dots(img, 1002, 380, (0.02, 0.35, 0.98, 0.99), P["moonGold"], (2.2, 6.0), (80, 250), glow=size * 0.011)
    # pencerenin önündeki üç parlak yanıp sönme
    three, dt = new_layer(size)
    for i, x in enumerate((0.775, 0.835, 0.895)):
        r = size * (0.011 - i * 0.001)
        dt.ellipse([size * x - r, size * 0.30 - r, size * x + r, size * 0.30 + r], fill=(255, 250, 220, 255))
    img = paste_layer(img, three.filter(ImageFilter.GaussianBlur(size * 0.010)))
    img = paste_layer(img, three)
    return finish(img, 10, "bottom", vig=0.34)


def elif_page_11(size: int) -> Image.Image:
    """"Yorganın altına süzüldü... artık yukarısı da korkutucu değildi." — huzur."""
    img = vertical_gradient(
        size,
        [(0.0, shade(P["night900"], 0.20)), (0.5, mix(P["night800"], P["lavender"], 0.22)), (1.0, shade(P["night950"], 0.06))],
    )
    img = add_glow(img, (0.16, 0.30), 0.36, P["babyBlue"], 0.40, falloff=2.4)
    img = add_glow(img, (0.5, 0.19), 0.30, P["moonGold"], 0.42, falloff=2.6)
    layer, d = new_layer(size)
    d.polygon([(0, 0), (size, 0), (size * 0.80, size * 0.28), (size * 0.20, size * 0.28)], fill=(*shade(P["night900"], -0.28), 255))
    # kapalı kapak — ince bir çizgi
    d.polygon(
        [(size * 0.36, size * 0.085), (size * 0.64, size * 0.085), (size * 0.60, size * 0.225), (size * 0.40, size * 0.225)],
        fill=(*shade(P["night950"], -0.38), 255),
    )
    img = paste_layer(img, layer)
    quilt, dq = new_layer(size)
    dq.ellipse([-size * 0.22, size * 0.60, size * 1.22, size * 1.42], fill=(*mix(P["night700"], P["lavender"], 0.16), 255))
    dq.ellipse([-size * 0.10, size * 0.72, size * 1.10, size * 1.50], fill=(*shade(P["night700"], -0.20), 255))
    img = paste_layer(img, quilt)
    figs, df = new_layer(size)
    df.ellipse([size * 0.36, size * 0.505, size * 0.55, size * 0.695], fill=INK)
    df.ellipse([size * 0.345, size * 0.492, size * 0.565, size * 0.630], fill=INK)
    fox_silhouette(df, size, 0.665, 0.715, 0.185, INK)
    img = paste_layer(img, figs)
    img = scatter_dots(img, 1101, 22, (0.05, 0.05, 0.95, 0.55), P["lavenderPale"], (1.4, 3.0), (35, 115))
    return finish(img, 11, "bottom")


def elif_page_12(size: int) -> Image.Image:
    """"Cesaret, tıpkı Işıl gibi, en çok karanlıkta parlıyordu." — kapanış."""
    img = vertical_gradient(
        size,
        [(0.0, P["deepPlum"]), (0.35, shade(P["royalPurple"], -0.10)), (0.72, P["night900"]), (1.0, (8, 16, 26))],
    )
    img = scatter_dots(img, 1201, 90, (0.0, 0.0, 1.0, 0.72), P["lavenderPale"], (1.4, 3.6), (45, 200))
    img = add_glow(img, (0.72, 0.22), 0.26, P["moonGold"], 0.80, falloff=2.2)
    moon, d = new_layer(size)
    d.ellipse([size * 0.645, size * 0.145, size * 0.795, size * 0.295], fill=(*P["moonGold"], 245))
    img = paste_layer(img, moon)
    # çatı silueti
    roofs, dr = new_layer(size)
    dark = (5, 10, 18, 255)
    dr.polygon([(0, size * 0.98), (0, size * 0.80), (size * 0.16, size * 0.66), (size * 0.32, size * 0.80), (size * 0.32, size * 0.98)], fill=dark)
    dr.polygon([(size * 0.30, size * 0.98), (size * 0.30, size * 0.84), (size * 0.52, size * 0.70), (size * 0.74, size * 0.84), (size * 0.74, size * 0.98)], fill=dark)
    dr.polygon([(size * 0.70, size * 0.98), (size * 0.70, size * 0.78), (size * 0.86, size * 0.64), (size * 1.0, size * 0.78), (size, size * 0.98)], fill=dark)
    dr.rectangle([size * 0.44, size * 0.86, size * 0.50, size * 0.98], fill=dark)
    img = paste_layer(img, roofs)
    # tavan arası penceresinde küçük sarı ışık
    img = add_glow(img, (0.52, 0.815), 0.075, P["moonGold"], 0.95, falloff=1.9)
    win, dw = new_layer(size)
    dw.rectangle([size * 0.497, size * 0.795, size * 0.543, size * 0.842], fill=(*P["moonGold"], 240))
    img = paste_layer(img, win)
    img = scatter_dots(img, 1202, 60, (0.02, 0.62, 0.98, 0.97), P["moonGold"], (1.8, 4.2), (60, 190), glow=size * 0.009)
    return finish(img, 12, "bottom", vig=0.30)


def elif_cover(size: int) -> Image.Image:
    """Kapak — tavan arası penceresi yanan bir ev, gece göğü, yıldızlar."""
    img = vertical_gradient(
        size,
        [(0.0, P["deepPlum"]), (0.42, P["royalPurple"]), (0.78, shade(P["night900"], 0.05)), (1.0, (7, 14, 24))],
    )
    img = scatter_dots(img, 9001, 120, (0.0, 0.0, 1.0, 0.78), P["lavenderPale"], (1.5, 4.0), (50, 220))
    img = add_glow(img, (0.24, 0.20), 0.24, P["moonGold"], 0.70, falloff=2.2)
    moon, d = new_layer(size)
    d.ellipse([size * 0.16, size * 0.12, size * 0.32, size * 0.28], fill=(*P["moonGold"], 245))
    img = paste_layer(img, moon)
    house, dh = new_layer(size)
    dark = (6, 11, 20, 255)
    dh.polygon([(size * 0.22, size * 1.0), (size * 0.22, size * 0.72), (size * 0.52, size * 0.44), (size * 0.82, size * 0.72), (size * 0.82, size * 1.0)], fill=dark)
    dh.rectangle([size * 0.30, size * 0.80, size * 0.40, size * 0.92], fill=(*mix(P["moonGold"], P["night900"], 0.55), 255))
    dh.rectangle([size * 0.62, size * 0.80, size * 0.72, size * 0.92], fill=(*mix(P["moonGold"], P["night900"], 0.70), 255))
    img = paste_layer(img, house)
    img = add_glow(img, (0.52, 0.615), 0.13, P["moonGold"], 1.0, falloff=1.9)
    attic, da = new_layer(size)
    da.polygon(
        [(size * 0.465, size * 0.585), (size * 0.575, size * 0.585), (size * 0.575, size * 0.655), (size * 0.465, size * 0.655)],
        fill=(*P["moonGold"], 250),
    )
    img = paste_layer(img, attic)
    img = scatter_dots(img, 9002, 70, (0.02, 0.86, 0.98, 1.0), P["moonGold"], (2.0, 5.0), (70, 230), glow=size * 0.010)
    return finish(img, 900, None, vig=0.36)


# ── 2. Ahmet ve Kaybolan Deniz Feneri — ilk 4 sayfa + kapak ───────────────────


def _sea(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    return vertical_gradient(size, [(0.0, top), (0.58, mix(top, bottom, 0.55)), (1.0, bottom)])


def ahmet_page_1(size: int) -> Image.Image:
    """"O akşam fener yanmadı. Balıkçılar iskelede toplandı." """
    img = _sea(size, mix(P["night800"], P["nightBlue"], 0.28), (6, 16, 28))
    img = add_glow(img, (0.82, 0.30), 0.42, P["nightBlue"], 0.42, falloff=2.4)
    img = scatter_dots(img, 2001, 60, (0.0, 0.0, 1.0, 0.45), P["lavenderPale"], (1.4, 3.2), (50, 170))
    sea, d = new_layer(size)
    d.rectangle([0, size * 0.62, size, size], fill=(*shade(P["night950"], -0.20), 255))
    for i in range(16):
        y = size * (0.64 + i * 0.022)
        d.line([(0, y), (size, y)], fill=(*mix(P["night700"], P["dustyBlue"], 0.25), 26 + i * 3), width=max(1, int(size * 0.003)))
    img = paste_layer(img, sea)
    tower, dt = new_layer(size)
    dark = (5, 12, 20, 255)
    dt.polygon([(size * 0.74, size * 0.66), (size * 0.90, size * 0.66), (size * 0.865, size * 0.20), (size * 0.775, size * 0.20)], fill=dark)
    dt.rectangle([size * 0.762, size * 0.155, size * 0.878, size * 0.205], fill=dark)
    dt.polygon([(size * 0.762, size * 0.155), (size * 0.878, size * 0.155), (size * 0.82, size * 0.10)], fill=dark)
    img = paste_layer(img, tower)
    pier, dp = new_layer(size)
    dp.rectangle([0, size * 0.80, size * 0.58, size * 0.845], fill=(6, 14, 22, 255))
    for i in range(6):
        x = size * (0.04 + i * 0.095)
        dp.rectangle([x, size * 0.845, x + size * 0.018, size * 0.95], fill=(6, 14, 22, 255))
    for i, x in enumerate((0.10, 0.18, 0.245, 0.33, 0.40, 0.47)):
        child_silhouette(dp, size, x, 0.802, 0.115 + (i % 3) * 0.012, (4, 9, 16, 255), hair="bob")
    img = paste_layer(img, pier)
    img = scatter_dots(img, 2002, 9, (0.05, 0.70, 0.52, 0.79), P["moonGold"], (2.5, 4.5), (110, 210), glow=size * 0.008)
    return finish(img, 21, "bottom")


def ahmet_page_2(size: int) -> Image.Image:
    """"Kapı aralıktı. İçerisi zifiri karanlıktı ve tuz kokuyordu." """
    img = _sea(size, mix(P["night800"], P["nightBlue"], 0.22), (6, 14, 24))
    img = scatter_dots(img, 2100, 30, (0.0, 0.0, 1.0, 0.30), P["lavenderPale"], (1.4, 3.0), (40, 130))
    # fenerin taş duvarı
    wall, d = new_layer(size)
    d.rectangle([size * 0.06, size * 0.10, size * 0.94, size], fill=(*shade(P["night800"], -0.28), 255))
    for i in range(13):
        y = size * (0.14 + i * 0.068)
        d.line([(size * 0.06, y), (size * 0.94, y)], fill=(*shade(P["night950"], -0.10), 110), width=max(1, int(size * 0.004)))
    for i in range(9):
        x = size * (0.10 + i * 0.095)
        d.line([(x, size * 0.10), (x, size)], fill=(*shade(P["night950"], -0.10), 60), width=max(1, int(size * 0.003)))
    img = paste_layer(img, wall)
    # kemerli kapı boşluğu — içerisi zifiri
    door, dd = new_layer(size)
    dd.pieslice([size * 0.30, size * 0.20, size * 0.70, size * 0.60], start=180, end=360, fill=(2, 4, 8, 255))
    dd.rectangle([size * 0.30, size * 0.40, size * 0.70, size * 0.98], fill=(2, 4, 8, 255))
    # aralık: kanat sola devrik
    dd.polygon(
        [(size * 0.30, size * 0.30), (size * 0.185, size * 0.36), (size * 0.185, size * 0.94), (size * 0.30, size * 0.98)],
        fill=(*shade(P["night950"], -0.35), 255),
    )
    dd.ellipse([size * 0.215, size * 0.645, size * 0.245, size * 0.675], fill=(*P["moonGold"], 190))
    img = paste_layer(img, door)
    # eşikteki çocuk + el feneri hüzmesi
    beam, dbm = new_layer(size)
    dbm.polygon(
        [(size * 0.455, size * 0.660), (size * 0.492, size * 0.640), (size * 0.62, size * 0.30), (size * 0.40, size * 0.28)],
        fill=(*P["moonGold"], 40),
    )
    img = paste_layer(img, beam.filter(ImageFilter.GaussianBlur(size * 0.014)))
    figs, df = new_layer(size)
    child_silhouette(df, size, 0.475, 0.99, 0.46, (2, 5, 10, 255), facing=1, arm_up=True, hair="bob")
    img = paste_layer(img, figs)
    img = add_glow(img, (0.505, 0.645), 0.10, P["moonGold"], 0.95, falloff=1.8)
    flash, dfl = new_layer(size)
    dfl.ellipse([size * 0.490, size * 0.630, size * 0.520, size * 0.660], fill=(255, 248, 214, 255))
    img = paste_layer(img, flash)
    return finish(img, 22, "bottom")


def ahmet_page_3(size: int) -> Image.Image:
    """"En üstte, dev lambanın yanında yaşlı fenerci Rıza Amca oturuyordu." """
    img = _room(size, shade(P["night900"], 0.02), (5, 11, 18))
    img = add_glow(img, (0.55, 0.30), 0.40, mix(P["moonGold"], P["peach"], 0.4), 0.55, falloff=2.5)
    stairs, d = new_layer(size)
    dark = (4, 9, 15, 255)
    # sarmal merdiven — daralarak yükselen basamaklar
    import math as _m

    for i in range(12):
        t = i / 11
        y = size * (0.96 - t * 0.56)
        w = size * (0.30 - t * 0.11) * (0.45 + 0.55 * abs(_m.cos(i * 0.62)))
        side = 1 if _m.cos(i * 0.62) >= 0 else -1
        x0 = size * 0.50 + (size * 0.022 * side)
        d.rounded_rectangle(
            [min(x0, x0 + side * w), y, max(x0, x0 + side * w), y + size * 0.030],
            radius=size * 0.010,
            fill=(*mix(P["night800"], P["moonGold"], 0.06 + t * 0.20), 255),
        )
    d.rectangle([size * 0.478, size * 0.30, size * 0.522, size * 1.0], fill=dark)
    img = paste_layer(img, stairs)
    lamp, dl = new_layer(size)
    dl.rectangle([size * 0.40, size * 0.115, size * 0.70, size * 0.145], fill=dark)
    dl.ellipse([size * 0.445, size * 0.155, size * 0.655, size * 0.325], fill=(*mix(P["moonGold"], P["night800"], 0.22), 225))
    dl.rectangle([size * 0.415, size * 0.320, size * 0.685, size * 0.360], fill=dark)
    for gx in (0.47, 0.55, 0.63):
        dl.rectangle([size * gx, size * 0.150, size * (gx + 0.012), size * 0.330], fill=(*dark[:3], 190))
    img = paste_layer(img, lamp)
    img = add_glow(img, (0.55, 0.235), 0.24, P["moonGold"], 0.70)
    figs, df = new_layer(size)
    # oturan yaşlı adam silueti: yuvarlak gövde + kafa
    df.ellipse([size * 0.735, size * 0.455, size * 0.895, size * 0.615], fill=dark)
    df.ellipse([size * 0.775, size * 0.395, size * 0.855, size * 0.475], fill=dark)
    df.rounded_rectangle([size * 0.730, size * 0.600, size * 0.910, size * 0.665], radius=size * 0.014, fill=dark)
    child_silhouette(df, size, 0.30, 0.80, 0.26, dark, facing=1, hair="bob")
    img = paste_layer(img, figs)
    return finish(img, 23, "bottom")


def ahmet_page_4(size: int) -> Image.Image:
    """"El fenerini yaktı ve iskeleye doğru üç kez salladı." """
    img = _sea(size, shade(P["royalPurple"], -0.42), (6, 16, 26))
    img = scatter_dots(img, 2301, 40, (0.0, 0.0, 1.0, 0.40), P["lavenderPale"], (1.4, 3.0), (40, 140))
    sea, d = new_layer(size)
    d.rectangle([0, size * 0.70, size, size], fill=(*shade(P["night800"], -0.40), 255))
    img = paste_layer(img, sea)
    beam, db = new_layer(size)
    db.polygon(
        [(size * 0.20, size * 0.30), (size * 0.24, size * 0.255), (size * 1.02, size * 0.60), (size * 1.02, size * 0.74)],
        fill=(*P["moonGold"], 46),
    )
    img = paste_layer(img, beam.filter(ImageFilter.GaussianBlur(size * 0.012)))
    tower, dt = new_layer(size)
    dark = (4, 10, 18, 255)
    dt.polygon([(size * 0.10, size * 0.86), (size * 0.30, size * 0.86), (size * 0.265, size * 0.26), (size * 0.135, size * 0.26)], fill=dark)
    dt.rectangle([size * 0.118, size * 0.215, size * 0.282, size * 0.268], fill=dark)
    img = paste_layer(img, tower)
    img = add_glow(img, (0.20, 0.285), 0.15, P["moonGold"], 1.0, falloff=1.8)
    flash, dfl = new_layer(size)
    dfl.ellipse([size * 0.175, size * 0.262, size * 0.225, size * 0.312], fill=(255, 250, 220, 255))
    img = paste_layer(img, flash)
    # iskelede yanıp sönen el fenerleri
    img = scatter_dots(img, 2302, 14, (0.62, 0.72, 0.98, 0.80), P["moonGold"], (3.0, 6.0), (130, 240), glow=size * 0.012)
    pier, dp = new_layer(size)
    dp.rectangle([size * 0.58, size * 0.80, size, size * 0.84], fill=(5, 12, 20, 255))
    for i in range(4):
        x = size * (0.64 + i * 0.09)
        dp.rectangle([x, size * 0.84, x + size * 0.016, size * 0.92], fill=(5, 12, 20, 255))
    img = paste_layer(img, pier)
    return finish(img, 24, "bottom")


def ahmet_page_5(size: int) -> Image.Image:
    """"Balıkçılar merdivenleri tırmanır, herkes bir iş üstlenir." """
    img = _room(size, shade(P["night900"], 0.06), (6, 12, 20))
    img = add_glow(img, (0.52, 0.18), 0.36, P["moonGold"], 0.60, falloff=2.4)
    stairs, d = new_layer(size)
    for i in range(9):
        t = i / 8
        y = size * (0.95 - t * 0.62)
        half = size * (0.36 - t * 0.15)
        d.rounded_rectangle(
            [size * 0.5 - half, y, size * 0.5 + half, y + size * 0.032],
            radius=size * 0.010,
            fill=(*mix(P["night800"], P["moonGold"], 0.05 + t * 0.18), 255),
        )
    img = paste_layer(img, stairs)
    figs, df = new_layer(size)
    dark = (4, 9, 16, 255)
    for i, (cx, by, h) in enumerate(((0.36, 0.93, 0.20), (0.60, 0.80, 0.18), (0.42, 0.66, 0.16), (0.62, 0.53, 0.14))):
        child_silhouette(df, size, cx, by, h, dark, facing=1, arm_up=i % 2 == 0, hair="bob")
    img = paste_layer(img, figs)
    return finish(img, 25, "bottom")


def ahmet_page_6(size: int) -> Image.Image:
    """"Yeni ampul çok ağırdır; tek başına taşınamaz." """
    img = _room(size, shade(P["night800"], -0.18), (5, 11, 19))
    img = add_glow(img, (0.5, 0.47), 0.34, P["moonGold"], 0.55, falloff=2.6)
    bulb, d = new_layer(size)
    d.ellipse([size * 0.36, size * 0.33, size * 0.64, size * 0.61], fill=(*mix(P["moonGold"], P["night800"], 0.30), 225))
    d.polygon(
        [(size * 0.445, size * 0.60), (size * 0.555, size * 0.60), (size * 0.535, size * 0.70), (size * 0.465, size * 0.70)],
        fill=(4, 9, 16, 255),
    )
    img = paste_layer(img, bulb)
    figs, df = new_layer(size)
    dark = (4, 9, 16, 255)
    child_silhouette(df, size, 0.24, 0.97, 0.40, dark, facing=1, arm_up=True, hair="bob")
    child_silhouette(df, size, 0.76, 0.97, 0.40, dark, facing=-1, arm_up=True, hair="ponytail")
    img = paste_layer(img, figs)
    return finish(img, 26, "bottom")


def ahmet_page_7(size: int) -> Image.Image:
    """"Ahmet halat düğümünü dedesinden öğrendiği gibi atar." """
    img = _sea(size, mix(P["night800"], P["nightBlue"], 0.20), (6, 14, 24))
    img = scatter_dots(img, 2701, 34, (0.0, 0.0, 1.0, 0.40), P["lavenderPale"], (1.4, 3.0), (40, 130))
    tower, d = new_layer(size)
    dark = (4, 10, 18, 255)
    d.polygon([(size * 0.62, size * 1.0), (size * 0.92, size * 1.0), (size * 0.875, size * 0.16), (size * 0.665, size * 0.16)], fill=dark)
    img = paste_layer(img, tower)
    rope, dr = new_layer(size)
    pts = [(0.20, 0.72), (0.32, 0.52), (0.46, 0.40), (0.60, 0.34), (0.70, 0.32)]
    for i in range(len(pts) - 1):
        dr.line(
            [(size * pts[i][0], size * pts[i][1]), (size * pts[i + 1][0], size * pts[i + 1][1])],
            fill=(*mix(P["peach"], P["ink900"], 0.30), 235),
            width=int(size * 0.011),
        )
    img = paste_layer(img, rope)
    figs, df = new_layer(size)
    child_silhouette(df, size, 0.20, 0.98, 0.42, dark, facing=1, arm_up=True, hair="bob")
    img = paste_layer(img, figs)
    img = add_glow(img, (0.77, 0.20), 0.14, P["moonGold"], 0.55)
    return finish(img, 27, "bottom")


def ahmet_page_8(size: int) -> Image.Image:
    """"Ampul yerine oturur ama kablo eksiktir." """
    img = _room(size, shade(P["night900"], 0.02), (5, 10, 18))
    lamp, d = new_layer(size)
    dark = (4, 9, 16, 255)
    d.rectangle([size * 0.30, size * 0.14, size * 0.70, size * 0.19], fill=dark)
    d.ellipse([size * 0.375, size * 0.24, size * 0.625, size * 0.49], fill=(*mix(P["night700"], P["moonGold"], 0.16), 220))
    d.rectangle([size * 0.345, size * 0.485, size * 0.655, size * 0.525], fill=dark)
    for gx in (0.40, 0.49, 0.58):
        d.rectangle([size * gx, size * 0.235, size * (gx + 0.012), size * 0.495], fill=(*dark[:3], 190))
    img = paste_layer(img, lamp)
    cable, dc = new_layer(size)
    pts = [(0.50, 0.525), (0.47, 0.62), (0.53, 0.70), (0.44, 0.78)]
    for i in range(len(pts) - 1):
        dc.line(
            [(size * pts[i][0], size * pts[i][1]), (size * pts[i + 1][0], size * pts[i + 1][1])],
            fill=(*shade(P["night700"], -0.30), 255),
            width=int(size * 0.010),
        )
    dc.ellipse([size * 0.425, size * 0.775, size * 0.455, size * 0.805], fill=(*P["coral"], 220))
    img = paste_layer(img, cable)
    figs, df = new_layer(size)
    child_silhouette(df, size, 0.78, 0.99, 0.34, dark, facing=-1, hair="bob")
    img = paste_layer(img, figs)
    img = add_glow(img, (0.44, 0.79), 0.10, P["coral"], 0.45)
    return finish(img, 28, "bottom")


def ahmet_page_9(size: int) -> Image.Image:
    """"Rıza Amca sağlam eliyle tarif eder, çocuklar uygular." """
    img = _room(size, shade(P["night800"], -0.12), (6, 12, 20))
    img = add_glow(img, (0.5, 0.30), 0.40, mix(P["moonGold"], P["peach"], 0.35), 0.52, falloff=2.5)
    lamp, d = new_layer(size)
    dark = (4, 9, 16, 255)
    d.ellipse([size * 0.40, size * 0.16, size * 0.60, size * 0.36], fill=(*mix(P["moonGold"], P["night800"], 0.35), 220))
    d.rectangle([size * 0.375, size * 0.355, size * 0.625, size * 0.395], fill=dark)
    img = paste_layer(img, lamp)
    figs, df = new_layer(size)
    df.ellipse([size * 0.08, size * 0.60, size * 0.27, size * 0.79], fill=dark)
    df.ellipse([size * 0.125, size * 0.525, size * 0.215, size * 0.615], fill=dark)
    df.line([(size * 0.245, size * 0.665), (size * 0.40, size * 0.545)], fill=dark, width=int(size * 0.026))
    df.rounded_rectangle([size * 0.07, size * 0.775, size * 0.285, size * 0.845], radius=size * 0.016, fill=dark)
    child_silhouette(df, size, 0.60, 0.97, 0.34, dark, facing=-1, arm_up=True, hair="bob")
    child_silhouette(df, size, 0.83, 0.97, 0.31, dark, facing=-1, hair="ponytail")
    img = paste_layer(img, figs)
    return finish(img, 29, "bottom")


def ahmet_page_10(size: int) -> Image.Image:
    """"Fener bir kez titrer ve söner; herkes sessizleşir." """
    img = _sea(size, shade(P["night950"], 0.04), (4, 9, 16))
    img = scatter_dots(img, 3001, 26, (0.0, 0.0, 1.0, 0.40), P["lavenderPale"], (1.3, 2.8), (25, 90))
    img = add_glow(img, (0.5, 0.26), 0.22, P["moonGold"], 0.22, falloff=2.8)
    lamp, d = new_layer(size)
    dark = (3, 7, 13, 255)
    d.ellipse([size * 0.40, size * 0.17, size * 0.60, size * 0.37], fill=(*mix(P["night700"], P["moonGold"], 0.10), 220))
    d.rectangle([size * 0.375, size * 0.365, size * 0.625, size * 0.405], fill=dark)
    d.rectangle([size * 0.30, size * 0.125, size * 0.70, size * 0.165], fill=dark)
    img = paste_layer(img, lamp)
    figs, df = new_layer(size)
    for cx, h in ((0.24, 0.30), (0.42, 0.28), (0.62, 0.31), (0.80, 0.27)):
        child_silhouette(df, size, cx, 0.99, h, dark, facing=1, hair="bob")
    img = paste_layer(img, figs)
    return finish(img, 30, "bottom", vig=0.36)


def ahmet_page_11(size: int) -> Image.Image:
    """"İkinci denemede fener yanar, deniz aydınlanır." """
    img = _sea(size, mix(P["royalPurple"], P["nightBlue"], 0.35), (7, 20, 34))
    img = scatter_dots(img, 3101, 45, (0.0, 0.0, 1.0, 0.40), P["lavenderPale"], (1.4, 3.2), (45, 160))
    beam, db = new_layer(size)
    db.polygon([(size * 0.30, size * 0.30), (size * 0.34, size * 0.255), (size * 1.05, size * 0.16), (size * 1.05, size * 0.52)], fill=(*P["moonGold"], 58))
    db.polygon([(size * 0.28, size * 0.30), (size * 0.24, size * 0.255), (-size * 0.05, size * 0.44), (-size * 0.05, size * 0.66)], fill=(*P["moonGold"], 42))
    img = paste_layer(img, beam.filter(ImageFilter.GaussianBlur(size * 0.016)))
    sea, d = new_layer(size)
    d.rectangle([0, size * 0.64, size, size], fill=(*shade(P["night800"], -0.30), 255))
    for i in range(18):
        y = size * (0.66 + i * 0.019)
        d.line([(0, y), (size, y)], fill=(*P["moonGold"], 18 + i * 4), width=max(1, int(size * 0.003)))
    img = paste_layer(img, sea)
    tower, dt = new_layer(size)
    dark = (4, 10, 18, 255)
    dt.polygon([(size * 0.20, size * 0.86), (size * 0.40, size * 0.86), (size * 0.365, size * 0.26), (size * 0.235, size * 0.26)], fill=dark)
    dt.rectangle([size * 0.218, size * 0.215, size * 0.382, size * 0.268], fill=dark)
    img = paste_layer(img, tower)
    img = add_glow(img, (0.30, 0.285), 0.20, P["moonGold"], 1.0, falloff=1.7)
    return finish(img, 31, "bottom", vig=0.28)


def ahmet_page_12(size: int) -> Image.Image:
    """"Yardım istemek utanılacak bir şey değildir." — fenerin balkonunda iki siluet."""
    img = _sea(size, mix(P["deepPlum"], P["nightBlue"], 0.30), (8, 22, 36))
    img = scatter_dots(img, 3201, 70, (0.0, 0.0, 1.0, 0.55), P["lavenderPale"], (1.5, 3.6), (50, 190))
    img = add_glow(img, (0.5, 0.20), 0.34, P["moonGold"], 0.75, falloff=2.2)
    lamp, d = new_layer(size)
    dark = (4, 10, 18, 255)
    d.ellipse([size * 0.41, size * 0.11, size * 0.59, size * 0.29], fill=(*P["moonGold"], 240))
    d.rectangle([size * 0.36, size * 0.285, size * 0.64, size * 0.325], fill=dark)
    d.rectangle([size * 0.20, size * 0.60, size * 0.80, size * 0.645], fill=dark)
    for gx in range(7):
        x = size * (0.22 + gx * 0.093)
        d.rectangle([x, size * 0.50, x + size * 0.012, size * 0.60], fill=dark)
    d.rectangle([size * 0.20, size * 0.495, size * 0.80, size * 0.515], fill=dark)
    img = paste_layer(img, lamp)
    figs, df = new_layer(size)
    child_silhouette(df, size, 0.40, 0.60, 0.24, dark, facing=1, hair="bob")
    df.ellipse([size * 0.545, size * 0.455, size * 0.665, size * 0.575], fill=dark)
    df.ellipse([size * 0.575, size * 0.395, size * 0.645, size * 0.465], fill=dark)
    img = paste_layer(img, figs)
    sea, ds = new_layer(size)
    ds.rectangle([0, size * 0.78, size, size], fill=(*shade(P["night800"], -0.28), 255))
    for i in range(10):
        y = size * (0.80 + i * 0.020)
        ds.line([(0, y), (size, y)], fill=(*P["moonGold"], 14 + i * 3), width=max(1, int(size * 0.003)))
    img = paste_layer(img, sea)
    return finish(img, 32, "bottom", vig=0.30)


def ahmet_cover(size: int) -> Image.Image:
    img = _sea(size, P["deepPlum"], (6, 18, 30))
    img = scatter_dots(img, 2401, 100, (0.0, 0.0, 1.0, 0.62), P["lavenderPale"], (1.5, 3.8), (45, 200))
    beam, db = new_layer(size)
    db.polygon([(size * 0.62, size * 0.32), (size * 0.66, size * 0.28), (size * 0.06, size * 0.70), (size * 0.02, size * 0.60)], fill=(*P["moonGold"], 52))
    img = paste_layer(img, beam.filter(ImageFilter.GaussianBlur(size * 0.014)))
    sea, d = new_layer(size)
    d.rectangle([0, size * 0.72, size, size], fill=(*shade(P["night800"], -0.32), 255))
    for i in range(12):
        y = size * (0.74 + i * 0.022)
        d.line([(0, y), (size, y)], fill=(*P["dustyBlue"], 24 + i * 4), width=max(1, int(size * 0.003)))
    img = paste_layer(img, sea)
    tower, dt = new_layer(size)
    dark = (5, 12, 20, 255)
    dt.polygon([(size * 0.56, size * 0.80), (size * 0.76, size * 0.80), (size * 0.725, size * 0.30), (size * 0.595, size * 0.30)], fill=dark)
    dt.rectangle([size * 0.578, size * 0.255, size * 0.742, size * 0.305], fill=dark)
    dt.polygon([(size * 0.578, size * 0.255), (size * 0.742, size * 0.255), (size * 0.66, size * 0.20)], fill=dark)
    img = paste_layer(img, tower)
    img = add_glow(img, (0.66, 0.28), 0.16, P["moonGold"], 1.0, falloff=1.8)
    return finish(img, 240, None, vig=0.34)


# ── 3. Deniz’e İyi Geceler — 0-2 bandı, 8 sayfa ────────────────────────────
#
# 0-2 kitabının görsel dili DİĞERLERİNDEN AYRIDIR ve öyle olmalıdır: gece
# sahnesi değil, tek bir büyük nesne, yüksek karşıtlık, pastel zemin, az
# ayrıntı. Bebek kitabı bunu ister.


def _baby_bg(size: int, top: RGB, bottom: RGB) -> Image.Image:
    return vertical_gradient(size, [(0.0, top), (1.0, bottom)])


def deniz_page_1(size: int) -> Image.Image:
    """"Gökyüzü karardı. Ay geldi. İyi geceler ay." """
    img = _baby_bg(size, mix(P["royalPurple"], P["lavender"], 0.35), P["lavenderPale"])
    img = add_glow(img, (0.5, 0.42), 0.40, P["moonGold"], 0.55, falloff=2.2)
    moon, d = new_layer(size)
    d.ellipse([size * 0.30, size * 0.22, size * 0.70, size * 0.62], fill=(*P["warmWhite"], 250))
    d.ellipse([size * 0.395, size * 0.315, size * 0.445, size * 0.365], fill=(*P["linen"], 220))
    d.ellipse([size * 0.545, size * 0.415, size * 0.615, size * 0.485], fill=(*P["linen"], 200))
    img = paste_layer(img, moon)
    img = scatter_dots(img, 4001, 26, (0.03, 0.03, 0.97, 0.90), P["warmWhite"], (4.0, 9.0), (150, 245))
    return finish(img, 41, "bottom", vig=0.18)


def deniz_page_2(size: int) -> Image.Image:
    """"Kuşlar yuvaya girdi. Cik cik." """
    img = _baby_bg(size, P["babyBlue"], mix(P["lavenderPale"], P["warmWhite"], 0.5))
    layer, d = new_layer(size)
    branch = (*mix(P["taupe600"], P["ink900"], 0.35), 255)
    d.line([(0, size * 0.30), (size * 0.72, size * 0.44)], fill=branch, width=int(size * 0.035))
    d.line([(size * 0.34, size * 0.365), (size * 0.52, size * 0.24)], fill=branch, width=int(size * 0.020))
    d.ellipse([size * 0.40, size * 0.42, size * 0.78, size * 0.66], fill=(*mix(P["peach"], P["taupe600"], 0.35), 255))
    for cx, r, col in ((0.500, 0.070, P["dustyBlue"]), (0.630, 0.062, P["coral"]), (0.730, 0.052, P["sage"])):
        cy = 0.415
        d.ellipse([size * (cx - r), size * (cy - r * 0.86), size * (cx + r), size * (cy + r * 0.86)], fill=(*col, 255))
        d.ellipse([size * (cx - r * 0.62), size * (cy - r * 1.35), size * (cx + r * 0.18), size * (cy - r * 0.20)], fill=(*col, 255))
        d.ellipse(
            [size * (cx - r * 0.42), size * (cy - r * 0.95), size * (cx - r * 0.24), size * (cy - r * 0.77)],
            fill=(*P["ink900"], 235),
        )
        d.polygon(
            [
                (size * (cx - r * 0.62), size * (cy - r * 0.72)),
                (size * (cx - r * 1.02), size * (cy - r * 0.58)),
                (size * (cx - r * 0.60), size * (cy - r * 0.42)),
            ],
            fill=(*P["amber300"], 255),
        )
    img = paste_layer(img, layer)
    return finish(img, 42, "bottom", vig=0.16)


def deniz_page_3(size: int) -> Image.Image:
    """"Kedi minderine kıvrıldı. Mırr." """
    img = _baby_bg(size, mix(P["peach"], P["warmWhite"], 0.45), P["sand"])
    layer, d = new_layer(size)
    d.ellipse([size * 0.12, size * 0.52, size * 0.88, size * 0.86], fill=(*P["mintGreen"], 255))
    cat = (*mix(P["taupe600"], P["ink900"], 0.45), 255)
    d.ellipse([size * 0.26, size * 0.40, size * 0.74, size * 0.74], fill=cat)
    d.ellipse([size * 0.545, size * 0.365, size * 0.735, size * 0.555], fill=cat)
    d.polygon([(size * 0.565, size * 0.40), (size * 0.595, size * 0.30), (size * 0.645, size * 0.395)], fill=cat)
    d.polygon([(size * 0.665, size * 0.385), (size * 0.715, size * 0.295), (size * 0.735, size * 0.415)], fill=cat)
    d.arc([size * 0.16, size * 0.58, size * 0.46, size * 0.82], start=20, end=200, fill=cat, width=int(size * 0.045))
    img = paste_layer(img, layer)
    return finish(img, 43, "bottom", vig=0.16)


def deniz_page_4(size: int) -> Image.Image:
    """"Kaşık tabağa yattı. Çıt yok." """
    img = _baby_bg(size, mix(P["mintGreen"], P["warmWhite"], 0.35), P["cream"])
    layer, d = new_layer(size)
    d.ellipse([size * 0.14, size * 0.28, size * 0.86, size * 0.82], fill=(*P["warmWhite"], 255))
    d.ellipse([size * 0.22, size * 0.34, size * 0.78, size * 0.76], fill=(*P["babyBlue"], 255))
    spoon = (*mix(P["taupe600"], P["ink900"], 0.20), 255)
    d.ellipse([size * 0.30, size * 0.44, size * 0.44, size * 0.60], fill=spoon)
    d.line([(size * 0.40, size * 0.56), (size * 0.68, size * 0.66)], fill=spoon, width=int(size * 0.030))
    img = paste_layer(img, layer)
    return finish(img, 44, "bottom", vig=0.14)


def deniz_page_5(size: int) -> Image.Image:
    """"Toplar sepete girdi. Pat pat." """
    img = _baby_bg(size, mix(P["peach"], P["warmWhite"], 0.30), P["sand"])
    layer, d = new_layer(size)
    basket = (*mix(P["peach"], P["ink900"], 0.42), 255)
    for cx, cy, r, col in ((0.34, 0.44, 0.115, P["coral"]), (0.58, 0.40, 0.13, P["dustyBlue"]), (0.72, 0.50, 0.10, P["sage"])):
        d.ellipse([size * (cx - r), size * (cy - r), size * (cx + r), size * (cy + r)], fill=(*col, 255))
    d.polygon(
        [(size * 0.18, size * 0.55), (size * 0.82, size * 0.55), (size * 0.72, size * 0.88), (size * 0.28, size * 0.88)],
        fill=basket,
    )
    for i in range(5):
        y = size * (0.60 + i * 0.062)
        d.line([(size * (0.185 + i * 0.010), y), (size * (0.815 - i * 0.010), y)], fill=(*P["sand"], 120), width=int(size * 0.012))
    img = paste_layer(img, layer)
    return finish(img, 45, "bottom", vig=0.16)


def deniz_page_6(size: int) -> Image.Image:
    """"Ayı yastığa yattı. Mışıl mışıl." """
    img = _baby_bg(size, P["lavenderPale"], mix(P["lavenderPale"], P["warmWhite"], 0.6))
    layer, d = new_layer(size)
    d.rounded_rectangle([size * 0.10, size * 0.52, size * 0.90, size * 0.86], radius=size * 0.09, fill=(*P["warmWhite"], 255))
    bear = (*mix(P["peach"], P["ink900"], 0.48), 255)
    d.ellipse([size * 0.30, size * 0.44, size * 0.70, size * 0.78], fill=bear)
    d.ellipse([size * 0.375, size * 0.315, size * 0.625, size * 0.565], fill=bear)
    d.ellipse([size * 0.335, size * 0.295, size * 0.435, size * 0.395], fill=bear)
    d.ellipse([size * 0.565, size * 0.295, size * 0.665, size * 0.395], fill=bear)
    d.ellipse([size * 0.455, size * 0.435, size * 0.545, size * 0.505], fill=(*P["sand"], 255))
    img = paste_layer(img, layer)
    return finish(img, 46, "bottom", vig=0.14)


def deniz_page_7(size: int) -> Image.Image:
    """"Deniz esnedi. Küçük eller yavaşladı. Uyku geldi." """
    img = _baby_bg(size, mix(P["babyBlue"], P["lavenderPale"], 0.5), mix(P["warmWhite"], P["peach"], 0.25))
    layer, d = new_layer(size)
    skin = (*mix(P["peach"], P["taupe600"], 0.30), 255)
    d.ellipse([size * 0.28, size * 0.26, size * 0.72, size * 0.70], fill=skin)
    d.ellipse([size * 0.255, size * 0.235, size * 0.745, size * 0.505], fill=(*mix(P["taupe600"], P["ink900"], 0.45), 255))
    d.ellipse([size * 0.435, size * 0.545, size * 0.565, size * 0.645], fill=(*mix(P["coral"], P["ink900"], 0.35), 255))
    d.arc([size * 0.335, size * 0.435, size * 0.435, size * 0.485], start=200, end=340, fill=(*P["ink900"], 220), width=int(size * 0.012))
    d.arc([size * 0.565, size * 0.435, size * 0.665, size * 0.485], start=200, end=340, fill=(*P["ink900"], 220), width=int(size * 0.012))
    d.rounded_rectangle([size * 0.16, size * 0.74, size * 0.84, size * 1.02], radius=size * 0.06, fill=(*P["mintGreen"], 255))
    img = paste_layer(img, layer)
    return finish(img, 47, "bottom", vig=0.16)


def deniz_page_8(size: int) -> Image.Image:
    """"İyi geceler Deniz. Yarın yine oynarız." """
    img = _baby_bg(size, mix(P["royalPurple"], P["lavender"], 0.45), P["lavenderPale"])
    img = add_glow(img, (0.78, 0.24), 0.24, P["moonGold"], 0.60, falloff=2.2)
    layer, d = new_layer(size)
    d.ellipse([size * 0.70, size * 0.14, size * 0.86, size * 0.30], fill=(*P["warmWhite"], 245))
    d.rounded_rectangle([size * 0.10, size * 0.56, size * 0.90, size * 0.88], radius=size * 0.05, fill=(*P["warmWhite"], 255))
    d.rounded_rectangle([size * 0.14, size * 0.62, size * 0.86, size * 0.88], radius=size * 0.04, fill=(*P["babyBlue"], 255))
    d.ellipse([size * 0.19, size * 0.505, size * 0.35, size * 0.665], fill=(*mix(P["peach"], P["taupe600"], 0.28), 255))
    d.ellipse([size * 0.175, size * 0.487, size * 0.365, size * 0.590], fill=(*mix(P["taupe600"], P["ink900"], 0.45), 255))
    for i, x in enumerate((0.46, 0.53, 0.60)):
        r = size * (0.016 - i * 0.003)
        d.ellipse([size * x - r, size * (0.45 + i * 0.03) - r, size * x + r, size * (0.45 + i * 0.03) + r], fill=(*P["warmWhite"], 220))
    img = paste_layer(img, layer)
    img = scatter_dots(img, 4801, 16, (0.03, 0.03, 0.97, 0.45), P["warmWhite"], (3.5, 7.0), (140, 235))
    return finish(img, 48, "bottom", vig=0.18)


def deniz_cover(size: int) -> Image.Image:
    img = _baby_bg(size, mix(P["royalPurple"], P["lavender"], 0.40), P["lavenderPale"])
    img = add_glow(img, (0.5, 0.38), 0.42, P["moonGold"], 0.50, falloff=2.2)
    layer, d = new_layer(size)
    d.ellipse([size * 0.32, size * 0.20, size * 0.68, size * 0.56], fill=(*P["warmWhite"], 250))
    d.ellipse([size * 0.30, size * 0.62, size * 0.46, size * 0.78], fill=(*mix(P["peach"], P["taupe600"], 0.28), 255))
    d.ellipse([size * 0.54, size * 0.62, size * 0.70, size * 0.78], fill=(*mix(P["mintGreen"], P["ink900"], 0.25), 255))
    img = paste_layer(img, layer)
    img = scatter_dots(img, 4901, 30, (0.03, 0.03, 0.97, 0.95), P["warmWhite"], (3.5, 8.0), (140, 245))
    return finish(img, 49, None, vig=0.20)


def deniz_sheet(size: int) -> Image.Image:
    img = vertical_gradient(size, [(0.0, P["warmWhite"]), (1.0, P["babyBlue"])])
    grid, d = new_layer(size)
    for i in range(1, 3):
        d.line([(size * i / 3, size * 0.10), (size * i / 3, size * 0.94)], fill=(*P["taupe600"], 70), width=max(1, int(size * 0.003)))
    d.line([(size * 0.04, size * 0.10), (size * 0.96, size * 0.10)], fill=(*P["taupe600"], 70), width=max(1, int(size * 0.003)))
    img = paste_layer(img, grid)
    figs, df = new_layer(size)
    skin = (*mix(P["peach"], P["taupe600"], 0.32), 255)
    hair = (*mix(P["taupe600"], P["ink900"], 0.45), 255)
    for cx in (1 / 6, 0.5, 5 / 6):
        df.ellipse([size * (cx - 0.115), size * 0.40, size * (cx + 0.115), size * 0.63], fill=skin)
        df.ellipse([size * (cx - 0.125), size * 0.385, size * (cx + 0.125), size * 0.525], fill=hair)
        df.rounded_rectangle([size * (cx - 0.10), size * 0.63, size * (cx + 0.10), size * 0.84], radius=size * 0.04, fill=(*P["mintGreen"], 255))
    img = paste_layer(img, figs)
    return finish(img, 50, None, vig=0.16)


# ── Sanat stili önizlemeleri ──────────────────────────────────────────────────


def style_suluboya(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), P["cream"])
    blobs, d = new_layer(size)
    for cx, cy, r, col, a in (
        (0.34, 0.36, 0.26, P["peach"], 150),
        (0.62, 0.44, 0.24, P["dustyBlue"], 135),
        (0.46, 0.66, 0.22, P["sage"], 130),
        (0.70, 0.72, 0.16, P["lavender"], 120),
    ):
        d.ellipse([size * (cx - r), size * (cy - r), size * (cx + r), size * (cy + r)], fill=(*col, a))
    img = paste_layer(img, blobs.filter(ImageFilter.GaussianBlur(size * 0.045)))
    edge, de = new_layer(size)
    de.ellipse([size * 0.30, size * 0.30, size * 0.66, size * 0.62], outline=(*P["taupe600"], 60), width=max(1, int(size * 0.004)))
    img = paste_layer(img, edge.filter(ImageFilter.GaussianBlur(size * 0.006)))
    return finish(img, 31, None, vig=0.16)


def style_pastel(size: int) -> Image.Image:
    img = vertical_gradient(size, [(0.0, P["lavenderPale"]), (0.5, P["babyBlue"]), (1.0, P["mintGreen"])])
    shapes, d = new_layer(size)
    d.ellipse([size * 0.18, size * 0.22, size * 0.62, size * 0.66], fill=(*P["warmWhite"], 165))
    d.ellipse([size * 0.48, size * 0.44, size * 0.86, size * 0.82], fill=(*P["peach"], 150))
    img = paste_layer(img, shapes.filter(ImageFilter.GaussianBlur(size * 0.02)))
    outline, do = new_layer(size)
    do.ellipse([size * 0.18, size * 0.22, size * 0.62, size * 0.66], outline=(*P["taupe600"], 95), width=max(2, int(size * 0.010)))
    img = paste_layer(img, outline)
    return finish(img, 32, None, vig=0.14)


def style_kesik_kagit(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), P["sand"])
    layer, d = new_layer(size)
    d.polygon([(0, size * 0.62), (size * 0.42, size * 0.40), (size * 0.78, size * 0.58), (size, size * 0.46), (size, size), (0, size)], fill=(*P["sage"], 255))
    d.polygon([(0, size * 0.74), (size * 0.30, size * 0.58), (size * 0.66, size * 0.76), (size, size * 0.62), (size, size), (0, size)], fill=(*mix(P["sage"], P["ink900"], 0.30), 255))
    d.polygon([(size * 0.55, size * 0.10), (size * 0.80, size * 0.10), (size * 0.80, size * 0.34), (size * 0.55, size * 0.34)], fill=(*P["coral"], 255))
    d.ellipse([size * 0.14, size * 0.12, size * 0.34, size * 0.32], fill=(*P["amber300"], 255))
    img = paste_layer(img, layer)
    return finish(img, 33, None, vig=0.14)


def style_cizgi_defter(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), P["warmWhite"])
    layer, d = new_layer(size)
    for i in range(22):
        y = size * (0.06 + i * 0.042)
        d.line([(0, y), (size, y)], fill=(*P["dustyBlue"], 45), width=max(1, int(size * 0.002)))
    ink = (*P["ink900"], 210)
    d.ellipse([size * 0.30, size * 0.24, size * 0.70, size * 0.64], outline=ink, width=max(2, int(size * 0.006)))
    d.line([(size * 0.34, size * 0.66), (size * 0.44, size * 0.86)], fill=ink, width=max(2, int(size * 0.006)))
    d.line([(size * 0.66, size * 0.66), (size * 0.58, size * 0.86)], fill=ink, width=max(2, int(size * 0.006)))
    img = paste_layer(img, layer)
    img = scatter_dots(img, 34, 260, (0.34, 0.30, 0.66, 0.60), P["ink900"], (1.5, 2.6), (40, 110))
    return finish(img, 34, None, vig=0.12)


def style_anadolu(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), mix(P["dustyBlue"], P["ink900"], 0.45))
    layer, d = new_layer(size)
    cini = (*mix(P["dustyBlue"], (255, 255, 255), 0.25), 255)
    warm = (*P["amber300"], 255)
    step = size / 6
    for r in range(6):
        for c in range(6):
            cx, cy = (c + 0.5) * step, (r + 0.5) * step
            s = step * 0.34
            col = cini if (r + c) % 2 == 0 else warm
            d.polygon([(cx, cy - s), (cx + s, cy), (cx, cy + s), (cx - s, cy)], fill=col)
            d.polygon([(cx, cy - s * 0.45), (cx + s * 0.45, cy), (cx, cy + s * 0.45), (cx - s * 0.45, cy)], fill=(*mix(P["ink900"], P["dustyBlue"], 0.3), 255))
    img = paste_layer(img, layer)
    return finish(img, 35, None, vig=0.20)


# ── Kitap formatı önizlemeleri ────────────────────────────────────────────────


def _book_mock(size: int, hard: bool) -> Image.Image:
    img = vertical_gradient(size, [(0.0, P["cream"]), (1.0, P["linen"])])
    layer, d = new_layer(size)
    d.rounded_rectangle([size * 0.20, size * 0.22, size * 0.80, size * 0.80], radius=size * 0.02, fill=(*mix(P["taupe600"], (0, 0, 0), 0.4), 55))
    d.rounded_rectangle(
        [size * 0.18, size * 0.20, size * 0.78, size * 0.78],
        radius=size * 0.02 if hard else size * 0.012,
        fill=(*P["royalPurple"], 255),
    )
    d.rectangle([size * 0.18, size * 0.20, size * 0.235, size * 0.78], fill=(*shade(P["royalPurple"], -0.25), 255))
    d.ellipse([size * 0.40, size * 0.34, size * 0.60, size * 0.54], fill=(*P["moonGold"], 235))
    d.rectangle([size * 0.32, size * 0.60, size * 0.66, size * 0.635], fill=(*P["lavenderPale"], 210))
    d.rectangle([size * 0.36, size * 0.655, size * 0.60, size * 0.678], fill=(*P["lavenderPale"], 150))
    img = paste_layer(img, layer)
    return finish(img, 41 if hard else 42, None, vig=0.18)


# ── Karakter kartları ─────────────────────────────────────────────────────────


def character_card(
    size: int,
    seed: int,
    bg: tuple[RGB, RGB],
    hair: str,
    with_fox: bool,
    accent: RGB,
) -> Image.Image:
    """Karakter SİLUET kartı — gerçek karakter tasarımı değil, yer tutucu portre.

    S09 varyant seçimi ekranı üç ayrı görsel bekler; üçü farklı palet ve farklı
    saç siluetiyle ayırt edilebilir olsun diye böyle üretilir."""
    img = vertical_gradient(size, [(0.0, bg[0]), (1.0, bg[1])])
    img = add_glow(img, (0.5, 0.42), 0.46, accent, 0.55, falloff=2.4)
    figs, d = new_layer(size)
    dark = (10, 14, 24, 235)
    child_silhouette(d, size, 0.50 if not with_fox else 0.44, 1.00, 0.60, dark, facing=1, hair=hair)
    if with_fox:
        fox_silhouette(d, size, 0.755, 0.985, 0.24, dark)
    img = paste_layer(img, figs)
    img = scatter_dots(img, seed, 26, (0.04, 0.04, 0.96, 0.50), P["lavenderPale"], (1.6, 3.4), (45, 150))
    return finish(img, seed, None, vig=0.34)


def character_sheet(size: int, seed: int, accent: RGB) -> Image.Image:
    """'Model sheet' karesi: aynı siluetin üç duruşu — tutarlılık fikrini anlatır."""
    img = vertical_gradient(size, [(0.0, P["sand"]), (1.0, P["linen"])])
    grid, d = new_layer(size)
    for i in range(1, 3):
        d.line([(size * i / 3, size * 0.10), (size * i / 3, size * 0.94)], fill=(*P["taupe600"], 70), width=max(1, int(size * 0.003)))
    d.line([(size * 0.04, size * 0.10), (size * 0.96, size * 0.10)], fill=(*P["taupe600"], 70), width=max(1, int(size * 0.003)))
    img = paste_layer(img, grid)
    figs, df = new_layer(size)
    dark = (*mix(P["ink900"], accent, 0.25), 240)
    child_silhouette(df, size, 1 / 6, 0.88, 0.50, dark, facing=1, hair="ponytail")
    child_silhouette(df, size, 0.5, 0.88, 0.50, dark, facing=-1, hair="ponytail")
    child_silhouette(df, size, 5 / 6, 0.88, 0.50, dark, facing=1, arm_up=True, hair="ponytail")
    img = paste_layer(img, figs)
    return finish(img, seed, None, vig=0.18)


def fox_sheet(size: int, seed: int) -> Image.Image:
    img = vertical_gradient(size, [(0.0, P["warmWhite"]), (1.0, P["peach"])])
    figs, d = new_layer(size)
    dark = (*mix(P["coral"], P["ink900"], 0.55), 245)
    fox_silhouette(d, size, 0.28, 0.84, 0.40, dark)
    fox_silhouette(d, size, 0.70, 0.84, 0.40, dark)
    img = paste_layer(img, figs)
    return finish(img, seed, None, vig=0.18)


# ── Üretim listesi ────────────────────────────────────────────────────────────

JOBS: list[tuple[str, int, object]] = [
    ("elif-sayfa-01", PAGE, elif_page_1),
    ("elif-sayfa-02", PAGE, elif_page_2),
    ("elif-sayfa-03", PAGE, elif_page_3),
    ("elif-sayfa-04", PAGE, elif_page_4),
    ("elif-sayfa-05", PAGE, elif_page_5),
    ("elif-sayfa-06", PAGE, elif_page_6),
    ("elif-sayfa-07", PAGE, elif_page_7),
    ("elif-sayfa-08", PAGE, elif_page_8),
    ("elif-sayfa-09", PAGE, elif_page_9),
    ("elif-sayfa-10", PAGE, elif_page_10),
    ("elif-sayfa-11", PAGE, elif_page_11),
    ("elif-sayfa-12", PAGE, elif_page_12),
    ("elif-kapak", PAGE, elif_cover),
    ("ahmet-sayfa-01", PAGE, ahmet_page_1),
    ("ahmet-sayfa-02", PAGE, ahmet_page_2),
    ("ahmet-sayfa-03", PAGE, ahmet_page_3),
    ("ahmet-sayfa-04", PAGE, ahmet_page_4),
    ("ahmet-sayfa-05", PAGE, ahmet_page_5),
    ("ahmet-sayfa-06", PAGE, ahmet_page_6),
    ("ahmet-sayfa-07", PAGE, ahmet_page_7),
    ("ahmet-sayfa-08", PAGE, ahmet_page_8),
    ("ahmet-sayfa-09", PAGE, ahmet_page_9),
    ("ahmet-sayfa-10", PAGE, ahmet_page_10),
    ("ahmet-sayfa-11", PAGE, ahmet_page_11),
    ("ahmet-sayfa-12", PAGE, ahmet_page_12),
    ("ahmet-kapak", PAGE, ahmet_cover),
    ("deniz-sayfa-1", PAGE, deniz_page_1),
    ("deniz-sayfa-2", PAGE, deniz_page_2),
    ("deniz-sayfa-3", PAGE, deniz_page_3),
    ("deniz-sayfa-4", PAGE, deniz_page_4),
    ("deniz-sayfa-5", PAGE, deniz_page_5),
    ("deniz-sayfa-6", PAGE, deniz_page_6),
    ("deniz-sayfa-7", PAGE, deniz_page_7),
    ("deniz-sayfa-8", PAGE, deniz_page_8),
    ("deniz-kapak", PAGE, deniz_cover),
    ("karakter-deniz-sheet", CARD, deniz_sheet),
    ("stil-suluboya", SWATCH, style_suluboya),
    ("stil-pastel", SWATCH, style_pastel),
    ("stil-kesik-kagit", SWATCH, style_kesik_kagit),
    ("stil-cizgi-defter", SWATCH, style_cizgi_defter),
    ("stil-anadolu", SWATCH, style_anadolu),
    ("format-kare21-sert", SWATCH, lambda s: _book_mock(s, True)),
    ("format-kare21-yumusak", SWATCH, lambda s: _book_mock(s, False)),
    ("karakter-elif-v1", CARD, lambda s: character_card(s, 51, (P["royalPurple"], P["night950"]), "ponytail", True, P["moonGold"])),
    ("karakter-elif-v2", CARD, lambda s: character_card(s, 52, (P["night800"], P["night950"]), "bob", True, P["dustyBlue"])),
    ("karakter-elif-v3", CARD, lambda s: character_card(s, 53, (shade(P["purple700"], -0.25), P["deepPlum"]), "ponytail", False, P["lavender"])),
    ("karakter-elif-sheet", CARD, lambda s: character_sheet(s, 54, P["purple600"])),
    ("karakter-findik-sheet", CARD, lambda s: fox_sheet(s, 55)),
    ("karakter-ahmet-sheet", CARD, lambda s: character_sheet(s, 56, P["dustyBlue"])),
    ("karakter-zeynep-v1", CARD, lambda s: character_card(s, 57, (shade(P["nightBlue"], -0.45), P["night950"]), "bob", False, P["babyBlue"])),
    ("karakter-zeynep-v2", CARD, lambda s: character_card(s, 58, (shade(P["purple800"], -0.15), P["deepPlum"]), "ponytail", False, P["lavenderPale"])),
    ("karakter-zeynep-v3", CARD, lambda s: character_card(s, 59, (shade(P["sage"], -0.55), P["night950"]), "bob", True, P["mintGreen"])),
]


def main() -> None:
    total = 0
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for name, size, fn in JOBS:
        if only is not None and only not in name:
            continue
        img = fn(size)  # type: ignore[operator]
        path = os.path.join(OUT, f"{name}.webp")
        n = save_webp(img, path)
        total += n
        print(f"{name:26s} {size:>5}px  {n / 1024:7.1f} KB")
    print(f"\n{'TOPLAM':26s}        {total / 1024:7.1f} KB")


if __name__ == "__main__":
    main()
