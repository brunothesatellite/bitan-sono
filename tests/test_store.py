"""Unit tests for the measurement store (percentiles L10 / L50 / L90)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from slm.protocol import Measurement  # noqa: E402
from slm.store import MeasurementStore, _percentile  # noqa: E402


def _store(*values: float) -> MeasurementStore:
    store = MeasurementStore()
    for i, value in enumerate(values, 1):
        store.add(Measurement(no=i, value=value))
    return store


def test_empty_store_gives_zero_stats():
    assert _store().stats().to_dict() == {
        "count": 0, "min": 0.0, "max": 0.0, "avg": 0.0,
        "leq": 0.0, "l10": 0.0, "l50": 0.0, "l90": 0.0,
    }


def test_percentile_convention():
    # L10 = exceeded 10 % of the time -> 90th percentile, L90 -> 10th.
    values = [float(v) for v in (40, 50, 60, 70, 80)]
    assert _percentile(values, 90) == 76.0
    assert _percentile(values, 50) == 60.0
    assert _percentile(values, 10) == 44.0
    assert _percentile([55.0], 90) == 55.0


def test_store_stats_include_l10_l50_l90():
    stats = _store(40, 50, 60, 70, 80).stats()
    assert (stats.l10, stats.l50, stats.l90) == (76.0, 60.0, 44.0)
    assert stats.count == 5
    assert stats.minimum == 40 and stats.maximum == 80
    assert stats.average == 60.0
    assert stats.leq > stats.average  # energy average dominates
    as_dict = stats.to_dict()
    assert (as_dict["l10"], as_dict["l50"], as_dict["l90"]) == (76.0, 60.0, 44.0)


def test_percentiles_robust_to_duplicates():
    stats = _store(52, 52, 52, 52).stats()
    assert (stats.l10, stats.l50, stats.l90) == (52.0, 52.0, 52.0)
