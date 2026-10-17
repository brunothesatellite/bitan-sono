"""In-memory measurement store and statistics."""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterable

from .protocol import Measurement


@dataclass
class Stats:
    count: int = 0
    minimum: float = 0.0
    maximum: float = 0.0
    average: float = 0.0
    leq: float = 0.0
    # Standard acoustic percentiles: L10 = level exceeded 10 % of the time
    # (peaks), L50 = median, L90 = background noise (exceeded 90 %).
    l10: float = 0.0
    l50: float = 0.0
    l90: float = 0.0

    def to_dict(self) -> dict:
        return {
            "count": self.count,
            "min": round(self.minimum, 1),
            "max": round(self.maximum, 1),
            "avg": round(self.average, 1),
            "leq": round(self.leq, 1),
            "l10": round(self.l10, 1),
            "l50": round(self.l50, 1),
            "l90": round(self.l90, 1),
        }


class MeasurementStore:
    """Thread-safe collection of measurements for one view (live or import)."""

    def __init__(self) -> None:
        self._items: list[Measurement] = []
        self._lock = threading.RLock()

    def add(self, member: Measurement) -> Measurement:
        with self._lock:
            member.no = len(self._items) + 1
            self._items.append(member)
            return member

    def extend(self, members: Iterable[Measurement]) -> int:
        with self._lock:
            for member in members:
                member.no = len(self._items) + 1
                self._items.append(member)
            return len(self._items)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()

    def replace(self, members: Iterable[Measurement]) -> None:
        with self._lock:
            self._items = list(members)
            for i, member in enumerate(self._items, 1):
                member.no = i

    def __len__(self) -> int:
        return len(self._items)

    def items(self) -> list[Measurement]:
        with self._lock:
            return list(self._items)

    def tail(self, count: int) -> list[Measurement]:
        with self._lock:
            return self._items[-count:] if count else list(self._items)

    def stats(self) -> Stats:
        with self._lock:
            values = [m.value for m in self._items]
        if not values:
            return Stats()
        total = sum(values)
        power = sum(10 ** (v / 10.0) for v in values) / len(values)
        import math

        return Stats(
            count=len(values),
            minimum=min(values),
            maximum=max(values),
            average=total / len(values),
            leq=10 * math.log10(power) if power > 0 else 0.0,
            l10=_percentile(values, 90),
            l50=_percentile(values, 50),
            l90=_percentile(values, 10),
        )

    def to_records(self) -> list[dict]:
        return [m.to_dict() for m in self.items()]


def _percentile(values: list[float], pct: float) -> float:
    """Linear-interpolation percentile (``pct`` in 0..100)."""
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * (pct / 100.0)
    low = int(rank)
    frac = rank - low
    if low + 1 >= len(ordered):
        return ordered[-1]
    return ordered[low] + frac * (ordered[low + 1] - ordered[low])
