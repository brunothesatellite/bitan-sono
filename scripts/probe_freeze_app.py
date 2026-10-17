"""Reproduce the app-level scenario: live running + settings saved.

Mimics exactly what the UI does when the user hits "Appliquer" while the
real-time measure is running, then reports whether the stream survives.
"""
from __future__ import annotations

import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

from slm import usb
from slm.config import AppSettings
from slm.device import DeviceController

EVENTS: list[dict] = []


def dump(tag: str) -> None:
    meas = [e["data"]["value"] for e in EVENTS if e["type"] == "measurement"]
    other = [f"{e['type']}/{e.get('state') or e.get('message', '')}" for e in EVENTS
             if e["type"] != "measurement"]
    print(f"  {tag}: {len(meas)} mesures {meas[-4:]} | evenements: {other[-4:]}")


def main() -> int:
    settings = AppSettings.load()
    ctrl = DeviceController(usb.HidTransport(), settings, EVENTS.append)

    print("1. connexion + démarrage du temps réel")
    assert ctrl.connect(), "connexion impossible"
    ctrl.start_live()
    time.sleep(3.5)
    dump("live")
    print(f"   connected={ctrl.connected} live_running={ctrl.live_running}")

    print("2. l'utilisateur clique « Appliquer » (device.write) depuis l'UI")
    ok = ctrl.write_settings("SLOW", False, "A", 0)
    print(f"   write_settings -> {ok};  connected={ctrl.connected} live_running={ctrl.live_running}")
    time.sleep(0.5)
    dump("juste après écriture")

    print("3. on attend 6 s pour voir si le flux reprend")
    time.sleep(6)
    dump("après 6 s")
    print(f"   connected={ctrl.connected} live_running={ctrl.live_running}")

    print("4. l'utilisateur re-clique « Démarrer »")
    ctrl.start_live()
    time.sleep(3)
    dump("après relance")
    print(f"   connected={ctrl.connected} live_running={ctrl.live_running}")

    ctrl.disconnect()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
