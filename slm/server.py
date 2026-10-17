"""FastAPI application: REST + WebSocket bridge between the UI and the device."""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import __version__, export
from .config import AppSettings
from .device import DeviceController
from .store import MeasurementStore

log = logging.getLogger(__name__)


def _web_dir() -> Path:
    """Locate the web assets both from source and from a PyInstaller bundle."""
    base = getattr(sys, "_MEIPASS", None)
    if base:
        return Path(base) / "web"
    return Path(__file__).resolve().parent.parent / "web"


WEB_DIR = _web_dir()


class ExportRequest(BaseModel):
    which: str = "live"  # live | import
    format: str = "xlsx"  # xlsx | csv
    path: str


class ImportRequest(BaseModel):
    path: str


class State:
    """Shared application state."""

    def __init__(self, controller: DeviceController, settings: AppSettings) -> None:
        self.controller = controller
        self.settings = settings
        self.live = MeasurementStore()
        self.imported = MeasurementStore()
        self.loop: asyncio.AbstractEventLoop | None = None
        self.clients: set[WebSocket] = set()

    # -- events -----------------------------------------------------------
    def emit(self, event: dict) -> None:
        """Called from worker threads; fan out to every websocket client."""
        if event.get("type") == "measurement":
            from .protocol import Measurement

            self.live.add(Measurement(**{k: v for k, v in event["data"].items()
                                         if k in Measurement.__dataclass_fields__}))
            event = dict(event)
            event["stats"] = self.live.stats().to_dict()
            event["count"] = len(self.live)
        if self.loop is None:
            return
        asyncio.run_coroutine_threadsafe(self._broadcast(event), self.loop)

    async def _broadcast(self, event: dict) -> None:
        dead = []
        for client in list(self.clients):
            try:
                await client.send_json(event)
            except Exception:
                dead.append(client)
        for client in dead:
            self.clients.discard(client)

    # -- snapshots --------------------------------------------------------
    def snapshot(self) -> dict:
        return {
            "type": "snapshot",
            "version": __version__,
            "settings": self.settings.to_dict(),
            "connected": self.controller.connected,
            "simulated": self.controller.simulated,
            "live_running": self.controller.live_running,
            "live_count": len(self.live),
            "import_count": len(self.imported),
            "live_stats": self.live.stats().to_dict(),
            # Plain dicts: Starlette's send_json uses stdlib json, which can
            # not encode dataclasses (a non-empty tail used to kill the
            # websocket with a TypeError on every new client).
            "live_tail": [m.to_dict() for m in self.live.tail(400)],
            "import_records": self.imported.to_records(),
        }


def create_app(state: State) -> FastAPI:
    app = FastAPI(title="bitan-sono", version=__version__)

    @app.on_event("startup")
    async def _startup() -> None:
        state.loop = asyncio.get_running_loop()

    # -- REST -------------------------------------------------------------
    @app.get("/api/status")
    def status() -> dict:
        return {
            "version": __version__,
            "connected": state.controller.connected,
            "simulated": state.controller.simulated,
            "live_running": state.controller.live_running,
            "live_count": len(state.live),
            "import_count": len(state.imported),
        }

    @app.get("/api/scan")
    def scan() -> dict:
        from . import usb

        return {
            "available": usb.HID_AVAILABLE,
            "devices": [vars(d) | {"path": d.path.decode(errors="replace")}
                        for d in usb.enumerate_all()],
        }

    @app.post("/api/export")
    def do_export(req: ExportRequest) -> dict:
        store = state.live if req.which == "live" else state.imported
        records = store.to_records()
        if not records:
            raise HTTPException(400, "aucune donnée à exporter")
        path = Path(req.path)
        if req.format == "csv":
            export.export_csv(records, path)
        else:
            if path.suffix.lower() != ".xlsx":
                path = path.with_suffix(".xlsx")
            export.export_xlsx(records, path)
        return {"path": str(path), "count": len(records)}

    @app.post("/api/import")
    def do_import(req: ImportRequest) -> dict:
        try:
            records = export.import_table(req.path)
        except Exception as exc:
            raise HTTPException(400, str(exc)) from exc
        from .protocol import Measurement

        members = []
        for record in records:
            members.append(
                Measurement(
                    no=int(record.get("no", len(members) + 1)),
                    value=float(record.get("value", 0.0)),
                    weighting=str(record.get("weighting", "A")) or "A",
                    time=str(record.get("time", "")),
                    date=str(record.get("date", "")),
                    source="imported",
                )
            )
        state.imported.replace(members)
        return {"count": len(members), "records": state.imported.to_records()}

    # -- WebSocket --------------------------------------------------------
    @app.websocket("/ws")
    async def websocket_endpoint(ws: WebSocket) -> None:
        await ws.accept()
        state.clients.add(ws)
        try:
            await ws.send_json(state.snapshot())
            while True:
                message = await ws.receive_json()
                await _handle_command(ws, state, message)
        except WebSocketDisconnect:
            pass
        except Exception as exc:  # pragma: no cover
            log.debug("websocket error: %s", exc)
        finally:
            state.clients.discard(ws)

    # -- static -----------------------------------------------------------
    if WEB_DIR.exists():
        app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")

    return app


async def _handle_command(ws: WebSocket, state: State, message: dict) -> None:
    cmd = message.get("cmd")
    controller = state.controller

    if cmd == "live.start":
        # Blocking (may open the HID handle): keep the event loop free.
        await asyncio.to_thread(controller.start_live)
    elif cmd == "live.stop":
        await asyncio.to_thread(controller.stop_live)
    elif cmd == "store.clear":
        which = message.get("which", "live")
        (state.live if which == "live" else state.imported).clear()
        await ws.send_json({"type": "cleared", "which": which})
    elif cmd == "store.tail":
        which = message.get("which", "live")
        store = state.live if which == "live" else state.imported
        await ws.send_json(
            {
                "type": "tail",
                "which": which,
                # Plain dicts, see snapshot(): dataclasses break send_json.
                "records": [m.to_dict() for m in store.tail(int(message.get("count", 0)))],
                "stats": store.stats().to_dict(),
            }
        )
    elif cmd == "device.read_settings":
        await asyncio.to_thread(controller.read_settings)
    elif cmd == "device.write":
        await asyncio.to_thread(
            controller.write_settings,
            mode=message.get("mode", "SLOW"),
            max_hold=bool(message.get("max_hold", False)),
            weighting=message.get("weighting", "A"),
            range_index=int(message.get("range", 0)),
        )
    elif cmd == "history.download":
        if not controller.connected and not controller.connect():
            await ws.send_json(
                {"type": "history_done", "count": 0, "records": [],
                 "message": "Sonomètre non connecté"}
            )
            return

        def _worker() -> None:
            records = controller.download_history()
            from .protocol import Measurement

            members = []
            for record in records:
                members.append(
                    Measurement(**{k: v for k, v in record.items()
                                   if k in Measurement.__dataclass_fields__})
                )
            state.imported.replace(members)

        await asyncio.to_thread(_worker)
    elif cmd == "app.settings.set":
        for key, value in (message.get("settings") or {}).items():
            if hasattr(state.settings, key):
                setattr(state.settings, key, value)
        state.settings.save()
        await ws.send_json(
            {"type": "app_settings", "settings": state.settings.to_dict()}
        )
    elif cmd == "ping":
        await ws.send_json({"type": "pong"})
    else:
        await ws.send_json({"type": "error", "message": f"commande inconnue: {cmd}"})


def make_state(
    transport=None,
    settings: AppSettings | None = None,
    force: str | None = None,
) -> State:
    """Build a state object, falling back to the simulator when needed.

    ``force`` may be ``"real"`` (require the hardware) or ``"sim"``.
    """
    from . import usb

    settings = settings or AppSettings.load()
    container: dict = {}

    def emit(event: dict) -> None:
        state = container.get("state")
        if state is not None:
            state.emit(event)

    if transport is None:
        if force == "sim":
            from .sim import SimTransport

            transport = SimTransport()
        elif force == "real":
            transport = usb.HidTransport()
        elif usb.is_connected():
            transport = usb.HidTransport()
        else:
            from .sim import SimTransport

            transport = SimTransport()

    controller = DeviceController(transport, settings, emit)
    state = State(controller, settings)
    container["state"] = state
    return state
