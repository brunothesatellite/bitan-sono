"""Phase 0 validation against the physical meter.

    python scripts/probe_device.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from slm import usb  # noqa: E402
from slm.config import AppSettings  # noqa: E402
from slm.device import DeviceController  # noqa: E402


def main() -> int:
    print(usb.describe_devices())
    if not usb.is_connected():
        print("sonomètre absent")
        return 1

    events: list[dict] = []
    controller = DeviceController(usb.HidTransport(), AppSettings.load(), events.append)

    if not controller.connect():
        print("connexion impossible")
        return 1
    print("connecté")

    member = controller.read_once()
    print(f"lecture unique : {member.value} dB  ({member.mode}/{member.weighting} "
          f"range={member.range} max={member.max_hold} batt={member.battery_low})")

    print("mesure temps réel pendant 5 s…")
    controller.start_live()
    time.sleep(5)
    controller.stop_live()
    values = [e["data"]["value"] for e in events if e["type"] == "measurement"]
    print(f"  {len(values)} mesures : {values[:8]}{' …' if len(values) > 8 else ''}")

    print("téléchargement de l'historique…")
    records = controller.download_history()
    print(f"  {len(records)} enregistrements")
    for record in records[:4]:
        print(f"   #{record['no']:>3}  {record['value']:>5} dB  "
              f"{record['weighting']}  {record['date']} {record['time']}")
    if len(records) > 4:
        print("   …")

    controller.disconnect()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
