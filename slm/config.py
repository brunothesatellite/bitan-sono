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


# Seuils des 4 zones de la Maison (baromètre + météo), en dB.
# Le dosimètre « zone rouge » garde son propre seuil (75 dB) : c'est un
# compteur d'exposition, pas une ambiance.
HOME_LO = 30
HOME_HI = 90
DEFAULT_HOME_T = (55, 65, 75)


def sanitize_home_thresholds(values) -> list[int]:
    """Nettoie 3 seuils : entiers, ordonnés, écart >= 1 dB, dans ]30..90[.

    Les valeurs illisibles sont remplacées par les défauts ; l'ordre est
    imposé en resserrant vers les voisins. Idempotent.
    """
    out = []
    for i, default in enumerate(DEFAULT_HOME_T):
        try:
            number = int(round(float(values[i])))
        except (TypeError, ValueError, IndexError):
            number = default
        out.append(number)
    low = HOME_LO + 1
    for i in range(3):
        out[i] = max(low, min(HOME_HI - 1 - (2 - i), out[i]))
        low = out[i] + 1
    return out


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

    # seuils des 4 zones de la Maison (baromètre + météo), en dB
    home_t1: int = 55
    home_t2: int = 65
    home_t3: int = 75

    def __post_init__(self) -> None:
        self.clamp_home_thresholds()

    def clamp_home_thresholds(self) -> None:
        """Réordonne et borne les seuils (fichier ancien ou requête hostile)."""
        t1, t2, t3 = sanitize_home_thresholds([self.home_t1, self.home_t2, self.home_t3])
        self.home_t1, self.home_t2, self.home_t3 = t1, t2, t3

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
