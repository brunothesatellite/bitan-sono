"""Seuils des zones de la Maison : assainissement et persistance."""

from slm.config import AppSettings, sanitize_home_thresholds


def test_sanitize_keeps_valid_thresholds():
    assert sanitize_home_thresholds([55, 65, 75]) == [55, 65, 75]


def test_sanitize_repairs_garbage_with_defaults():
    assert sanitize_home_thresholds([None, "x", object()]) == [55, 65, 75]
    assert sanitize_home_thresholds([]) == [55, 65, 75]
    assert sanitize_home_thresholds([50]) == [50, 65, 75]


def test_sanitize_enforces_order_and_bounds():
    assert sanitize_home_thresholds([70, 60, 50]) == [70, 71, 72]
    assert sanitize_home_thresholds([0, 0, 999]) == [31, 32, 89]
    assert sanitize_home_thresholds([88, 88, 88]) == [87, 88, 89]


def test_sanitize_rounds_to_integers():
    assert sanitize_home_thresholds([54.6, 65.4, 75]) == [55, 65, 75]


def test_sanitize_is_idempotent():
    once = sanitize_home_thresholds([90, 10, "nope"])
    assert sanitize_home_thresholds(once) == once


def test_settings_default_thresholds():
    s = AppSettings()
    assert (s.home_t1, s.home_t2, s.home_t3) == (55, 65, 75)


def test_settings_clamps_on_load(tmp_path):
    path = tmp_path / "settings.json"
    path.write_text('{"home_t1": 80, "home_t2": 40, "home_t3": 75}', encoding="utf-8")
    s = AppSettings.load(path)
    assert (s.home_t1, s.home_t2, s.home_t3) == (80, 81, 82)


def test_settings_round_trip(tmp_path):
    path = tmp_path / "settings.json"
    s = AppSettings(home_t1=50, home_t2=62, home_t3=78)
    s.save(path)
    again = AppSettings.load(path)
    assert (again.home_t1, again.home_t2, again.home_t3) == (50, 62, 78)
