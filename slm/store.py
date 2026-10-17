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

    def to_dict(self) -> dict:
        return {
            "count": self.count,
            "min": round(self.minimum, 1),
            "max": round(self.maximum, 1),
            "avg": round(self.average, 1),
            "leq": round(self.leq, 1),
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
        )

    def to_records(self) -> list[dict]:
        return [m.to_dict() for m in self.items()]
