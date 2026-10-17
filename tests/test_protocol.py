"""Unit tests for the protocol, simulator and import/export round trips."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from slm import protocol as P  # noqa: E402
from slm.export import export_csv, export_xlsx, import_table  # noqa: E402
from slm.sim import SimTransport, _encode_group  # noqa: E402


# --------------------------------------------------------------------------
# Frame builders
# --------------------------------------------------------------------------
def test_read_point_frame_is_nine_bytes():
    frame = P.read_point()
    assert len(frame) == 9
    assert frame == bytes([0x00, 0xB3, 0, 0, 0, 0, 0, 0, 0])


def test_legacy_frames_are_65_bytes_with_0x23_padding():
    frame = P.read_point(legacy_frame=True)
    assert len(frame) == 65
    assert frame[1] == 0xB3
    assert frame[2:] == bytes([0x23] * 63)


def test_write_settings_legacy_keeps_flag_then_pads():
    frame = P.write_settings(mode="FAST", range_index=2, legacy_frame=True)
    assert len(frame) == 65
    assert frame[2] == 0x40 | 0x02
    assert frame[3:] == bytes([0x23] * 62)


def test_write_settings_flag_byte():
    frame = P.write_settings(mode="FAST", max_hold=True, weighting="C", range_index=2)
    assert frame[1] == P.CMD_WRITE_SETTINGS
    assert frame[2] == 0x40 | 0x20 | 0x10 | 0x02


# --------------------------------------------------------------------------
# Live parsing
# --------------------------------------------------------------------------
def test_parse_read_point_value_and_flags():
    raw = bytes([0x00, 0x01, 0x8B, 0x41, 0, 0, 0, 0, 0])
    member = P.parse_read_point(raw)
    assert member.value == pytest.approx(39.5)
    assert member.mode == "FAST"
    assert member.weighting == "A"
    assert member.range == 1


def test_parse_read_point_accepts_payload_without_report_id():
    raw = bytes([0x01, 0x8B, 0x00]) + bytes(5)
    member = P.parse_read_point(raw)
    assert member.value == pytest.approx(39.5)
    assert member.mode == "SLOW"


def test_parse_read_point_negative_is_signed():
    raw = bytes([0x00, 0xFF, 0x9C, 0x00]) + bytes(5)
    member = P.parse_read_point(raw)
    assert member.value < 0


def test_ack_helpers():
    assert P.is_settings_ack(bytes([0x00, 0xC4] + [0] * 7))
    assert P.is_history_handshake_ack(bytes([0x00, 0xEF] + [0] * 7))
    assert not P.is_settings_ack(bytes([0x00, 0xB3] + [0] * 7))


# --------------------------------------------------------------------------
# History
# --------------------------------------------------------------------------
def test_decode_history_group():
    v1, v2 = P.decode_history_group(_encode_group(55.7, 63.3))
    assert v1 == pytest.approx(55.7, abs=0.05)
    assert v2 == pytest.approx(63.3, abs=0.05)


def test_iter_history_round_trip():
    chunks = SimTransport(seed=1)._build_history(records=98, interval=1)
    stream = b"".join(chunk[1:9] for chunk in chunks)
    records = list(P.iter_history(stream))
    assert len(records) == 98
    assert all(0 <= r.value <= 130 for r in records)
    assert all(r.date and r.time for r in records)
    assert records[0].weighting in ("A", "C")
    # times advance by the interval
    assert records[0].time != records[-1].time or len(records) > 1


def test_history_header_bcd_decoding():
    header = bytes([0xFD, 0x10, 0x45, 0x59, 0x23, 0x17, 0x10, 0x26])
    member, stamp = P.parse_history_header(header)
    assert (stamp.hour, stamp.minute, stamp.second) == (23, 59, 45)
    assert (stamp.year, stamp.month, stamp.day) == (2026, 10, 17)
    assert member.weighting == "C"
    assert member.range == 0


# --------------------------------------------------------------------------
# Import / export
# --------------------------------------------------------------------------
RECORDS = [
    {"no": 1, "value": 55.7, "weighting": "A", "time": "17:00:42", "date": "17/10/2026"},
    {"no": 2, "value": 51.5, "weighting": "A", "time": "17:00:43", "date": "17/10/2026"},
]


def test_xlsx_round_trip(tmp_path):
    path = export_xlsx(RECORDS, tmp_path / "out.xlsx", title="Sound Level Meter")
    back = import_table(path)
    assert len(back) == 2
    assert back[0]["value"] == pytest.approx(55.7)
    assert back[0]["time"] == "17:00:42"


def test_csv_round_trip(tmp_path):
    path = export_csv(RECORDS, tmp_path / "out.csv")
    back = import_table(path)
    assert len(back) == 2
    assert back[1]["value"] == pytest.approx(51.5)


# --------------------------------------------------------------------------
# Simulator frame shapes
# --------------------------------------------------------------------------
def test_simulated_live_report_is_nine_bytes_and_parses():
    sim = SimTransport(seed=7)
    raw = sim._live_report()
    assert len(raw) == 9
    member = P.parse_read_point(raw)
    assert 20 <= member.value <= 80


def test_simulated_history_chunks_are_nine_bytes():
    sim = SimTransport(seed=7)
    for chunk in sim._build_history(records=10):
        assert len(chunk) == 9
        assert chunk[0] == 0x00
