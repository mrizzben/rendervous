"""Smoke-check data paths for source, override, and frozen desktop builds."""

import os
from unittest.mock import patch

from server import db


def test_data_dir() -> None:
    override = os.path.join(os.path.expanduser("~"), "Rendervous-test-data")
    with patch.dict(os.environ, {"RENDERVOUS_DATA": override}):
        assert db._data_dir() == override

    env = {
        "HOME": "/home/test-user",
        "LOCALAPPDATA": r"C:\Users\test-user\AppData\Local",
    }
    env["RENDERVOUS_DATA"] = ""
    with patch.dict(os.environ, env), patch.object(
        db.sys, "frozen", False, create=True
    ):
        assert db._data_dir() == os.path.join(db.BASE_DIR, "data")

    with patch.dict(os.environ, env), patch.object(
        db.sys, "frozen", True, create=True
    ):
        if os.name == "nt":
            expected = os.path.join(env["LOCALAPPDATA"], "Rendervous")
        else:
            expected = os.path.join(
                env["HOME"], "Library", "Application Support", "Rendervous"
            )
        assert db._data_dir() == expected


if __name__ == "__main__":
    test_data_dir()
    print("desktop data paths ok")
