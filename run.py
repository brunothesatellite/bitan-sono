"""bitan-sono launcher.

Starts the FastAPI server and opens it either in a native desktop window
(pywebview / WebView2) or in the default browser.

    python run.py                 # native window (or browser fallback)
    python run.py --no-gui        # open in the default browser
    python run.py --sim           # force the simulator
    python run.py --device real   # require the physical meter
    python run.py --scan          # list HID devices and exit
"""

from __future__ import annotations

import argparse
import logging
import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except Exception:
        pass

from slm import usb  # noqa: E402
from slm.server import create_app, make_state  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("bitan-sono")


def _setup_frozen_logging() -> None:
    """When frozen (no console), also log to %APPDATA%/bitan-sono/bitan-sono.log."""
    if not getattr(sys, "frozen", False):
        return
    # A windowed bootloader leaves stdout/stderr as None, which breaks libraries
    # that call .isatty() (uvicorn's logging, tqdm, ...). Point them at a sink.
    import os

    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w", encoding="utf-8")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w", encoding="utf-8")
    try:
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
        directory = Path(base) / "bitan-sono"
        directory.mkdir(parents=True, exist_ok=True)
        handler = logging.FileHandler(directory / "bitan-sono.log", encoding="utf-8")
        handler.setFormatter(
            logging.Formatter("%(asctime)s  %(levelname)-7s %(name)s: %(message)s")
        )
        logging.getLogger().addHandler(handler)
        log.info("bitan-sono démarré (gelé)")
    except Exception:
        pass


_setup_frozen_logging()


def _install_gui_watchdog(window, url: str, timeout: float = 30.0) -> None:
    """Never leave the user with a frozen window.

    pywebview/WebView2 initialisation can stall (a native object on the
    ``js_api`` object, a busy profile, ...). If the ``loaded`` event never
    fires, open the interface in the default browser instead: the local
    server is already running and independent from the window.
    """

    def _watch() -> None:
        try:
            if window.events.loaded.wait(timeout):
                return
        except Exception:  # pragma: no cover - defensive
            return
        log.warning(
            "la fenêtre native n'a pas fini de charger en %.0f s : "
            "ouverture de secours dans le navigateur", timeout,
        )
        try:
            webbrowser.open(url)
        except Exception:  # pragma: no cover
            pass

    threading.Thread(target=_watch, name="gui-watchdog", daemon=True).start()


def _enable_stall_trace() -> None:
    """Diagnostic aid: dump every thread stack periodically.

    Set ``BITAN_SONO_TRACE=1`` to write the stacks of all threads to
    ``%TEMP%/bitan-sono-stacks.txt`` every 20 s. Used to locate freezes
    (the window reports "not responding" while a thread holds the GIL).
    """
    if not os.environ.get("BITAN_SONO_TRACE"):
        return
    import faulthandler
    import tempfile

    path = Path(tempfile.gettempdir()) / "bitan-sono-stacks.txt"
    handle = open(path, "w", encoding="utf-8")  # noqa: SIM115 - faulthandler owns it
    faulthandler.dump_traceback_later(20, repeat=True, file=handle)
    log.info("suivi des blocages actif -> %s", path)


_enable_stall_trace()

FILE_TYPES_XLSX = ("Classeur Excel (*.xlsx)", "Texte CSV (*.csv)")
FILE_TYPES_ANY = ("Données (*.xlsx;*.xls;*.csv)", "Tous les fichiers (*.*)")


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def default_window_size() -> tuple[int, int]:
    """Size the window to ~92% of the primary screen work area."""
    try:
        import ctypes
        from ctypes import wintypes

        rect = wintypes.RECT()
        # SPI_GETWORKAREA = 0x0030
        if ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0):
            width = rect.right - rect.left
            height = rect.bottom - rect.top
            if width > 800 and height > 600:
                return int(width * 0.92), int(height * 0.92)
    except Exception:  # pragma: no cover - non Windows
        pass
    return 1440, 920


# The native window handle lives in a module global on purpose.
#
# pywebview builds the JS proxy by walking *every public attribute* of the
# ``js_api`` object (``webview.util.get_functions``) and recursing into any
# non-callable object it finds. Storing the pywebview Window there made it walk
# the .NET window object, whose properties return a brand new object on each
# access (``AccessibilityObject.Bounds.Empty.Empty.Empty...``) -> endless
# recursion that froze the whole application ("Ne répond pas").
_window = None


class DesktopApi:
    """Callbacks exposed to the web UI through ``window.pywebview.api``.

    Only plain methods may live on this object (nothing else is walked safely).
    """

    def choose_save_path(self, default_name: str = "mesures.xlsx"):
        import webview

        if _window is None:
            return None
        result = _window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=default_name,
            file_types=FILE_TYPES_XLSX,
        )
        if not result:
            return None
        return result if isinstance(result, str) else result[0]

    def choose_open_path(self):
        import webview

        if _window is None:
            return None
        result = _window.create_file_dialog(
            webview.OPEN_DIALOG, allow_multiple=False, file_types=FILE_TYPES_ANY
        )
        if not result:
            return None
        return result if isinstance(result, str) else result[0]


def start_server(app, host: str, port: int):
    import uvicorn

    # log_config=None: keep our own logging (the default uvicorn config breaks
    # in a windowed frozen app where sys.stdout is None).
    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        log_config=None,
        access_log=False,
        log_level="warning",
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, name="uvicorn", daemon=True)
    thread.start()
    for _ in range(200):
        if server.started:
            break
        time.sleep(0.05)
    if not server.started:
        log.error("le serveur local n'a pas démarré")
    return server


def main() -> int:
    parser = argparse.ArgumentParser(description="bitan-sono sound level meter")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--no-gui", action="store_true",
                        help="serve in the default browser instead of a native window")
    parser.add_argument("--device", choices=["auto", "real", "sim"], default="auto")
    parser.add_argument("--scan", action="store_true", help="list HID devices and exit")
    args = parser.parse_args()

    if args.scan:
        print(usb.describe_devices())
        return 0

    if not usb.HID_AVAILABLE:
        log.warning("le paquet 'hid' est absent : le matériel ne sera pas accessible")

    if args.device == "real" and not usb.is_connected():
        log.error("sonomètre introuvable (VID=%04X PID=%04X)", usb.VID, usb.PID)
        print(usb.describe_devices())
        return 1

    state = make_state(force=None if args.device == "auto" else args.device)
    if state.controller.simulated:
        log.info("mode simulateur (aucun sonomètre détecté)")

    app = create_app(state)
    port = args.port or free_port()
    start_server(app, args.host, port)
    url = f"http://{args.host}:{port}/"
    log.info("interface disponible sur %s", url)

    if args.no_gui:
        webbrowser.open(url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            return 0

    try:
        import webview
    except ImportError:
        log.warning("pywebview indisponible : ouverture dans le navigateur")
        webbrowser.open(url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            return 0

    api = DesktopApi()
    win_w, win_h = default_window_size()
    window = webview.create_window(
        "bitan-sono",
        url,
        js_api=api,
        width=win_w,
        height=win_h,
        min_size=(960, 620),
        text_select=False,
    )
    # Keep the window off the js_api object (see the _window comment above).
    global _window
    _window = window
    _install_gui_watchdog(window, url)
    icon = ROOT / "web" / "assets" / "app.ico"
    webview.start(icon=str(icon) if icon.exists() else None)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:
        log.exception("échec fatal au démarrage")
        raise
