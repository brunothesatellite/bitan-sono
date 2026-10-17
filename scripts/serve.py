"""Headless server for development / UI checks.

    python scripts/serve.py --port 8765 --device sim
"""

from __future__ import annotations

import argparse
import sys
import time
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--device", choices=["auto", "real", "sim"], default="sim")
    args = parser.parse_args()

    state = make_state(force=None if args.device == "auto" else args.device)
    app = create_app(state)
    launcher.start_server(app, args.host, args.port)
    print(f"http://{args.host}:{args.port}/  (simulated={state.controller.simulated})",
          flush=True)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
