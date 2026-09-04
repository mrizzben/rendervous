"""Project summary shape sanity: run `.venv/bin/python -m server.test_projects`.

Covers the create-project API contract: POST /api/projects must return the
full ProjectSummary projection (archived, design_count, visualization_count),
matching GET /api/projects. Regression: the endpoint used to return only
{id, name, created_at}, leaving those fields undefined in the UI.

Calls the route functions directly (FastAPI decorators return the wrapped
function), so no HTTP client is needed.
"""

from server.main import ProjectCreate, create_project, list_projects

# --- create returns the full summary shape -----------------------------------
created = create_project(ProjectCreate(name="Villa Merapi"))
for key in (
    "id",
    "name",
    "created_at",
    "archived",
    "design_count",
    "visualization_count",
):
    assert key in created, f"missing {key}: {created}"

# --- shape matches what the list endpoint returns ----------------------------
listing = list_projects()
match = [p for p in listing if p["id"] == created["id"]]
assert len(match) == 1
assert set(match[0]) == set(created), (set(match[0]), set(created))

# --- blank name falls back to "Untitled Project" ------------------------------
blank = create_project(ProjectCreate(name="   "))
assert blank["name"] == "Untitled Project", blank

print("project summary ok")
