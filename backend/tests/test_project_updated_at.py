"""
Tests P9 - projects.updated_at (dernière activité).

- À la création : updated_at == created_at.
- Après une modif de CONTENU (ajout d'une improvement-action) : updated_at AVANCE
  (valide le touch cross-table via _touch_project).
"""

_PAYLOAD = {
    "project_name": "Projet P9",
    "client_name": "Client P9",
    "client_email": "p9@test.internal",
    "building_address": "1 rue du Test, Bruxelles",
    "building_type": "residential",
    "audit_type": "Complet",
}


def test_create_sets_updated_at_equal_created(client):
    r = client.post("/projects", json=_PAYLOAD)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["created_at"]
    assert data["updated_at"] == data["created_at"]


def test_content_change_advances_updated_at(client):
    created = client.post("/projects", json=_PAYLOAD).json()
    pid = created["id"]
    created_at = created["created_at"]
    assert created["updated_at"] == created_at

    # Modif de contenu : ajout d'une action d'amélioration (table improvement_actions)
    r = client.post(f"/projects/{pid}/improvement-actions", json={"intitule": "Action test P9"})
    assert r.status_code == 201, r.text

    # Le projet doit refléter une dernière activité postérieure à la création
    projects = client.get("/projects").json()
    proj = next(p for p in projects if p["id"] == pid)
    assert proj["updated_at"] is not None
    assert proj["updated_at"] > created_at
