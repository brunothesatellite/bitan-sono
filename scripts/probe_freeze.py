"""Reproduce: does a settings write break the live stream on real hardware?

Scenarios:
  A) live running, then WRITE_SETTINGS (zeros padding), keep polling
  B) live running, then WRITE_SETTINGS (0x23 padding, as the original), keep polling
  C) live stopped, WRITE_SETTINGS, then start live
It also prints the raw frames received so we can see what the device answers.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

from slm import protocol as P
from slm import usb


def main() -> int:
    infos = usb.find_device()
    if not infos:
        print("sonomètre absent")
        return 1

    transport = usb.HidTransport(infos[0])
    frames: list[bytes] = []
    transport.on_report = lambda data: frames.append(bytes(data))
    transport.open()
    print(f"ouvert: {infos[0].label}")

    def poll(tag: str, count: int, timeout: float = 1.2) -> list:
        out = []
        for _ in range(count):
            frames.clear()
            transport.write(P.read_point())
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline and not frames:
                time.sleep(0.01)
            if frames:
                raw = frames[0]
                try:
                    m = P.parse_read_point(raw)
                    out.append(round(m.value, 1))
                except Exception as exc:
                    out.append(f"parse-error({exc})")
            else:
                out.append(None)
            time.sleep(0.35)
        print(f"  {tag}: {out}")
        return out

    print("\n--- A) live en cours puis WRITE_SETTINGS (padding 0x00) ---")
    poll("avant ", 4)
    transport.write(P.write_settings("SLOW", False, "A", 0))
    print("  écriture envoyée: ", [hex(b) for b in P.write_settings("SLOW", False, "A", 0)])
    time.sleep(0.5)
    poll("après ", 5)

    print("\n--- B) WRITE_SETTINGS avec padding 0x23 (trame d'origine) ---")
    frame = P.write_settings("SLOW", False, "A", 0, legacy_frame=True)[:9]
    print("  écriture envoyée: ", [hex(b) for b in frame])
    transport.write(frame)
    time.sleep(0.5)
    poll("après ", 5)

    print("\n--- C) live arrêté, WRITE_SETTINGS, puis reprise ---")
    time.sleep(1.0)
    transport.write(P.write_settings("SLOW", False, "A", 0))
    time.sleep(1.0)
    poll("reprise", 5)

    print("\n--- D) lecture de l'historique (handshake) ---")
    frames.clear()
    transport.write(P.handshake_history())
    time.sleep(0.6)
    print("  réponse handshake:", [hex(b) for b in frames[0]] if frames else "AUCUNE")
    poll("après hist", 3)

    transport.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
