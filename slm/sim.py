"""Simulated transport: lets the whole app run without the real device.

Implements the same duck-typed interface as :class:`slm.usb.HidTransport`
(``open`` / ``close`` / ``write`` / ``on_report``) and fabricates protocol
answers: live measurements, settings acknowledgements and a plausible history
log.
"""

from __future__ import annotations

import math
import random
import threading
import time
from datetime import datetime, timedelta

from . import protocol as P


def _bcd(value: int) -> int:
    return ((value // 10) << 4) | (value % 10)


def _int16_be(value: float) -> bytes:
    raw = int(round(value * 10)) & 0xFFFF
    return raw.to_bytes(2, "big")


def _encode_group(v1: float, v2: float) -> bytes:
    a = int(round(v1 * 20)) & 0xFFF
    b = int(round(v2 * 20)) & 0xFFF
    return bytes([a >> 4, ((a & 0x0F) << 4) | (b >> 8), b & 0xFF])


class SimTransport:
    """In-memory stand-in for the HID transport."""

    is_simulated = True

    def __init__(self, seed: int | None = None) -> None:
        self.on_report = None
        self._open = False
        self._rng = random.Random(seed)
        self._threads: list[threading.Thread] = []
        # device state, updated through WRITE_SETTINGS
        self.mode = "SLOW"
        self.max_hold = False
        self.weighting = "A"
        self.range = 0
        self._history_chunks: list[bytes] | None = None
        self._t0 = time.monotonic()

    # -- transport interface ---------------------------------------------
    def open(self) -> None:
        self._open = True
        self._t0 = time.monotonic()

    def close(self) -> None:
        self._open = False

    def write(self, frame: bytes) -> None:
        if not self._open or len(frame) < 2:
            return
        cmd = frame[1]
        if cmd == P.CMD_READ_POINT:
            self._reply(self._live_report(), delay=0.02)
        elif cmd == P.CMD_HANDSHAKE_HISTORY:
            self._history_chunks = self._build_history()
            self._reply(bytes([0x00, P.ACK_HISTORY_HANDSHAKE] + [0] * 7), delay=0.02)
        elif cmd == P.CMD_READ_HISTORY:
            self._reply(self._next_history_chunk(), delay=0.01)
        elif cmd == P.CMD_WRITE_SETTINGS:
            flag = frame[2] if len(frame) > 2 else 0
            self._apply_settings(flag)
            self._reply(bytes([0x00, P.ACK_SETTINGS] + [0] * 7), delay=0.02)

    def _reply(self, data: bytes, delay: float = 0.0) -> None:
        def _send() -> None:
            if delay:
                time.sleep(delay)
            if self._open and self.on_report:
                self.on_report(bytes(data))

        thread = threading.Thread(target=_send, daemon=True)
        thread.start()
        self._threads.append(thread)

    # -- fabricated data --------------------------------------------------
    def _apply_settings(self, flag: int) -> None:
        self.mode = "FAST" if flag & P.FLAG_FAST else "SLOW"
        self.max_hold = bool(flag & P.FLAG_MAX)
        self.weighting = "C" if flag & P.FLAG_WEIGHTING_C else "A"
        self.range = flag & 0x0F

    def _live_report(self) -> bytes:
        # Smooth pseudo-random drift around 45 dB.
        t = time.monotonic() - self._t0
        base = 45 + 8 * math.sin(t / 7.0) + self._rng.uniform(-2.5, 2.5)
        value = max(0.0, min(130.0, base))
        flags = self.range & 0x0F
        if self.mode == "FAST":
            flags |= P.FLAG_FAST
        if self.max_hold:
            flags |= P.FLAG_MAX
        if self.weighting == "C":
            flags |= P.FLAG_WEIGHTING_C
        if int(t) % 37 == 0:
            flags |= P.FLAG_BATTERY_LOW
        return bytes([0x00]) + _int16_be(value) + bytes([flags]) + bytes(5)

    def _build_history(self, records: int = 98, interval: int = 1) -> list[bytes]:
        start = datetime.now() - timedelta(seconds=records * interval)
        header = bytes(
            [
                P.ACK_HISTORY_RECORD,
                self.range & 0x0F,
                _bcd(start.second),
                _bcd(start.minute),
                _bcd(start.hour),
                _bcd(start.day),
                _bcd(start.month),
                _bcd(start.year - 2000),
            ]
        )
        stream = bytearray(header)
        stream.append(interval)
        # A wandering base level, 2 samples per 3-byte group.
        base = self._rng.uniform(42, 62)
        for _ in range(records // 2):
            base += self._rng.uniform(-6, 6)
            base = max(35.0, min(78.0, base))
            v1 = max(0.0, min(204.0, base + self._rng.uniform(-1, 1)))
            v2 = max(0.0, min(204.0, base + self._rng.uniform(-1, 1)))
            stream.extend(_encode_group(v1, v2))
        stream.append(P.NO_DATA)
        return self._chunk8(bytes(stream))

    @staticmethod
    def _chunk8(data: bytes) -> list[bytes]:
        chunks = []
        for i in range(0, len(data), 8):
            chunk = data[i : i + 8]
            if len(chunk) < 8:
                chunk = chunk + bytes(8 - len(chunk))
            chunks.append(bytes([0x00]) + chunk)
        return chunks

    def _next_history_chunk(self) -> bytes:
        if not self._history_chunks:
            return bytes([0x00, P.NO_DATA] + [0] * 7)
        return self._history_chunks.pop(0)
