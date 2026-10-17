"""Regenerate web assets as original creations (MIT).

Replaces files previously copied from the proprietary SoundLab install:
  - highalarm.wav / lowalarm.wav : simple sine beeps (wave stdlib)
  - app.ico : original 64x64 icon (PNG-compressed ICO, zlib stdlib)
"""
import math
import struct
import wave
import zlib
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "web" / "assets"


def beep(path: Path, freq: float, beeps: int, dur: float = 0.18, rate: int = 22050) -> None:
    frames = bytearray()
    gap = int(rate * 0.09)
    for _ in range(beeps):
        n = int(rate * dur)
        for i in range(n):
            env = min(1.0, i / (rate * 0.01), (n - i) / (rate * 0.02))
            v = int(12000 * env * math.sin(2 * math.pi * freq * i / rate))
            frames += struct.pack("<h", v)
        frames += bytes(gap * 2)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(bytes(frames))
    print(f"{path.name}: {len(frames)//2} echantillons")


def png_rgba(w: int, h: int, rgba_fn) -> bytes:
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw += bytes(rgba_fn(x, y))
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    def chunk(typ: bytes, data: bytes) -> bytes:
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    sig = b"\x89PNG\r\n\x1a\n"
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")


def icon() -> None:
    s = 64
    accent = (45, 212, 167)
    bg = (17, 24, 39)
    def px(x: int, y: int):
        # rounded dark square
        r = 12
        inside = (r <= x < s - r or r <= y < s - r or
                  (x - r) ** 2 + (y - r) ** 2 < r * r or
                  (x - (s - r)) ** 2 + (y - r) ** 2 < r * r or
                  (x - r) ** 2 + (y - (s - r)) ** 2 < r * r or
                  (x - (s - r)) ** 2 + (y - (s - r)) ** 2 < r * r)
        if not inside:
            return (0, 0, 0, 0)
        # 4 vertical sound bars, middle ones taller
        bars = [(20, 26, 38), (28, 18, 46), (36, 18, 46), (44, 26, 38)]
        for bx, y0, y1 in bars:
            if bx - 2 <= x <= bx + 2 and y0 <= y <= y1:
                return (*accent, 255)
        return (*bg, 255)
    png = png_rgba(s, s, px)
    # ICO container with a single PNG-compressed entry
    header = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack("<BBBBHHII", s, s, 0, 0, 1, 32, len(png), 6 + 16)
    (ASSETS / "app.ico").write_bytes(header + entry + png)
    print(f"app.ico: {len(png)} octets PNG")


beep(ASSETS / "highalarm.wav", 880.0, 2)
beep(ASSETS / "lowalarm.wav", 440.0, 1)
icon()
