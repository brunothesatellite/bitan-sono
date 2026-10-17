# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec: build a single-file Windows executable.

    pyinstaller build.spec --noconfirm

The result is ``dist/bitan-sono.exe``: a self contained app bundling the
Python runtime, the web UI and the original alarm sounds / icon.
"""

from PyInstaller.utils.hooks import collect_all, collect_submodules

datas = [("web", "web")]
binaries = []
hiddenimports = []

# uvicorn imports its loop/protocol implementations dynamically
hiddenimports += collect_submodules("uvicorn")

# pywebview (native window) and its Windows backend
for package in ("webview", "pywinusb", "openpyxl", "xlrd"):
    try:
        pkg_datas, pkg_binaries, pkg_hidden = collect_all(package)
        datas += pkg_datas
        binaries += pkg_binaries
        hiddenimports += pkg_hidden
    except Exception:
        pass

hiddenimports += [
    "clr",  # pythonnet, used by the pywebview EdgeChromium backend
    "slm.sim",
    "slm.protocol",
    "slm.usb",
    "slm.store",
    "slm.export",
]

block_cipher = None

a = Analysis(
    ["run.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "pytest", "PIL"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="bitan-sono",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # GUI application, no console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon="web/assets/app.ico",
)
