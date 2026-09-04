"""SQLite persistence for Rendervous.

One shared connection (check_same_thread=False) guarded by a lock.

Every operation is a small concrete function with the SQL literal inline at the
call site and params always bound as a tuple — nothing interpolates user input
into SQL strings.

Schema mirrors PLAN.md §19: Project -> Design -> Visualization -> Revision,
plus jobs (async generation). The OpenRouter model list is a bundled static
file (server/models_catalog.json), not DB state.
"""

import os
import sqlite3
import threading
import uuid

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
IMAGES_DIR = os.path.join(DATA_DIR, "images")
DB_PATH = os.path.join(DATA_DIR, "rendervous.db")

_lock = threading.RLock()
_conn = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS designs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_path TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS visualizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  design_id INTEGER NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Visualization',
  settings TEXT NOT NULL DEFAULT '{}',
  current_revision_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visualization_id INTEGER NOT NULL REFERENCES visualizations(id) ON DELETE CASCADE,
  parent_revision_id INTEGER,
  label TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  negative_prompt TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  params TEXT NOT NULL DEFAULT '{}',
  image_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | running | done | failed
  model TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  params TEXT NOT NULL DEFAULT '{}',
  image_path TEXT,
  error TEXT,
  revision_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
"""


def _migrate() -> None:
    """Add columns introduced after the first schema (existing data/ DBs)."""
    for table in ("projects", "designs"):
        cols = {r["name"] for r in conn().execute(f"PRAGMA table_info({table})")}
        if "archived" not in cols:
            conn().execute(
                f"ALTER TABLE {table} ADD COLUMN archived INTEGER NOT NULL DEFAULT 0"
            )
    conn().commit()


def conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        with _lock:
            if _conn is None:
                try:
                    os.makedirs(IMAGES_DIR, exist_ok=True)
                except OSError as e:
                    raise RuntimeError(
                        f"cannot create data dir {IMAGES_DIR}: {e}"
                    ) from e
                _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
                _conn.row_factory = sqlite3.Row
                _conn.execute("PRAGMA foreign_keys = ON")
                _conn.executescript(SCHEMA)
                _migrate()
                _conn.commit()
    return _conn


# ---------------------------------------------------------------- projects


def create_project(name: str) -> int:
    with _lock:
        cur = conn().execute("INSERT INTO projects(name) VALUES (?)", (name,))
        conn().commit()
        assert cur.lastrowid is not None  # INSERT always sets lastrowid
        return cur.lastrowid


def get_project(project_id: int):
    with _lock:
        row = (
            conn()
            .execute("SELECT * FROM projects WHERE id=?", (project_id,))
            .fetchone()
        )
        return row


def get_project_summary(project_id: int):
    """Same projection as list_projects, for one project (API response shape)."""
    with _lock:
        return (
            conn()
            .execute(
                "SELECT p.id, p.name, p.created_at, p.archived,"
                " (SELECT COUNT(*) FROM designs d WHERE d.project_id=p.id) AS design_count,"
                " (SELECT COUNT(*) FROM visualizations v"
                "   JOIN designs d2 ON d2.id=v.design_id WHERE d2.project_id=p.id) AS visualization_count"
                " FROM projects p WHERE p.id=?",
                (project_id,),
            )
            .fetchone()
        )


def list_projects(include_archived: bool = False):
    with _lock:
        # include_archived is bound as a param, never interpolated into SQL
        return (
            conn()
            .execute(
                "SELECT p.id, p.name, p.created_at, p.archived,"
                " (SELECT COUNT(*) FROM designs d WHERE d.project_id=p.id) AS design_count,"
                " (SELECT COUNT(*) FROM visualizations v"
                "   JOIN designs d2 ON d2.id=v.design_id WHERE d2.project_id=p.id) AS visualization_count"
                " FROM projects p"
                " WHERE p.archived = 0 OR ? = 1"
                " ORDER BY p.archived ASC, p.created_at DESC",
                (1 if include_archived else 0,),
            )
            .fetchall()
        )


def set_project_archived(project_id: int, archived: bool) -> bool:
    """Archive/unarchive a project. Returns False if the id doesn't exist."""
    with _lock:
        cur = conn().execute(
            "UPDATE projects SET archived=? WHERE id=?",
            (1 if archived else 0, project_id),
        )
        conn().commit()
        return cur.rowcount > 0


def delete_project(project_id: int):
    """Delete a project (cascades to designs/vizes/revisions). Returns the
    deleted row, or None if missing. Design image files are NOT removed here
    — main.py collects them first and unlinks them after the commit."""
    with _lock:
        row = (
            conn()
            .execute("SELECT image_path FROM designs WHERE project_id=?", (project_id,))
            .fetchall()
        )
        conn().execute("DELETE FROM projects WHERE id=?", (project_id,))
        conn().commit()
        return row


# ----------------------------------------------------------------- designs


def create_design(project_id: int, name: str, image_path: str) -> int:
    with _lock:
        cur = conn().execute(
            "INSERT INTO designs(project_id, name, image_path) VALUES (?,?,?)",
            (project_id, name, image_path),
        )
        conn().commit()
        assert cur.lastrowid is not None  # INSERT always sets lastrowid
        return cur.lastrowid


def get_design(design_id: int):
    with _lock:
        row = (
            conn().execute("SELECT * FROM designs WHERE id=?", (design_id,)).fetchone()
        )
        return row


def list_designs(project_id: int):
    with _lock:
        return (
            conn()
            .execute(
                "SELECT * FROM designs WHERE project_id=? ORDER BY archived ASC, created_at",
                (project_id,),
            )
            .fetchall()
        )


def set_design_archived(design_id: int, archived: bool) -> bool:
    """Archive/unarchive a design. Returns False if the id doesn't exist."""
    with _lock:
        cur = conn().execute(
            "UPDATE designs SET archived=? WHERE id=?",
            (1 if archived else 0, design_id),
        )
        conn().commit()
        return cur.rowcount > 0


def delete_design(design_id: int):
    """Delete a design (cascades to vizes/revisions). Returns the deleted row
    (so the caller can unlink its image file), or None if missing."""
    with _lock:
        row = (
            conn().execute("SELECT * FROM designs WHERE id=?", (design_id,)).fetchone()
        )
        if row:
            conn().execute("DELETE FROM designs WHERE id=?", (design_id,))
            conn().commit()
        return row


# ------------------------------------------------------------ visualizations


def create_visualization(design_id: int, name: str, settings: str) -> int:
    with _lock:
        cur = conn().execute(
            "INSERT INTO visualizations(design_id, name, settings) VALUES (?,?,?)",
            (design_id, name, settings),
        )
        conn().commit()
        assert cur.lastrowid is not None  # INSERT always sets lastrowid
        return cur.lastrowid


def get_visualization(viz_id: int):
    with _lock:
        row = (
            conn()
            .execute("SELECT * FROM visualizations WHERE id=?", (viz_id,))
            .fetchone()
        )
        return row


def list_visualizations(design_id: int):
    with _lock:
        return (
            conn()
            .execute(
                "SELECT * FROM visualizations WHERE design_id=? ORDER BY created_at",
                (design_id,),
            )
            .fetchall()
        )


def set_current_revision(viz_id: int, revision_id: int):
    with _lock:
        conn().execute(
            "UPDATE visualizations SET current_revision_id=? WHERE id=?",
            (revision_id, viz_id),
        )
        conn().commit()


# ---------------------------------------------------------------- revisions


def create_revision(
    visualization_id,
    parent_revision_id,
    label,
    prompt,
    negative_prompt,
    model,
    params,
    image_path,
) -> int:
    with _lock:
        cur = conn().execute(
            "INSERT INTO revisions(visualization_id, parent_revision_id, label,"
            " prompt, negative_prompt, model, params, image_path)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (
                visualization_id,
                parent_revision_id,
                label,
                prompt,
                negative_prompt,
                model,
                params,
                image_path,
            ),
        )
        conn().commit()
        assert cur.lastrowid is not None  # INSERT always sets lastrowid
        return cur.lastrowid


def get_revision(revision_id: int):
    with _lock:
        row = (
            conn()
            .execute("SELECT * FROM revisions WHERE id=?", (revision_id,))
            .fetchone()
        )
        return row


def list_revisions(visualization_id: int):
    with _lock:
        return (
            conn()
            .execute(
                "SELECT * FROM revisions WHERE visualization_id=?"
                " ORDER BY created_at ASC, id ASC",
                (visualization_id,),
            )
            .fetchall()
        )


def last_revision(visualization_id: int):
    with _lock:
        row = (
            conn()
            .execute(
                "SELECT * FROM revisions WHERE visualization_id=?"
                " ORDER BY created_at DESC, id DESC LIMIT 1",
                (visualization_id,),
            )
            .fetchone()
        )
        return row


def delete_revision(revision_id: int):
    with _lock:
        row = (
            conn()
            .execute("SELECT * FROM revisions WHERE id=?", (revision_id,))
            .fetchone()
        )
        if row:
            conn().execute("DELETE FROM revisions WHERE id=?", (revision_id,))
            conn().commit()
        return row


# -------------------------------------------------------------------- jobs


def create_job(model: str, prompt: str, params: str, revision_id) -> int:
    with _lock:
        cur = conn().execute(
            "INSERT INTO jobs(status, model, prompt, params, revision_id)"
            " VALUES ('queued',?,?,?,?)",
            (model, prompt, params, revision_id),
        )
        conn().commit()
        assert cur.lastrowid is not None  # INSERT always sets lastrowid
        return cur.lastrowid


def get_job(job_id: int):
    with _lock:
        row = conn().execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        return row


def set_job_running(job_id: int):
    with _lock:
        conn().execute("UPDATE jobs SET status='running' WHERE id=?", (job_id,))
        conn().commit()


def set_job_done(job_id: int, image_path: str, revision_id):
    with _lock:
        conn().execute(
            "UPDATE jobs SET status='done', image_path=?, revision_id=?,"
            " completed_at=datetime('now') WHERE id=?",
            (image_path, revision_id, job_id),
        )
        conn().commit()


def set_job_failed(job_id: int, error: str):
    with _lock:
        conn().execute(
            "UPDATE jobs SET status='failed', error=?, completed_at=datetime('now')"
            " WHERE id=?",
            (error, job_id),
        )
        conn().commit()


def new_image_path(ext: str = "png"):
    return f"{uuid.uuid4().hex}.{ext}"
