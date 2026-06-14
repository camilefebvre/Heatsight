"""Tests — events par utilisateur (owner scoping)."""
from uuid import uuid4
from app import models


def _other_user(db):
    uid = f"other-{uuid4().hex[:8]}"
    db.add(models.User(id=uid, full_name="Autre", email=f"{uid}@t.internal", hashed_password="x"))
    db.commit()
    return uid


def _insert_event(db, owner_id, title="Event d'autrui"):
    ev = models.Event(id=f"ev-{uuid4().hex[:8]}", owner_id=owner_id, title=title,
                      start="2026-05-01T10:00", duration_min=30)
    db.add(ev)
    db.commit()
    return ev.id


def test_list_scoped_to_owner(client, db_session):
    other = _other_user(db_session)
    other_ev = _insert_event(db_session, other, title="RDV autrui")
    # event créé par l'utilisateur courant via l'API
    r = client.post("/events", json={"title": "Mon RDV", "start": "2026-05-02T09:00"})
    assert r.status_code == 200, r.text
    mine = r.json()["id"]

    ids = [e["id"] for e in client.get("/events").json()]
    assert mine in ids
    assert other_ev not in ids  # l'event d'un autre owner n'apparaît pas


def test_update_other_owner_403(client, db_session):
    other = _other_user(db_session)
    other_ev = _insert_event(db_session, other)
    r = client.patch(f"/events/{other_ev}", json={"title": "hack", "start": "2026-05-01T10:00"})
    assert r.status_code == 403


def test_delete_other_owner_403(client, db_session):
    other = _other_user(db_session)
    other_ev = _insert_event(db_session, other)
    r = client.delete(f"/events/{other_ev}")
    assert r.status_code == 403


def test_update_missing_404(client):
    r = client.patch("/events/does-not-exist", json={"title": "x", "start": "2026-05-01T10:00"})
    assert r.status_code == 404
