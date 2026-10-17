"""Persisted application settings (mirrors the original ``Settings``)."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path


def _config_dir() -> Path:
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    path = Path(base) / "bitan-sono"
    path.mkdir(parents=True, exist_ok=True)
    return path


CONFIG_FILE = _config_dir() / "settings.json"


@dataclass
class AppSettings:
    """User preferences.  Defaults match the shipped ``SoundLevel.exe.config``."""

    low_alarm: int = 30
    high_alarm: int = 45
    sound_enabled: bool = False
    interval: float = 1.0  # seconds between live samples
    language: str = "fr"
    theme: str = "dark"

    # device defaults
    device_mode: str = "SLOW"  # FAST / SLOW
    device_weighting: str = "A"  # A / C
    device_max_hold: bool = False
    device_range: int = 0

    @classmethod
    def load(cls, path: Path | None = None) -> "AppSettings":
        path = path or CONFIG_FILE
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
            known = {f for f in cls().__dataclass_fields__}  # type: ignore[attr-defined]
            return cls(**{k: v for k, v in data.items() if k in known})
        except (OSError, ValueError):
            return cls()

    def save(self, path: Path | None = None) -> None:
        path = path or CONFIG_FILE
        Path(path).write_text(
            json.dumps(asdict(self), indent=2, ensure_ascii=False), encoding="utf-8"
        )

    def to_dict(self) -> dict:
        return asdict(self)
