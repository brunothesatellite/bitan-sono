"""Génère l'icône de l'application mobile (SVG + PNG), sans dépendance externe.

Le dessin est le baromètre de la maison : un demi-cercle en quatre zones de
confort, une aiguille et son axe. Il est rasterisé ici en pur Python (zlib +
struct) pour éviter d'ajouter Pillow au projet.

    python tools/make_icons.py

Produit dans assets/ :
    icon.svg                (source vectorielle, favicon)
    icon-192.png            (PWA)
    icon-512.png            (PWA)
    icon-maskable-512.png   (PWA, fond plein bord)
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"

# Charte reprise de analysis.js / style.css
BG = (0x10, 0x1A, 0x2E, 0xFF)
ZONES = [
    (0x2D, 0xD4, 0xA7, 0xFF),
    (0xF5, 0xB5, 0x44, 0xFF),
    (0xFB, 0x92, 0x3C, 0xFF),
    (0xF8, 0x71, 0x71, 0xFF),
]
INK = (0xE8, 0xEE, 0xFB, 0xFF)
LIMITS = (30, 55, 65, 75, 90)

# Géométrie dans un carré de 512 unités
SIZE = 512
CX, CY, RADIUS = 256.0, 336.0, 176.0
STROKE = 46.0
NEEDLE = 60.0  # dB vers lequel pointe l'aiguille


def _polar(frac: float, r: float, scale: float = 1.0, dx: float = 0.0, dy: float = 0.0):
    angle = math.pi * (1.0 - frac)
    return (dx + CX * scale + r * scale * math.cos(angle), dy + CY * scale - r * scale * math.sin(angle))


def _frac(value: float) -> float:
    lo, hi = LIMITS[0], LIMITS[-1]
    return (min(hi, max(lo, value)) - lo) / (hi - lo)


def svg() -> str:
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">',
        '<rect width="512" height="512" rx="116" fill="#101a2e"/>',
    ]
    for i in range(4):
        x0, y0 = _polar(_frac(LIMITS[i]), RADIUS)
        x1, y1 = _polar(_frac(LIMITS[i + 1]), RADIUS)
        color = "#%02x%02x%02x" % ZONES[i][:3]
        parts.append(
            f'<path d="M{x0:.1f} {y0:.1f} A{RADIUS:.0f} {RADIUS:.0f} 0 0 1 {x1:.1f} {y1:.1f}" '
            f'fill="none" stroke="{color}" stroke-width="{STROKE:.0f}"/>'
        )
    nx, ny = _polar(_frac(NEEDLE), RADIUS - 26)
    parts.append(
        f'<line x1="{CX:.0f}" y1="{CY:.0f}" x2="{nx:.1f}" y2="{ny:.1f}" stroke="#e8eefb" '
        f'stroke-width="18" stroke-linecap="round"/>'
    )
    parts.append(f'<circle cx="{CX:.0f}" cy="{CY:.0f}" r="26" fill="#e8eefb"/>')
    parts.append("</svg>")
    return "\n".join(parts) + "\n"


# ---------------------------------------------------------------------- rendu


def _rounded_rect(x: float, y: float, size: float, radius: float) -> bool:
    half = size / 2.0
    qx = abs(x - half) - (half - radius)
    qy = abs(y - half) - (half - radius)
    d = math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - radius
    return d <= 0.0


def _sample(px: float, py: float, scale: float, inset: bool) -> tuple[int, int, int, int]:
    """Couleur d'un point, exprimée dans le repère 512 (scale = facteur)."""
    x = px / scale
    y = py / scale
    if inset:
        # Icône masquable : le dessin est réduit au centre du carré plein.
        cx = cy = SIZE / 2.0
        x = cx + (x - cx) / 0.62
        y = cy + (y - cy) / 0.62
        if not _rounded_rect(x, y, SIZE, 0.0):
            return BG
    elif not _rounded_rect(x, y, SIZE, 116):
        return (0, 0, 0, 0)

    # Aiguille et axe
    if math.hypot(x - CX, y - CY) <= 26:
        return INK
    nx, ny = _polar(_frac(NEEDLE), RADIUS - 26)
    vx, vy = nx - CX, ny - CY
    vlen = math.hypot(vx, vy)
    t = max(0.0, min(1.0, ((x - CX) * vx + (y - CY) * vy) / (vlen * vlen)))
    if math.hypot(x - (CX + t * vx), y - (CY + t * vy)) <= 9:
        return INK

    # Anneau des quatre zones
    dx, dy = x - CX, y - CY
    dist = math.hypot(dx, dy)
    if abs(dist - RADIUS) <= STROKE / 2:
        angle = math.atan2(-dy, dx)
        value = LIMITS[0] + (1 - angle / math.pi) * (LIMITS[-1] - LIMITS[0])
        if value <= LIMITS[1]:
            return ZONES[0]
        if value <= LIMITS[2]:
            return ZONES[1]
        if value <= LIMITS[3]:
            return ZONES[2]
        return ZONES[3]
    return BG


def render(size: int, inset: bool = False, supersample: int = 3) -> bytes:
    step = 1.0 / supersample
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(supersample):
                for sx in range(supersample):
                    r, g, b, a = _sample(
                        (px + (sx + 0.5) * step) * SIZE / size,
                        (py + (sy + 0.5) * step) * SIZE / size,
                        1.0,
                        inset,
                    )
                    acc[0] += r
                    acc[1] += g
                    acc[2] += b
                    acc[3] += a
            n = supersample * supersample
            row.extend((acc[0] // n, acc[1] // n, acc[2] // n, acc[3] // n))
        rows.append(bytes(row))
    return b"".join(rows)


def write_png(path: Path, size: int, pixels: bytes) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + pixels[y * size * 4 : (y + 1) * size * 4] for y in range(size))
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    (ASSETS / "icon.svg").write_text(svg(), encoding="utf-8")
    for size, inset, name in (
        (192, False, "icon-192.png"),
        (512, False, "icon-512.png"),
        (512, True, "icon-maskable-512.png"),
    ):
        write_png(ASSETS / name, size, render(size, inset=inset))
        print("écrit", ASSETS / name)


if __name__ == "__main__":
    main()
