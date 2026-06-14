"""Tests — abonnement .ics personnel (lecture seule)."""
from uuid import uuid4
from app import models


def _unfold(ics: str) -> str:
    return ics.replace("\r\n ", "")  # déplie les lignes continuées (RFC 5545)


def parse_ics(text: str):
    """Re-parse minimal + assertions de bonne formation. Retourne les blocs VEVENT (listes de lignes)."""
    assert text.startswith("BEGIN:VCALENDAR\r\n")
    assert text.rstrip("\r\n").endswith("END:VCALENDAR")
    unfolded = _unfold(text)
    lines = [l for l in unfolded.split("\r\n") if l]
    assert "VERSION:2.0" in lines
    # VTIMEZONE Europe/Brussels avec règles DST
    assert "TZID:Europe/Brussels" in lines
    assert "BEGIN:DAYLIGHT" in lines and "BEGIN:STANDARD" in lines
    assert any(l.startswith("RRULE:") for l in lines)
    # blocs VEVENT équilibrés + propriétés requises
    assert lines.count("BEGIN:VEVENT") == lines.count("END:VEVENT")
    blocks, cur = [], None
    for l in lines:
        if l == "BEGIN:VEVENT":
            cur = []
        elif l == "END:VEVENT":
            blocks.append(cur); cur = None
        elif cur is not None:
            cur.append(l)
    for b in blocks:
        keys = [x.split(":", 1)[0].split(";", 1)[0] for x in b]
        assert "UID" in keys and "DTSTAMP" in keys and "SUMMARY" in keys
        assert any(x.startswith("DTSTART;TZID=Europe/Brussels:") for x in b)
        assert any(x.startswith("DTEND;TZID=Europe/Brussels:") for x in b)
    return blocks


def _token(client):
    r = client.get("/calendar/subscription")
    assert r.status_code == 200
    url = r.json()["url"]
    assert "/calendar/" in url and url.endswith(".ics")
    return url.rsplit("/calendar/", 1)[1][:-4]  # retire ".ics"


def test_ics_wellformed_tz_and_no_notes(client, db_session):
    # event du user courant, avec notes confidentielles
    client.post("/events", json={
        "title": "Visite chantier", "start": "2026-07-01T09:30",
        "duration_min": 45, "location": "Bruxelles", "notes": "SECRET-NOTE-CONFIDENTIELLE",
    })
    # event d'un AUTRE user (ne doit pas apparaître) — user committé AVANT l'event (FK)
    other = f"other-{uuid4().hex[:8]}"
    db_session.add(models.User(id=other, full_name="A", email=f"{other}@t.internal", hashed_password="x"))
    db_session.commit()
    db_session.add(models.Event(id=f"ev-{uuid4().hex[:8]}", owner_id=other,
                                title="EVENT-AUTRUI", start="2026-07-02T10:00"))
    db_session.commit()

    token = _token(client)
    res = client.get(f"/calendar/{token}.ics")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/calendar")
    text = res.text

    blocks = parse_ics(text)
    assert len(blocks) >= 1                            # au moins l'event du user (DB partagée entre tests)
    assert "SECRET-NOTE-CONFIDENTIELLE" not in text   # notes jamais exportées
    assert "EVENT-AUTRUI" not in text                 # filtre owner : event d'un autre exclu
    assert "Visite chantier" in text


def test_ics_invalid_token_404(client):
    assert client.get("/calendar/zzz-invalide.ics").status_code == 404


def test_regenerate_revokes_old_token(client):
    old = _token(client)
    r = client.post("/calendar/subscription/regenerate")
    assert r.status_code == 200
    new = r.json()["url"].rsplit("/calendar/", 1)[1][:-4]
    assert new != old
    assert client.get(f"/calendar/{old}.ics").status_code == 404   # ancien lien révoqué
    assert client.get(f"/calendar/{new}.ics").status_code == 200
