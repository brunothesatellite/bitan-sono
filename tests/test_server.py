"""Regression tests for websocket payloads.

Starlette's ``send_json`` relies on stdlib ``json``, which can not encode
dataclasses. ``snapshot()`` used to hand over raw ``Measurement`` objects, so
any client connecting while the live store was non-empty got its connection
closed with a ``TypeError`` server-side (and an empty-looking UI at best).
These tests drive the exact code paths with plain ``json.dumps``.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from slm.protocol import Measurement  # noqa: E402
from slm.server import _handle_command, make_state  # noqa: E402


class StubWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def send_json(self, payload: dict) -> None:
        self.sent.append(payload)


def make_live_state(count: int = 5):
    state = make_state(force="sim")
    for i in range(count):
        state.live.add(
            Measurement(no=i + 1, value=50.0 + i, time="12:00:00", date="2026-10-17")
        )
    return state


def dumps_all(payloads) -> None:
    for payload in payloads:
        json.dumps(payload)  # must not raise, like Starlette's send_json


def test_snapshot_with_live_data_is_json_serializable():
    state = make_live_state()
    snapshot = state.snapshot()
    dumps_all([snapshot])
    assert len(snapshot["live_tail"]) == 5
    first = snapshot["live_tail"][0]
    assert isinstance(first, dict)
    assert (first["no"], first["value"]) == (1, 50.0)


def test_snapshot_empty_store_stays_serializable():
    dumps_all([make_state(force="sim").snapshot()])


def test_store_tail_command_is_json_serializable():
    state = make_live_state()
    ws = StubWebSocket()
    asyncio.run(_handle_command(ws, state, {"cmd": "store.tail", "which": "live", "count": 3}))
    kinds = [m["type"] for m in ws.sent]
    assert kinds == ["tail"], kinds
    assert len(ws.sent[0]["records"]) == 3
    dumps_all(ws.sent)


def test_store_tail_import_is_json_serializable():
    state = make_live_state()
    ws = StubWebSocket()
    asyncio.run(
        _handle_command(ws, state, {"cmd": "store.tail", "which": "imported", "count": 10})
    )
    assert ws.sent[0]["records"] == []
    dumps_all(ws.sent)
