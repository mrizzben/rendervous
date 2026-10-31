"""Desktop entry point for the Windows / macOS bundles.

Runs the existing FastAPI app in-process on a free localhost port, then shows it
in a native webview window. `dist/` is served by that same app (see the mount at
the bottom of server/main.py), so there is no nginx and no second process.
"""

import importlib
import socket
import threading
import time

import uvicorn

from server.main import app


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main() -> None:
    # Desktop-only dependency (requirements-desktop.txt), imported here so a
    # plain backend/Docker install never needs it.
    try:
        webview = importlib.import_module("webview")
    except ImportError:
        raise SystemExit(
            "pywebview is missing — pip install -r requirements-desktop.txt"
        ) from None

    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    )
    # webview owns the main thread (Cocoa/WinForms require it); uvicorn skips
    # signal-handler setup when it is not on the main thread.
    threading.Thread(target=server.run, daemon=True, name="rendervous-http").start()
    while not server.started:
        time.sleep(0.05)

    webview.create_window(
        "Rendervous",
        f"http://127.0.0.1:{port}/",
        width=1500,
        height=950,
        min_size=(1100, 700),
    )
    webview.start()


if __name__ == "__main__":
    main()
