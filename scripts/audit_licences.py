"""Audit de conformité des licences avant publication publique."""
import importlib.metadata as md
import re
from pathlib import Path

WANTED = (
    "fastapi", "uvicorn", "pydantic", "starlette", "openpyxl", "xlrd",
    "pywinusb", "pywebview", "pythonnet", "anyio", "websockets", "click",
    "h11", "typing-extensions", "et-xmlfile", "certifi", "idna",
    "sniffio", "annotated-types", "httptools", "python-dotenv", "watchfiles",
)

ALLOWED = ("mit", "apache", "bsd", "isc", "unlicense", "public domain", "python software foundation")

rows = []
for dist in md.distributions():
    name = (dist.metadata["Name"] or "").strip()
    if not name or name.lower() not in WANTED:
        continue
    lic = dist.metadata.get("License") or ""
    if not lic or len(lic) > 60:
        lic = ""
    classifiers = [c for c in dist.metadata.get_all("Classifier") or [] if c.startswith("License")]
    if not lic:
        lic = "; ".join(c.split("::")[-1].strip() for c in classifiers) or "?"
    version = dist.version
    low = lic.lower()
    status = "OK " if any(a in low for a in ALLOWED) else "?? "
    rows.append((status, name, version, lic.replace("\n", " ")[:70]))

for r in sorted(rows):
    print(f"{r[0]} {r[1]:<20} {r[2]:<10} {r[3]}")

# Les fichiers de licence sont parfois dans dist-info/licenses/
print("\n--- licences embarquees (dist-info/licenses) ---")
for dist in md.distributions():
    name = (dist.metadata["Name"] or "").strip()
    if not name or name.lower() not in WANTED:
        continue
    if dist.metadata.get("License"):
        continue
    folder = Path(dist._path) / "licenses"  # type: ignore[attr-defined]
    if not folder.is_dir():
        print(f"?? {name:<20} aucun fichier de licence")
        continue
    for f in sorted(folder.rglob("*")):
        if not f.is_file():
            continue
        text = f.read_text(encoding="utf-8", errors="replace")[:4000]
        kind = "?"
        for pat, label in (
            (r"MIT License|Permission is hereby granted", "MIT"),
            (r"Apache License", "Apache-2.0"),
            (r"Redistribution and use in source and binary", "BSD"),
            (r"ISC License", "ISC"),
        ):
            if re.search(pat, text, re.I):
                kind = label
                break
        print(f"{'OK ' if kind != '?' else '?? '} {name:<20} {kind:<10} ({f.name})")

echarts = Path("web/vendor/echarts.min.js")
if echarts.exists():
    head = echarts.read_text(encoding="utf-8", errors="replace")[:400]
    print("\nBandeau de licence ECharts (debut du fichier) :")
    print(head.split("*/")[0][:300] if "*/" in head else head[:300])
