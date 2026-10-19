"""Live measurements carry reception time/date.

The meter stamps its on-board log but not its live answers: without a stamp
here, the desktop table and the server-side exports show empty time/date
cells (the mobile UI masks this with a client-side fallback).
"""

from __future__ import annotations

import re
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from slm import protocol as P  # noqa: E402
from slm.config import AppSettings  # noqa: E402
from slm.device import DeviceController  # noqa: E402


class AnsweringTransport:
    """Answers READ_POINT with 45.0 dB, SLOW / A / range 0."""

    is_simulated = False

    def __init__(self) -> None:
        self.on_report = None

    def open(self) -> None:
        pass

    def close(self) -> None:
        pass

    def write(self, frame: bytes) -> None:
        if self.on_report is not None:
            self.on_report(bytes([0x00, 0x01, 0xC2, 0x00, 0, 0, 0, 0, 0]))


def test_live_measurements_are_stamped() -> None:
    events: list[dict] = []
    settings = AppSettings()
    settings.interval = 0.05
    ctrl = DeviceController(AnsweringTransport(), settings, events.append)
    assert ctrl.connect()
    ctrl.start_live()
    try:
        measurement = None
        deadline = time.monotonic() + 10.0
        while time.monotonic() < deadline:
            measurement = next((e for e in events if e["type"] == "measurement"), None)
            if measurement is not None:
                break
            time.sleep(0.02)
        assert measurement is not None, "no live measurement received"
        data = measurement["data"]
        assert data["source"] == "live"
        assert re.fullmatch(r"\d{2}:\d{2}:\d{2}", data["time"] or ""), data
        stamp = datetime.strptime(f'{data["date"]} {data["time"]}', "%Y-%m-%d %H:%M:%S")
        assert abs((datetime.now() - stamp).total_seconds()) < 120, data
    finally:
        ctrl.stop_live()
