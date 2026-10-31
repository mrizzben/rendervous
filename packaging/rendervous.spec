# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Rendervous desktop app (Windows / macOS).

Build from the repo root after the frontend is built:

    npm ci && npm run build
    pyinstaller packaging/rendervous.spec --noconfirm \
        --distpath build/app --workpath build/pyinstaller

Output: build/app/Rendervous/ (Windows) or build/app/Rendervous.app (macOS).
"""

import os
import sys

ROOT = os.path.dirname(SPECPATH)
IS_MAC = sys.platform == "darwin"

# server/db.py derives BASE_DIR from server/db.py's own path, so on disk the
# bundle keeps the same layout as the repo: dist/ and server/*.json.
datas = [
    (os.path.join(ROOT, "dist"), "dist"),
    (os.path.join(ROOT, "server", "prompts.json"), "server"),
    (os.path.join(ROOT, "server", "models_catalog.json"), "server"),
]

# pywebview picks its backend at runtime; make sure PyInstaller keeps it.
# 6.x: Windows = WinForms/WebView2 host, macOS = Cocoa/WKWebView.
hiddenimports = (
    ["webview.platforms.cocoa"] if IS_MAC else ["webview.platforms.winforms"]
)

a = Analysis(
    [os.path.join(ROOT, "desktop.py")],
    pathex=[ROOT],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "PyQt5", "PyQt6", "PySide2", "PySide6"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Rendervous",
    debug=False,
    strip=False,
    upx=False,
    console=False,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="Rendervous")

if IS_MAC:
    app = BUNDLE(
        coll,
        name="Rendervous.app",
        icon=None,
        bundle_identifier="studio.rendervous.desktop",
        info_plist={
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "11.0",
            "CFBundleShortVersionString": os.environ.get(
                "APP_VERSION", "0.1.0"
            ),
            "CFBundleVersion": os.environ.get("APP_VERSION", "0.1.0"),
        },
    )
