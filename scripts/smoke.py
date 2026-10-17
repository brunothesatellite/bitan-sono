"""End-to-end smoke test: boot the server with the simulator and drive the WS.

    python scripts/smoke.py
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except Exception:
        pass

import run as launcher  # noqa: E402
from slm.server import create_app, make_state  # noqa: E402

import websockets  # noqa: E402

# Never let the smoke test write into the user's real settings file.
from slm import config as _config  # noqa: E402

_config.CONFIG_FILE = Path(tempfile.mkdtemp(prefix="bitan-smoke-")) / "settings.json"


async def drive(url: str) -> None:
    async with websockets.connect(url) as ws:
        snapshot = json.loads(await ws.recv())
        assert snapshot["type"] == "snapshot", snapshot
        print(f"  snapshot: connected={snapshot['connected']} "
              f"simulated={snapshot['simulated']} version={snapshot['version']}")

        await ws.send(json.dumps({"cmd": "live.start"}))
        values = []
        for _ in range(400):
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            if msg["type"] == "measurement":
                values.append(msg["data"]["value"])
                if len(values) >= 4:
                    break
        assert values, "no live measurements received"
        print(f"  live: {len(values)} mesures -> {values}")
        await ws.send(json.dumps({"cmd": "live.stop"}))

        await ws.send(json.dumps({"cmd": "history.download"}))
        count = 0
        for _ in range(600):
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
            if msg["type"] == "history_done":
                count = msg["count"]
                break
        assert count > 0, "history download returned nothing"
        print(f"  history: {count} enregistrements")

        await ws.send(json.dumps({"cmd": "device.write", "mode": "FAST",
                                  "weighting": "C", "max_hold": True, "range": 2}))
        for _ in range(50):
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            if msg["type"] == "device_settings_written":
                assert msg["ok"], msg
                break
        print("  device.write: ok")

        await ws.send(json.dumps({"cmd": "app.settings.set",
                                  "settings": {"low_alarm": 35, "high_alarm": 70}}))
        for _ in range(50):
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            if msg["type"] == "app_settings":
                assert msg["settings"]["low_alarm"] == 35
                break
        print("  app.settings.set: ok")

        # Leave the meter the way we found it (settings live in the device).
        await ws.send(json.dumps({"cmd": "device.write", "mode": "SLOW",
                                  "weighting": "A", "max_hold": False, "range": 0}))
        for _ in range(50):
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            if msg["type"] == "device_settings_written":
                assert msg["ok"], msg
                break
        print("  device restored (SLOW/A/range 0/no max)")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", choices=["auto", "real", "sim"], default="sim")
    args = parser.parse_args()

    state = make_state(force=None if args.device == "auto" else args.device)
    app = create_app(state)
    port = launcher.free_port()
    launcher.start_server(app, "127.0.0.1", port)
    url = f"ws://127.0.0.1:{port}/ws"
    print(f"smoke test against {url} (device={args.device}, "
          f"simulated={state.controller.simulated})")
    asyncio.run(drive(url))
    print("OK - all flows passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
