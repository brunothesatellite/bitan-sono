"""Wire protocol for the Bitan / SKU001 sound level meter.

Reverse engineered from ``SoundLevelProtocol.dll`` shipped with the original
SoundLab application.  The device speaks HID (VID 0x64BD / PID 0x74E3) using
9 byte reports::

    raw[0]      report id (always 0x00)
    raw[1]      value high byte / command
    raw[2]      value low byte
    raw[3]      status flags  (live mode)

Commands (byte 1 of an output report)
------------------------------------
0xB3  read a live measurement
0xB5  handshake before reading the history log (device answers 0xEF)
0xC4  read one history record (device answers 0xC4)
0x56  write the device settings

The original library built 65 byte frames padded with ``0x23`` ('#') but the
``UsbLibrary`` transport only ever copied bytes 1..8 into a 9 byte report, so
only the command byte and (for settings) the flag byte actually reach the
device.  ``legacy()`` reproduces those historic frames byte for byte while the
default builders produce the minimal, canonical 9 byte report.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from typing import Iterator

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------

CMD_READ_POINT = 0xB3  # 179
CMD_WRITE_SETTINGS = 0x56  # 86
CMD_HANDSHAKE_HISTORY = 0xB5  # 181
CMD_READ_HISTORY = 0xC4  # 196

ACK_READ_POINT = 0xB3
ACK_SETTINGS = 0xC4  # Analyse.IsCorrect()
ACK_HISTORY_HANDSHAKE = 0xEF  # Analyse.AnswerBackHistory()
ACK_HISTORY_RECORD = 0xFD  # record / header marker
NO_DATA = 0xFF  # end-of-history marker

REPORT_ID = 0x00
HID_REPORT_LEN = 9  # 1 report id + 8 payload
LEGACY_FRAME_LEN = 65
LEGACY_PAD = 0x23  # '#'

# Status flag bits (live measurement, byte 3)
FLAG_BATTERY_LOW = 0x80
FLAG_FAST = 0x40
FLAG_MAX = 0x20
FLAG_WEIGHTING_C = 0x10

# Measurement ranges (range index -> displayed window in dB)
RANGES: dict[int, tuple[int, int]] = {
    0: (30, 130),
    1: (30, 80),
    2: (50, 100),
    3: (60, 110),
    4: (80, 130),
}
RANGE_LABELS = [
    "30 ~ 130 dB",
    "30 ~ 80 dB",
    "50 ~ 100 dB",
    "60 ~ 110 dB",
    "80 ~ 130 dB",
]


# --------------------------------------------------------------------------
# Data model
# --------------------------------------------------------------------------


@dataclass
class Measurement:
    """A single decoded measurement (mirrors ``Analyse._Member``)."""

    no: int = 0
    value: float = 0.0  # dB
    battery_low: bool = False
    mode: str = "SLOW"  # FAST / SLOW
    max_hold: bool = False
    weighting: str = "A"  # A / C
    range: int = 0  # 0..4
    time: str = ""
    date: str = ""
    low_effect: bool = False  # below the low alarm
    high_effect: bool = False  # above the high alarm
    source: str = "live"  # live / history

    def to_dict(self) -> dict:
        d = asdict(self)
        d["value"] = round(self.value, 1)
        d["range_label"] = RANGE_LABELS[self.range] if 0 <= self.range <= 4 else ""
        return d

    @property
    def range_label(self) -> str:
        return RANGE_LABELS[self.range] if 0 <= self.range <= 4 else ""


# --------------------------------------------------------------------------
# Frame builders
# --------------------------------------------------------------------------


def _report(cmd: int, flag: int | None = None) -> bytes:
    """Build a canonical 9 byte HID output report."""
    payload = bytearray(HID_REPORT_LEN)
    payload[0] = REPORT_ID
    payload[1] = cmd
    if flag is not None:
        payload[2] = flag & 0xFF
    return bytes(payload)


def _legacy_report(cmd: int, flag: int | None = None) -> bytes:
    """Reproduce the historic 65 byte, 0x23 padded frame."""
    out = bytearray([LEGACY_PAD] * LEGACY_FRAME_LEN)
    out[0] = REPORT_ID
    out[1] = cmd
    if flag is not None:
        out[2] = flag & 0xFF
    return bytes(out)


def read_point(legacy_frame: bool = False) -> bytes:
    """Command the device to send a live measurement."""
    if legacy_frame:
        return _legacy_report(CMD_READ_POINT)
    return _report(CMD_READ_POINT)


def handshake_history(legacy_frame: bool = False) -> bytes:
    """Handshake before downloading the memory log."""
    if legacy_frame:
        return _legacy_report(CMD_HANDSHAKE_HISTORY)
    return _report(CMD_HANDSHAKE_HISTORY)


def read_history(legacy_frame: bool = False) -> bytes:
    """Request the next history record."""
    if legacy_frame:
        return _legacy_report(CMD_READ_HISTORY)
    return _report(CMD_READ_HISTORY)


def write_settings(
    mode: str = "SLOW",
    max_hold: bool = False,
    weighting: str = "A",
    range_index: int = 0,
    legacy_frame: bool = False,
) -> bytes:
    """Build the settings frame (0x56) from the desired device state."""
    flag = 0
    if mode.upper() == "FAST":
        flag |= FLAG_FAST
    if max_hold:
        flag |= FLAG_MAX
    if weighting.upper() == "C":
        flag |= FLAG_WEIGHTING_C
    flag |= (range_index & 0x0F)
    if legacy_frame:
        return _legacy_report(CMD_WRITE_SETTINGS, flag)
    return _report(CMD_WRITE_SETTINGS, flag)


# --------------------------------------------------------------------------
# Parsers
# --------------------------------------------------------------------------


def _normalize(raw: bytes) -> bytes:
    """Return the report with a leading report-id byte.

    ``hidapi`` returns the report id as the first byte on Windows; be lenient
    if a transport hands us only the 8 payload bytes.
    """
    if len(raw) >= HID_REPORT_LEN:
        return raw[:HID_REPORT_LEN]
    if len(raw) == HID_REPORT_LEN - 1:
        return bytes([REPORT_ID]) + raw
    raise ValueError(f"short HID report: {len(raw)} bytes")


def parse_read_point(raw: bytes) -> Measurement:
    """Decode the answer to :func:`read_point` (see ``Analyse.AnalysisReadPoint``)."""
    buf = _normalize(raw)
    value = int.from_bytes(buf[1:3], "big", signed=True) / 10.0
    flags = buf[3]
    return Measurement(
        value=value,
        battery_low=bool(flags & FLAG_BATTERY_LOW),
        mode="FAST" if flags & FLAG_FAST else "SLOW",
        max_hold=bool(flags & FLAG_MAX),
        weighting="C" if flags & FLAG_WEIGHTING_C else "A",
        range=flags & 0x0F,
    )


def is_settings_ack(raw: bytes) -> bool:
    """``Analyse.IsCorrect`` - device accepted the settings."""
    return len(raw) > 1 and raw[1] == ACK_SETTINGS


def is_history_handshake_ack(raw: bytes) -> bool:
    """``Analyse.AnswerBackHistory`` - device is ready to dump its log."""
    return len(raw) > 1 and raw[1] == ACK_HISTORY_HANDSHAKE


def _bcd(byte: int) -> int:
    """Decode a packed BCD byte (0x42 -> 42)."""
    return (byte >> 4) * 10 + (byte & 0x0F)


def parse_history_header(buf: bytes) -> tuple[Measurement, int]:
    """Decode an 8 byte history header.

    Layout (``Analyse.AnalysisReadHistoryHeader``)::

        [0] 0xFD marker
        [1] status flags (battery / fast / max / weighting / range)
        [2] seconds   (BCD)
        [3] minutes   (BCD)
        [4] hours     (BCD)
        [5] day       (BCD)
        [6] month     (BCD)
        [7] year      (BCD, +2000)

    Returns the header as a :class:`Measurement` plus the sampling interval
    in seconds that follows it in the stream.
    """
    if len(buf) < 8 or buf[0] != ACK_HISTORY_RECORD:
        raise ValueError("not a history header")
    flags = buf[1]
    try:
        stamp = datetime(
            2000 + _bcd(buf[7]),
            _bcd(buf[6]),
            _bcd(buf[5]),
            _bcd(buf[4]),
            _bcd(buf[3]),
            _bcd(buf[2]),
        )
    except ValueError:
        stamp = datetime(2000, 1, 1)
    member = Measurement(
        battery_low=bool(flags & FLAG_BATTERY_LOW),
        mode="FAST" if flags & FLAG_FAST else "SLOW",
        max_hold=bool(flags & FLAG_MAX),
        weighting="C" if flags & FLAG_WEIGHTING_C else "A",
        range=flags & 0x0F,
        date=stamp.strftime("%Y-%m-%d"),
        time=stamp.strftime("%H:%M:%S"),
        source="history",
    )
    return member, stamp


def decode_history_group(group: bytes) -> tuple[float, float]:
    """Decode a 3 byte group carrying two 12 bit measurements (``/20``)."""
    if len(group) < 3:
        raise ValueError("short history group")
    v1 = ((group[0] << 4) | (group[1] >> 4)) / 20.0
    v2 = (((group[1] & 0x0F) << 8) | group[2]) / 20.0
    return v1, v2


def iter_history(stream: bytes, interval_hint: int = 1) -> Iterator[Measurement]:
    """Iterate over measurements from a raw history byte stream.

    Mirrors the parsing loop of ``MainWindow.Restore_Completed``.  The stream is
    a sequence of ``header(8) + interval(1) + groups(3*n)`` blocks, where an
    ``0xFF`` marker ends the log and an ``0xFD`` byte starts a new block.
    """
    pos = 0
    n = len(stream)
    if n < 9:
        return
    header, stamp = parse_history_header(stream[0:8])
    pos = 8
    interval = stream[pos] or interval_hint
    pos += 1
    no = 0
    while pos < n:
        if stream[pos] == NO_DATA:
            return
        if stream[pos] == ACK_HISTORY_RECORD:
            if pos + 9 > n:
                return
            header, stamp = parse_history_header(stream[pos : pos + 8])
            pos += 8
            interval = stream[pos] or interval_hint
            pos += 1
            continue
        if pos + 3 > n:
            return
        group = stream[pos : pos + 3]
        pos += 3
        for value in decode_history_group(group):
            no += 1
            yield Measurement(
                no=no,
                value=value,
                mode=header.mode,
                weighting=header.weighting,
                range=header.range,
                date=stamp.strftime("%Y-%m-%d"),
                time=stamp.strftime("%H:%M:%S"),
                source="history",
            )
            stamp = stamp + timedelta(seconds=interval)


def encode_history_frame_header(buf: bytes) -> str:
    """Human readable dump of a header, for logs."""
    member, stamp = parse_history_header(buf)
    return f"{stamp:%Y-%m-%d %H:%M:%S} {member.mode} {member.weighting} R{member.range}"
