"""Low level USB HID access for the sound level meter.

Two backends are supported transparently:

* **pywinusb** (pure python, bundled with the app) - preferred on Windows,
* **hid** (cython-hidapi) - fallback when a system hidapi is available.

The device is a CH32V10x bridge exposing a 9 byte vendor defined report
(usage page 0xFF00)::

    input  : [report_id, value_hi, value_lo, flags, ...]
    output : [report_id, command, arg, 0, 0, 0, 0, 0, 0]

Nothing here knows about the measurement protocol - see :mod:`slm.device`.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Iterable

log = logging.getLogger(__name__)

BACKEND: str | None = None
_pwhid = None
_hidapi = None

try:  # preferred: pure python, no external dll
    from pywinusb import hid as _pwhid  # type: ignore

    BACKEND = "pywinusb"
except Exception:  # pragma: no cover
    try:
        import hid as _hidapi  # type: ignore

        BACKEND = "hid"
    except Exception:
        BACKEND = None

HID_AVAILABLE = BACKEND is not None

VID = 0x64BD
PID = 0x74E3

HID_REPORT_LEN = 9
_REPORT_LEN_CANDIDATES = (9, 65, 64, 8)


@dataclass
class HidDeviceInfo:
    path: str = ""
    vendor_id: int = 0
    product_id: int = 0
    product: str = ""
    manufacturer: str = ""
    serial: str = ""
    usage_page: int = 0
    usage: int = 0
    raw: object = field(default=None, repr=False)

    @property
    def label(self) -> str:
        return (
            f"{self.product or 'HID device'} "
            f"VID={self.vendor_id:04X} PID={self.product_id:04X}"
        )


# --------------------------------------------------------------------------
# Discovery
# --------------------------------------------------------------------------
def enumerate_all() -> list[HidDeviceInfo]:
    """Return every HID device visible to the backend."""
    if BACKEND == "pywinusb":
        return [
            HidDeviceInfo(
                path=str(d.device_path),
                vendor_id=d.vendor_id,
                product_id=d.product_id,
                product=d.product_name or "",
                raw=d,
            )
            for d in _pwhid.HidDeviceFilter().get_devices()
        ]
    if BACKEND == "hid":
        result = []
        for entry in _hidapi.enumerate() or []:
            def s(key: str) -> str:
                value = entry.get(key)
                return value if isinstance(value, str) else ""

            result.append(
                HidDeviceInfo(
                    path=entry.get("path", b"").decode(errors="replace")
                    if isinstance(entry.get("path"), bytes)
                    else str(entry.get("path", "")),
                    vendor_id=entry.get("vendor_id", 0),
                    product_id=entry.get("product_id", 0),
                    product=s("product_string"),
                    manufacturer=s("manufacturer_string"),
                    serial=s("serial_number"),
                    usage_page=entry.get("usage_page", 0),
                    usage=entry.get("usage", 0),
                )
            )
        return result
    return []


def find_device(vid: int = VID, pid: int = PID) -> list[HidDeviceInfo]:
    return [d for d in enumerate_all() if d.vendor_id == vid and d.product_id == pid]


def is_connected(vid: int = VID, pid: int = PID) -> bool:
    return bool(find_device(vid, pid))


def describe_devices(infos: Iterable[HidDeviceInfo] | None = None) -> str:
    infos = list(infos if infos is not None else enumerate_all())
    header = f"backend: {BACKEND or 'none'}"
    if not infos:
        return header + "\nno HID devices found"
    lines = [header]
    for i in infos:
        mark = "  <== sonomètre" if i.vendor_id == VID and i.product_id == PID else ""
        lines.append(
            f"VID={i.vendor_id:04X} PID={i.product_id:04X} {i.manufacturer} / {i.product}{mark}"
        )
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Transport
# --------------------------------------------------------------------------
class HidTransport:
    """Bidirectional HID transport for the sound level meter."""

    is_simulated = False

    def __init__(
        self,
        info: HidDeviceInfo | None = None,
        vid: int = VID,
        pid: int = PID,
        on_report: Callable[[bytes], None] | None = None,
        on_error: Callable[[Exception], None] | None = None,
    ) -> None:
        self._info = info
        self._vid = vid
        self._pid = pid
        self.on_report = on_report
        self.on_error = on_error
        self._dev = None
        self._out_report = None
        self._reader: threading.Thread | None = None
        self._stop = threading.Event()
        self.output_report_len = HID_REPORT_LEN

    @property
    def info(self) -> HidDeviceInfo | None:
        return self._info

    # -- lifecycle --------------------------------------------------------
    def open(self) -> None:
        if not HID_AVAILABLE:
            raise RuntimeError("no HID backend available (install pywinusb)")

        if BACKEND == "pywinusb":
            self._open_pywinusb()
        else:
            if self._info is None:
                candidates = find_device(self._vid, self._pid)
                if not candidates:
                    raise IOError(
                        f"appareil VID={self._vid:04X} PID={self._pid:04X} introuvable"
                    )
                self._info = candidates[0]
            self._open_hidapi()
        log.info("HID ouvert: %s (rapport sortie %d octets)",
                 self._info.label if self._info else "?", self.output_report_len)

    def _candidate_infos(self) -> Iterable[HidDeviceInfo]:
        """The remembered handle first, then a fresh enumeration.

        A power cycle (or another program taking over) invalidates the old
        handle, so re-enumerating is what makes a reconnect possible.
        """
        if self._info is not None and self._info.raw is not None:
            yield self._info
        for info in find_device(self._vid, self._pid):
            if info is not self._info:
                yield info

    def _open_pywinusb(self) -> None:
        if not is_connected(self._vid, self._pid) and self._info is None:
            raise IOError(
                f"appareil VID={self._vid:04X} PID={self._pid:04X} introuvable"
            )
        errors: list[str] = []
        for info in self._candidate_infos():
            dev = info.raw
            if dev is None:  # pragma: no cover - defensive
                continue
            try:
                dev.open()
            except Exception as exc:
                errors.append(str(exc))
                continue
            self._info = info
            self._dev = dev
            dev.set_raw_data_handler(self._on_pywinusb_report)
            reports = dev.find_output_reports()
            if reports:
                self._out_report = reports[0]
                self.output_report_len = len(self._out_report.get_raw_data())
            caps = dev.hid_caps
            if caps is not None:
                self.output_report_len = (
                    caps.output_report_byte_length or self.output_report_len
                )
            return
        detail = "; ".join(errors) or "appareil introuvable"
        raise IOError(
            "impossible d'ouvrir le sonomètre (déjà utilisé par une autre "
            f"application ?) : {detail}"
        )

    def _open_hidapi(self) -> None:
        self._dev = _hidapi.device()
        self._dev.open_path(self._info.raw if self._info.raw else self._info.path)
        self._dev.set_nonblocking(True)
        self._probe_output_len()
        self._stop.clear()
        self._reader = threading.Thread(
            target=self._read_loop, name="hid-reader", daemon=True
        )
        self._reader.start()

    def _probe_output_len(self) -> None:
        for length in _REPORT_LEN_CANDIDATES:
            try:
                written = self._dev.write(bytes([0x00]) * length)
                if written is not None and written >= 0:
                    self.output_report_len = length
                    return
            except Exception as exc:  # pragma: no cover
                log.debug("longueur de rapport %d refusée: %s", length, exc)
        self.output_report_len = HID_REPORT_LEN

    def is_open(self) -> bool:
        return self._dev is not None

    def close(self) -> None:
        self._stop.set()
        if self._reader and self._reader.is_alive():
            self._reader.join(timeout=1.0)
        self._reader = None
        if self._dev is not None:
            try:
                if BACKEND == "pywinusb":
                    self._dev.set_raw_data_handler(None)
                self._dev.close()
            except Exception:  # pragma: no cover
                pass
            self._dev = None
        self._out_report = None

    # -- io ---------------------------------------------------------------
    def write(self, frame: bytes) -> None:
        if self._dev is None:
            raise IOError("transport non ouvert")
        length = self.output_report_len
        if len(frame) < length:
            frame = frame + bytes(length - len(frame))
        elif len(frame) > length:
            frame = frame[:length]

        if BACKEND == "pywinusb":
            report = self._out_report
            if report is None:
                raise IOError("aucun rapport de sortie")
            report.set_raw_data(list(frame))
            report.send()
            return

        result = self._dev.write(bytes(frame))
        if result is not None and result < 0:
            raise IOError(f"écriture HID échouée ({result})")

    def _on_pywinusb_report(self, report: list[int]) -> None:
        if self.on_report and report:
            self.on_report(bytes(report))

    def _read_loop(self) -> None:
        while not self._stop.is_set():
            try:
                data = self._dev.read(64, 100)
            except Exception as exc:
                if not self._stop.is_set():
                    log.info("lecture HID interrompue: %s", exc)
                    if self.on_error:
                        self.on_error(exc)
                return
            if data and self.on_report:
                self.on_report(bytes(data))


class HotplugWatcher:
    """Poll the backend for connect/disconnect events of the target device."""

    def __init__(
        self,
        vid: int = VID,
        pid: int = PID,
        on_connect: Callable[[HidDeviceInfo], None] | None = None,
        on_disconnect: Callable[[], None] | None = None,
        interval: float = 1.0,
    ) -> None:
        self._vid = vid
        self._pid = pid
        self.on_connect = on_connect
        self.on_disconnect = on_disconnect
        self._interval = interval
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._present = False

    def start(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="hid-hotplug", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self._thread = None

    def _run(self) -> None:
        while not self._stop.is_set():
            devices = find_device(self._vid, self._pid)
            present = bool(devices)
            if present and not self._present:
                self._present = True
                if self.on_connect:
                    self.on_connect(devices[0])
            elif not present and self._present:
                self._present = False
                if self.on_disconnect:
                    self.on_disconnect()
            self._stop.wait(self._interval)
