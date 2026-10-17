"""Regression tests for the live polling loop.

The original defect: when the device stopped answering, ``_live_loop`` called
``stop_live()`` from its own thread, which did ``thread.join()`` on the current
thread and raised ``RuntimeError: cannot join current thread``. The thread died
silently (in the frozen build stderr is DEVNULL), the ``live/stopped`` event was
never emitted and the UI stayed on "measuring" with a frozen display forever.
"""

from __future__ import annotations

import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from slm import protocol as P  # noqa: E402
from slm.config import AppSettings  # noqa: E402
from slm.device import DeviceController  # noqa: E402


class FakeTransport:
    """Answers READ_POINT until told otherwise; ``open`` can be made to fail."""

    is_simulated = False

    def __init__(
        self,
        silent_for: int = 0,
        open_fails_after: int | None = None,
        answer: bool = True,
    ) -> None:
        self.on_report = None
        self.silent_for = silent_for  # number of writes answered with silence
        self.open_fails_after = open_fails_after
        self.writes = 0
        self.open_calls = 0
        self.close_calls = 0
        self.answer = answer

    def open(self) -> None:
        self.open_calls += 1
        if self.open_fails_after is not None and self.open_calls > self.open_fails_after:
            raise IOError("device busy")

    def close(self) -> None:
        self.close_calls += 1

    def write(self, frame: bytes) -> None:
        self.writes += 1
        if not self.answer or self.writes <= self.silent_for or not self.on_report:
            return
        command = frame[1] if len(frame) > 1 else 0
        if command == P.CMD_WRITE_SETTINGS:
            self.on_report(bytes([0x00, P.ACK_SETTINGS] + [0] * 7))
        else:
            # A READ_POINT answer: 45.0 dB, SLOW / A / range 0.
            self.on_report(bytes([0x00, 0x01, 0xC2, 0x00, 0, 0, 0, 0, 0]))


def make_controller(transport: FakeTransport, interval: float = 0.05):
    events: list[dict] = []
    settings = AppSettings()
    settings.interval = interval
    # Never touch the real %APPDATA%/bitan-sono/settings.json from tests.
    settings.save = lambda *a, **k: None  # type: ignore[assignment]
    return DeviceController(transport, settings, events.append), events


def only(events, kind, **fields):
    hits = [
        e
        for e in events
        if e["type"] == kind and all(e.get(k) == v for k, v in fields.items())
    ]
    assert len(hits) == 1, f"expected exactly one {kind} {fields}, got {hits}"
    return hits[0]


def wait_for(predicate, timeout: float = 20.0, step: float = 0.02) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(step)
    return False


def test_missing_device_stops_cleanly_and_announces_it():
    """The old code raised RuntimeError here and never emitted 'stopped'."""
    transport = FakeTransport(open_fails_after=1, answer=False)  # never answers
    ctrl, events = make_controller(transport)

    errors: list[str] = []
    previous = threading.excepthook
    threading.excepthook = lambda args: errors.append(f"{args.exc_type.__name__}: {args.exc_value}")
    try:
        assert ctrl.connect()
        ctrl.start_live()
        assert wait_for(lambda: not ctrl.live_running), "live loop never exited"
        time.sleep(0.1)
    finally:
        threading.excepthook = previous

    assert errors == [], f"live thread crashed: {errors}"
    assert ctrl._live_thread is None
    only(events, "live", state="stopped")
    only(events, "status", state="disconnected")


def test_device_going_quiet_recovers_without_stopping():
    """A few unanswered polls must trigger a reconnect, not a dead UI."""
    transport = FakeTransport(silent_for=6)
    ctrl, events = make_controller(transport)
    try:
        assert ctrl.connect()
        ctrl.start_live()
        # After 5 consecutive misses the loop reopens the device itself.
        assert wait_for(lambda: transport.open_calls >= 2, timeout=15), "no reconnect"
        only(events, "status", state="reconnecting")
        before = len([e for e in events if e["type"] == "measurement"])
        assert wait_for(
            lambda: len([e for e in events if e["type"] == "measurement"]) > before,
            timeout=10,
        ), "no measurement after recovery"
        assert ctrl.live_running, "live loop stopped instead of recovering"
        assert not [e for e in events if e["type"] == "live" and e["state"] == "stopped"]
    finally:
        ctrl.stop_live()
    only(events, "live", state="stopped")


def test_stop_live_is_idempotent():
    transport = FakeTransport()
    ctrl, events = make_controller(transport)
    assert ctrl.connect()
    ctrl.start_live()
    assert wait_for(lambda: any(e["type"] == "measurement" for e in events))
    ctrl.stop_live()
    ctrl.stop_live()  # a second call must not emit a second event
    time.sleep(0.1)
    only(events, "live", state="stopped")


def test_settings_write_keeps_live_stream_alive():
    """The reported scenario: saving settings while measuring."""
    transport = FakeTransport()
    ctrl, events = make_controller(transport)
    try:
        assert ctrl.connect()
        ctrl.start_live()
        assert wait_for(lambda: len([e for e in events if e["type"] == "measurement"]) >= 1)
        assert ctrl.write_settings("FAST", False, "C", 2) is True
        before = len([e for e in events if e["type"] == "measurement"])
        assert wait_for(
            lambda: len([e for e in events if e["type"] == "measurement"]) > before + 1
        ), "the stream stopped after saving settings"
        assert ctrl.live_running
    finally:
        ctrl.stop_live()


def test_finish_live_is_ignored_from_a_foreign_thread():
    """Only the owning loop may clear the handle / emit 'stopped'."""
    transport = FakeTransport()
    ctrl, events = make_controller(transport)
    assert ctrl.connect()
    ctrl.start_live()
    assert wait_for(lambda: ctrl._live_thread is not None)
    ctrl._finish_live()  # main thread: must be a no-op
    assert ctrl.live_running
    assert not [e for e in events if e["type"] == "live" and e["state"] == "stopped"]
    ctrl.stop_live()
