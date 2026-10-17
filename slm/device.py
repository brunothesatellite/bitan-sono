"""High level device session: live polling, settings, history download.

The controller owns a :class:`~slm.usb.HidTransport` (real hardware) or a
simulated transport and drives the same state machine as the original
application:

* *live*    - poll ``READ_POINT`` and decode measurements,
* *settings*- read the current configuration / push a new one,
* *history* - handshake then dump the on-board log.
"""

from __future__ import annotations

import logging
import queue
import threading
import time
from dataclasses import asdict
from typing import Callable, Protocol

from . import protocol as P
from .config import AppSettings

log = logging.getLogger(__name__)

Emit = Callable[[dict], None]


class Transport(Protocol):
    is_simulated: bool

    def open(self) -> None: ...
    def close(self) -> None: ...
    def write(self, frame: bytes) -> None: ...


class DeviceController:
    """Serialize access to the sound level meter."""

    def __init__(
        self,
        transport: Transport,
        settings: AppSettings,
        emit: Emit,
    ) -> None:
        self._transport = transport
        self._settings = settings
        self._emit = emit
        self._reports: queue.Queue[bytes] = queue.Queue()
        self._lock = threading.RLock()
        self._live_stop = threading.Event()
        self._live_thread: threading.Thread | None = None
        self._connected = False
        self._busy = False

    # -- plumbing ---------------------------------------------------------
    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def simulated(self) -> bool:
        return getattr(self._transport, "is_simulated", False)

    def _on_report(self, data: bytes) -> None:
        self._reports.put(data)

    def _status(self, state: str, message: str = "") -> None:
        self._emit(
            {
                "type": "status",
                "state": state,
                "message": message,
                "simulated": self.simulated,
            }
        )

    def connect(self) -> bool:
        with self._lock:
            if self._connected:
                return True
            try:
                self._transport.on_report = self._on_report  # type: ignore[attr-defined]
                self._transport.open()
            except Exception as exc:
                log.warning("connect failed: %s", exc)
                self._status("disconnected", str(exc))
                return False
            self._connected = True
            self._status(
                "connected",
                "Simulateur" if self.simulated else "Sonomètre détecté",
            )
            return True

    def disconnect(self, message: str = "") -> None:
        self.stop_live()
        with self._lock:
            if self._connected:
                try:
                    self._transport.close()
                except Exception:  # pragma: no cover
                    pass
            self._connected = False
        self._status("disconnected", message)

    def _request(self, frame: bytes, timeout: float = 0.6) -> bytes | None:
        """Send a frame and wait for a single report."""
        self._drain()
        try:
            self._transport.write(frame)
        except Exception as exc:
            log.warning("write failed: %s", exc)
            self._connected = False
            self._status("disconnected", str(exc))
            return None
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            try:
                return self._reports.get(timeout=remaining)
            except queue.Empty:
                return None

    def _drain(self) -> None:
        while True:
            try:
                self._reports.get_nowait()
            except queue.Empty:
                return

    # -- live measurement -------------------------------------------------
    def read_once(self) -> P.Measurement | None:
        """Single synchronous measurement (used by the settings dialog)."""
        with self._lock:
            if not self._connected and not self.connect():
                return None
            raw = self._request(P.read_point())
        if raw is None:
            return None
        try:
            return P.parse_read_point(raw)
        except ValueError:
            return None

    def start_live(self) -> None:
        with self._lock:
            if self._live_thread and self._live_thread.is_alive():
                return
            if not self._connected and not self.connect():
                return
            self._live_stop.clear()
            self._live_thread = threading.Thread(
                target=self._live_loop, name="live-poll", daemon=True
            )
            self._live_thread.start()
            self._emit({"type": "live", "state": "started"})

    def stop_live(self) -> None:
        """Ask the polling loop to stop.

        Safe from any thread, including the live thread itself: joining the
        current thread raises ``RuntimeError``, so in that case the loop's own
        finaliser is left to do the bookkeeping.
        """
        self._live_stop.set()
        thread = self._live_thread
        if thread is None or thread is threading.current_thread():
            return
        if thread.is_alive():
            thread.join(timeout=3.0)
        with self._lock:
            orphan = self._live_thread is thread
            if orphan:
                self._live_thread = None
        if orphan:  # pragma: no cover - the finaliser normally handles it
            self._emit({"type": "live", "state": "stopped"})

    def _finish_live(self) -> None:
        """Run by the polling loop on exit: exactly one ``stopped`` event."""
        current = threading.current_thread()
        with self._lock:
            if self._live_thread is not current:
                return  # another run owns the slot, or it was already cleaned
            self._live_thread = None
        self._emit({"type": "live", "state": "stopped"})

    @property
    def live_running(self) -> bool:
        return bool(self._live_thread and self._live_thread.is_alive())

    def _recover(self, attempts: int = 3) -> bool:
        """Reopen the device after it stopped answering, keeping the session."""
        self._status("reconnecting", "Sonomètre muet, tentative de reconnexion…")
        for attempt in range(1, attempts + 1):
            if self._live_stop.is_set():
                return False
            with self._lock:
                try:
                    self._transport.close()
                except Exception:  # pragma: no cover
                    pass
                self._connected = False
                try:
                    self._transport.open()
                except Exception as exc:
                    log.info("reconnexion %d/%d: %s", attempt, attempts, exc)
                else:
                    self._connected = True
                    self._drain()
                    self._status("connected", "Sonomètre reconnecté")
                    return True
            self._live_stop.wait(1.0)
        return False

    def _live_loop(self) -> None:
        interval = max(0.2, float(self._settings.interval))
        missed = 0
        no = 0
        try:
            while not self._live_stop.is_set():
                started = time.monotonic()
                if not self._connected and not self._recover(attempts=1):
                    break
                with self._lock:
                    if not self._connected:
                        break
                    raw = self._request(P.read_point(), timeout=0.5)
                if raw is None:
                    missed += 1
                    if missed >= 5:
                        # The device went quiet: try to get it back rather
                        # than silently freezing the display.
                        if not self._recover():
                            self._status(
                                "disconnected", "Sonomètre injoignable, mesure arrêtée"
                            )
                            break
                        missed = 0
                else:
                    missed = 0
                    try:
                        member = P.parse_read_point(raw)
                    except ValueError:
                        member = None
                    if member is not None:
                        no += 1
                        member.no = no
                        member.source = "live"
                        self._emit_measurement(member)
                elapsed = time.monotonic() - started
                self._live_stop.wait(max(0.0, interval - elapsed))
        finally:
            # Always, even on an unexpected error: the UI must never stay
            # stuck on "mesure en cours" with a frozen display.
            self._finish_live()

    def _emit_measurement(self, member: P.Measurement) -> None:
        member.low_effect = member.value < self._settings.low_alarm
        member.high_effect = member.value > self._settings.high_alarm
        self._emit({"type": "measurement", "data": member.to_dict()})

    # -- device settings --------------------------------------------------
    def read_settings(self) -> P.Measurement | None:
        member = self.read_once()
        if member is not None:
            self._settings.device_mode = member.mode
            self._settings.device_weighting = member.weighting
            self._settings.device_max_hold = member.max_hold
            self._settings.device_range = member.range
            self._settings.save()
            self._emit({"type": "device_settings", "data": member.to_dict()})
        return member

    def write_settings(
        self,
        mode: str,
        max_hold: bool,
        weighting: str,
        range_index: int,
    ) -> bool:
        with self._lock:
            if not self._connected and not self.connect():
                return False
            raw = self._request(
                P.write_settings(mode, max_hold, weighting, range_index)
            )
        ok = raw is None or P.is_settings_ack(raw)
        self._settings.device_mode = mode
        self._settings.device_weighting = weighting
        self._settings.device_max_hold = max_hold
        self._settings.device_range = range_index
        self._settings.save()
        self._emit({"type": "device_settings_written", "ok": ok})
        return ok

    # -- history download -------------------------------------------------
    def download_history(self, max_records: int = 31000) -> list[dict]:
        """Handshake then dump the on-board log (device capacity: 31 000 records)."""
        with self._lock:
            if not self._connected and not self.connect():
                self._emit({"type": "history_error", "message": "non connecté"})
                return []
            self._emit({"type": "history_start"})
            # Handshake
            raw = self._request(P.handshake_history(), timeout=1.0)
            if raw is None or not P.is_history_handshake_ack(raw):
                # Some firmware dumps straight away; tolerate a missing ack.
                log.info("history handshake not acknowledged, continuing")
            stream = bytearray()
            empties = 0
            while len(stream) < max_records * 3 + 16:
                raw = self._request(P.read_history(), timeout=0.6)
                if raw is None or len(raw) < P.HID_REPORT_LEN:
                    empties += 1
                    if empties >= 3:
                        break
                    continue
                empties = 0
                payload = raw[1:9]
                stream.extend(payload)
                if payload[0] == P.NO_DATA:
                    break
                self._emit(
                    {
                        "type": "history_progress",
                        "bytes": len(stream),
                    }
                )
            records = [m.to_dict() for m in P.iter_history(bytes(stream))]
            if records:
                for i, r in enumerate(records, 1):
                    r["no"] = i
            self._emit(
                {
                    "type": "history_done",
                    "count": len(records),
                    "records": records,
                }
            )
            return records
