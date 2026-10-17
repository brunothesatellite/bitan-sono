"""Import / export of measurements (CSV, XLSX, legacy XLS).

The XLSX layout mirrors the original application (title row, then a header
row, then the data) so files remain interchangeable::

    | Sound Level Meter                        |   <- title (merged)
    | NO. | MeaValue | Weighting | Time | Date  |   <- headers
    | 1   | 55.7     | A         | 17:00:42 | 17/10/2026
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Iterable

COLUMNS = ["NO.", "MeaValue", "Weighting", "Time", "Date"]

# Accepted spellings when re-importing (lower-case, no spaces/underscores)
_ALIASES = {
    "no": "no",
    "no.": "no",
    "n": "no",
    "index": "no",
    "meavalue": "value",
    "mea value": "value",
    "value": "value",
    "db": "value",
    "spl": "value",
    "weighting": "weighting",
    "poids": "weighting",
    "ponderation": "weighting",
    "time": "time",
    "heure": "time",
    "date": "date",
}


def _normalize_header(text: str) -> str | None:
    key = str(text).strip().lower().replace("_", " ")
    return _ALIASES.get(key)


def export_xlsx(records: list[dict], path: str | Path, title: str = "Sound Level Meter") -> Path:
    """Write records to an .xlsx file (requires openpyxl)."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font
    from openpyxl.utils import get_column_letter

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Measures"

    sheet.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(COLUMNS))
    cell = sheet.cell(row=1, column=1, value=title)
    cell.font = Font(bold=True, size=16)
    cell.alignment = Alignment(horizontal="center")

    for col, name in enumerate(COLUMNS, 1):
        head = sheet.cell(row=2, column=col, value=name)
        head.font = Font(bold=True)
        head.alignment = Alignment(horizontal="center")

    for i, record in enumerate(records, start=3):
        sheet.cell(row=i, column=1, value=record.get("no", i - 2))
        sheet.cell(row=i, column=2, value=round(float(record.get("value", 0.0)), 1))
        sheet.cell(row=i, column=3, value=record.get("weighting", "A"))
        sheet.cell(row=i, column=4, value=record.get("time", ""))
        sheet.cell(row=i, column=5, value=record.get("date", ""))

    widths = [6, 12, 12, 12, 14]
    for col, width in enumerate(widths, 1):
        sheet.column_dimensions[get_column_letter(col)].width = width

    path = Path(path)
    workbook.save(path)
    return path


def export_csv(records: list[dict], path: str | Path) -> Path:
    path = Path(path)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle, delimiter=";")
        writer.writerow(COLUMNS)
        for i, record in enumerate(records, 1):
            writer.writerow(
                [
                    record.get("no", i),
                    f"{float(record.get('value', 0.0)):.1f}",
                    record.get("weighting", "A"),
                    record.get("time", ""),
                    record.get("date", ""),
                ]
            )
    return path


def _rows_to_records(rows: Iterable[Iterable]) -> list[dict]:
    records: list[dict] = []
    header: list[str | None] | None = None
    for row in rows:
        cells = list(row)
        if header is None:
            mapped = [_normalize_header(c) for c in cells if c is not None]
            if any(mapped):
                header = mapped
            continue
        record = {"no": len(records) + 1, "value": 0.0, "weighting": "A", "time": "", "date": ""}
        for key, value in zip(header, cells):
            if key is None or value is None:
                continue
            if key == "value":
                try:
                    record["value"] = float(str(value).replace(",", "."))
                except ValueError:
                    pass
            elif key in ("no", "time", "date", "weighting"):
                record[key] = str(value).strip()
        if record["time"] or record["date"] or record["value"]:
            if str(record["no"]).strip().isdigit():
                record["no"] = int(str(record["no"]).strip())
            records.append(record)
    return records


def import_table(path: str | Path) -> list[dict]:
    """Import CSV / XLSX / XLS and return a list of record dicts."""
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            sample = handle.read(2048)
            handle.seek(0)
            try:
                dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
            except csv.Error:
                dialect = csv.excel
                dialect.delimiter = ";" if ";" in sample else ","
            return _rows_to_records(list(csv.reader(handle, dialect)))
    if suffix == ".xlsx":
        from openpyxl import load_workbook

        workbook = load_workbook(path, data_only=True, read_only=True)
        rows = [list(r) for r in workbook.active.iter_rows(values_only=True)]
        return _rows_to_records(rows)
    if suffix == ".xls":
        import xlrd

        book = xlrd.open_workbook(str(path))
        sheet = book.sheet_by_index(0)
        return _rows_to_records(sheet.row_values(i) for i in range(sheet.nrows))
    raise ValueError(f"unsupported file type: {suffix}")
