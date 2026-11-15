"""The invite-only pilot (CLAUDE.md section 11, Phase B): invites, admin, elders, consent,
share links, sessions and devices, export, delete account, demo removal."""

import io
import json
import zipfile
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import config
from app.services import ratelimit
from app.models import (
    CareLink,
    Consent,
    ConsentKind,
    FamilyMember,
    InviteRequest,
    SpeechSample,
    StoredFile,
    User,
)
from tests.conftest import Clock, Register, bearer

ADMIN = "admin@khayal.example"
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 64


@pytest.fixture(autouse=True)
def admins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "ADMIN_EMAILS", frozenset({ADMIN}))
    monkeypatch.setattr(config, "STORAGE_BACKEND", "db")


def sign_up(client: TestClient, email: str, token: str | None = None, password: str = "a-long-password") -> Any:
    body: dict[str, Any] = {"name": email.split("@")[0].title(), "email": email, "password": password, "consent": True}
    if token:
        body["invite_token"] = token
    return client.post("/api/auth/register", json=body)


def admin_headers(client: TestClient) -> dict[str, str]:
    response = sign_up(client, ADMIN)
    assert response.status_code == 201, response.text
    assert response.json()["user"]["is_admin"] is True
    return bearer(response.json())


def invited(client: TestClient, admin: dict[str, str], email: str) -> dict[str, str]:
    token = client.post("/api/admin/invites", json={"note": email}, headers=admin).json()["token"]
    response = sign_up(client, email, token)
    assert response.status_code == 201, response.text
    return bearer(response.json())


def add_elder(client: TestClient, care: dict[str, str], name: str = "Kamala Devi", **extra: Any) -> dict[str, Any]:
    body = {"name": name, "city": "Pune", "is_family_or_guardian": True, "basis": "elder_agreed", **extra}
    response = client.post("/api/patients", json=body, headers=care)
    assert response.status_code == 201, response.text
    return dict(response.json())


def png() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (300, 300), (20, 120, 120)).save(out, format="PNG")
    return out.getvalue()


def count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


# --- sign-up is invite-only ----------------------------------------------------------------


def test_sign_up_needs_an_invite_except_for_admins(client: TestClient, db: Session) -> None:
    refused = sign_up(client, "someone@example.com")
    assert refused.status_code == 403 and "invite-only" in refused.json()["detail"]
    assert sign_up(client, "someone@example.com", "x" * 43).status_code == 403
    admin_headers(client)
    consent = db.scalars(select(Consent)).one()
    assert consent.kind == ConsentKind.processing and consent.policy_version == config.POLICY_VERSION


def test_sign_up_rules(client: TestClient) -> None:
    admin = admin_headers(client)
    token = client.post("/api/admin/invites", json={"note": "Anita"}, headers=admin).json()["token"]
    base = {"name": "Anita", "email": "anita@example.com", "invite_token": token}
    assert client.post("/api/auth/register", json={**base, "password": "only-nine", "consent": True}).status_code == 422
    assert client.post("/api/auth/register", json={**base, "password": "a-long-password", "consent": False}).status_code == 422
    assert client.post("/api/auth/register", json={**base, "password": "a-long-password"}).status_code == 422
    assert sign_up(client, ADMIN, token).status_code == 409  # email taken, link not used up
    ratelimit.clear_all()  # five tries an hour per address; this test made six
    assert sign_up(client, "anita@example.com", token).status_code == 201


def test_approved_request_gives_a_single_use_link(client: TestClient, db: Session, clock: Clock) -> None:
    client.post("/api/invites", json={"name": "Anita", "email": "anita@example.com", "role": "family", "city": "Pune", "consent": True})
    admin = admin_headers(client)
    requests = client.get("/api/admin/invite-requests", headers=admin).json()
    assert [r["status"] for r in requests] == ["new"]
    link = client.post(f"/api/admin/invite-requests/{requests[0]['id']}/approve", headers=admin).json()
    assert client.get("/api/admin/invite-requests", headers=admin).json()[0]["status"] == "invited"

    check = client.get(f"/api/auth/invite/{link['token']}")
    assert check.status_code == 200 and check.json()["kind"] == "signup"
    assert sign_up(client, "anita@example.com", link["token"]).status_code == 201
    assert sign_up(client, "second@example.com", link["token"]).status_code == 403  # single use
    assert client.get(f"/api/auth/invite/{link['token']}").status_code == 404
    invites = client.get("/api/admin/invites", headers=admin).json()
    assert invites[0]["state"] == "used" and invites[0]["used_by_email"] == "anita@example.com"


def test_invites_expire_and_can_be_revoked(client: TestClient, clock: Clock) -> None:
    admin = admin_headers(client)
    old = client.post("/api/admin/invites", json={"note": "Late"}, headers=admin).json()
    revoked = client.post("/api/admin/invites", json={"note": "Revoked"}, headers=admin).json()
    assert client.post(f"/api/admin/invites/{revoked['id']}/revoke", headers=admin).status_code == 204
    assert sign_up(client, "r@example.com", revoked["token"]).status_code == 403
    clock.now = clock.now + timedelta(days=config.INVITE_DAYS, minutes=1)
    assert sign_up(client, "late@example.com", old["token"]).status_code == 403
    states = {i["note"]: i["state"] for i in client.get("/api/admin/invites", headers=admin).json()}
    assert states == {"Late": "expired", "Revoked": "revoked"}


def test_reject_and_admin_only(client: TestClient) -> None:
    client.post("/api/invites", json={"name": "Spam", "email": "s@example.com", "role": "doctor", "city": "X", "consent": True})
    admin = admin_headers(client)
    member = invited(client, admin, "member@example.com")
    for path in ("/api/admin/invite-requests", "/api/admin/invites", "/api/admin/users", "/api/admin/demo-accounts"):
        assert client.get(path, headers=member).status_code == 403
    request_id = client.get("/api/admin/invite-requests", headers=admin).json()[0]["id"]
    assert client.post(f"/api/admin/invite-requests/{request_id}/reject", headers=admin).status_code == 204
    assert client.get("/api/admin/invite-requests", headers=admin).json()[0]["status"] == "declined"
    users = client.get("/api/admin/users", headers=admin).json()
    assert sorted(u["email"] for u in users) == [ADMIN, "member@example.com"]


# --- elders, consent -----------------------------------------------------------------------


def test_adding_an_elder_needs_no_email_and_records_consent(client: TestClient, db: Session) -> None:
    care = invited(client, admin_headers(client), "priya@example.com")
    bad = {"name": "Kamala", "is_family_or_guardian": False, "basis": "elder_agreed"}
    assert client.post("/api/patients", json=bad, headers=care).status_code == 422
    assert client.post("/api/patients", json={**bad, "is_family_or_guardian": True, "basis": "maybe"}).status_code in (401, 422)

    elder = add_elder(client, care, photos=True, voice=False)
    assert "email" not in elder and elder["photos_enabled"] is True and elder["voice_task_enabled"] is False
    assert [p["name"] for p in client.get("/api/patients", headers=care).json()] == ["Kamala Devi"]
    kinds = {(c["kind"], c["basis"]) for c in client.get(f"/api/patients/{elder['id']}/consents", headers=care).json()}
    assert kinds == {("elder_on_behalf", "elder_agreed"), ("photos", None)}
    row = db.get(User, elder["id"])
    assert row is not None and row.email is None and row.password_hash is None


def test_withdrawing_photos_or_voice_deletes_that_data(client: TestClient, db: Session) -> None:
    care = invited(client, admin_headers(client), "priya@example.com")
    elder = add_elder(client, care, photos=True, voice=True)
    pid = elder["id"]
    assert client.post(f"/api/patients/{pid}/photo", content=png(), headers={**care, "Content-Type": "image/png"}).status_code == 200
    member = client.post(f"/api/patients/{pid}/family", json={"name": "Rahul", "relation": "Grandson"}, headers=care).json()
    client.post(f"/api/patients/{pid}/family/{member['id']}/photos", content=png(), headers={**care, "Content-Type": "image/png"})
    code = client.post(f"/api/patients/{pid}/pairing-code", headers=care).json()["code"]
    device = bearer(client.post("/api/auth/pair", json={"code": code}).json())
    assert client.post("/api/speech?duration_ms=4000", content=WEBM, headers={**device, "Content-Type": "audio/webm"}).status_code == 201
    assert count(db, StoredFile) == 3

    photos_off = client.post(f"/api/patients/{pid}/consents", json={"kind": "photos", "granted": False}, headers=care)
    assert photos_off.status_code == 200 and photos_off.json()["deleted"] == 2
    assert photos_off.json()["patient"]["photos_enabled"] is False and photos_off.json()["patient"]["has_photo"] is False
    db.expire_all()
    assert db.scalars(select(FamilyMember)).one().photo_paths == []  # the person stays, the photos go
    upload = client.post(f"/api/patients/{pid}/family/{member['id']}/photos", content=png(), headers={**care, "Content-Type": "image/png"})
    assert upload.status_code == 403

    voice_off = client.post(f"/api/patients/{pid}/consents", json={"kind": "voice", "granted": False}, headers=care)
    assert voice_off.json()["deleted"] == 1 and count(db, SpeechSample) == 0 and count(db, StoredFile) == 0
    withdrawn = {c["kind"]: c["withdrawn_at"] for c in client.get(f"/api/patients/{pid}/consents", headers=care).json()}
    assert withdrawn["photos"] is not None and withdrawn["voice"] is not None and withdrawn["elder_on_behalf"] is None


def test_elder_photo_needs_the_photos_opt_in(client: TestClient) -> None:
    care = invited(client, admin_headers(client), "priya@example.com")
    elder = add_elder(client, care)
    upload = client.post(f"/api/patients/{elder['id']}/photo", content=png(), headers={**care, "Content-Type": "image/png"})
    assert upload.status_code == 403


# --- family share links --------------------------------------------------------------------


def test_share_link_lets_a_second_family_member_join(client: TestClient) -> None:
    admin = admin_headers(client)
    priya = invited(client, admin, "priya@example.com")
    elder = add_elder(client, priya)
    link = client.post(f"/api/patients/{elder['id']}/shares", headers=priya).json()
    check = client.get(f"/api/auth/invite/{link['token']}").json()
    assert (check["kind"], check["elder_name"]) == ("share", "Kamala")
    # Someone without an account can create one with it, and joins the elder.
    rahul = sign_up(client, "rahul@example.com", link["token"])
    assert rahul.status_code == 201
    assert [p["id"] for p in client.get("/api/patients", headers=bearer(rahul.json())).json()] == [elder["id"]]
    assert client.get(f"/api/patients/{elder['id']}/shares", headers=priya).json()[0]["state"] == "used"

    # A signed-in family member accepts a fresh link; links are single use and revocable.
    meera = invited(client, admin, "meera@example.com")
    second = client.post(f"/api/patients/{elder['id']}/shares", headers=priya).json()
    assert client.post("/api/shares/accept", json={"token": second["token"]}, headers=meera).status_code == 200
    assert client.post("/api/shares/accept", json={"token": second["token"]}, headers=meera).status_code == 404
    third = client.post(f"/api/patients/{elder['id']}/shares", headers=priya).json()
    assert client.post(f"/api/patients/{elder['id']}/shares/{third['id']}/revoke", headers=priya).status_code == 204
    assert sign_up(client, "late@example.com", third["token"]).status_code == 403


# --- sessions, passwords, devices ----------------------------------------------------------


def test_changing_the_password_signs_out_other_sessions(client: TestClient) -> None:
    admin = admin_headers(client)
    priya = invited(client, admin, "priya@example.com")
    laptop = bearer(client.post("/api/auth/login", json={"email": "priya@example.com", "password": "a-long-password"}).json())
    wrong = client.post("/api/auth/password", json={"current_password": "nope-nope-nope", "new_password": "another-long-one"}, headers=priya)
    assert wrong.status_code == 403
    assert client.post("/api/auth/password", json={"current_password": "a-long-password", "new_password": "short"}, headers=priya).status_code == 422
    changed = client.post("/api/auth/password", json={"current_password": "a-long-password", "new_password": "another-long-one"}, headers=priya)
    assert changed.status_code == 200
    assert client.get("/api/auth/me", headers=laptop).status_code == 401
    assert client.get("/api/auth/me", headers=priya).status_code == 401
    assert client.get("/api/auth/me", headers=bearer(changed.json())).status_code == 200


def test_admin_reset_link(client: TestClient, clock: Clock) -> None:
    admin = admin_headers(client)
    priya = invited(client, admin, "priya@example.com")
    priya_id = client.get("/api/auth/me", headers=priya).json()["id"]
    link = client.post(f"/api/admin/users/{priya_id}/reset-link", headers=admin).json()
    reset = client.post("/api/auth/reset", json={"token": link["token"], "new_password": "brand-new-password"})
    assert reset.status_code == 200 and reset.json()["user"]["email"] == "priya@example.com"
    assert client.get("/api/auth/me", headers=priya).status_code == 401  # old session gone
    assert client.post("/api/auth/reset", json={"token": link["token"], "new_password": "again-and-again"}).status_code == 404
    ok = client.post("/api/auth/login", json={"email": "priya@example.com", "password": "brand-new-password"})
    assert ok.status_code == 200

    elder = add_elder(client, bearer(ok.json()))
    assert client.post(f"/api/admin/users/{elder['id']}/reset-link", headers=admin).status_code == 400
    late = client.post(f"/api/admin/users/{priya_id}/reset-link", headers=admin).json()
    clock.now = clock.now + timedelta(hours=config.RESET_HOURS, minutes=1)
    assert client.post("/api/auth/reset", json={"token": late["token"], "new_password": "too-late-password"}).status_code == 404


def test_paired_devices_are_listed_and_revocable(client: TestClient) -> None:
    care = invited(client, admin_headers(client), "priya@example.com")
    elder = add_elder(client, care)
    pid = elder["id"]

    def pair(agent: str) -> dict[str, str]:
        code = client.post(f"/api/patients/{pid}/pairing-code", headers=care).json()["code"]
        return bearer(client.post("/api/auth/pair", json={"code": code}, headers={"User-Agent": agent}).json())

    phone = pair("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36")
    tablet = pair("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1")
    listed = client.get(f"/api/patients/{pid}/devices", headers=care).json()
    assert sorted(d["device_label"] for d in listed) == ["Android phone · Chrome", "iPad · Safari"]

    phone_id = next(d["id"] for d in listed if d["device_label"].startswith("Android"))
    assert client.post(f"/api/patients/{pid}/devices/{phone_id}/revoke", headers=care).status_code == 204
    assert client.get("/api/auth/me", headers=phone).status_code == 401
    assert client.get("/api/auth/me", headers=tablet).status_code == 200
    assert client.post(f"/api/patients/{pid}/devices/sign-out-all", headers=care).status_code == 204
    assert client.get("/api/auth/me", headers=tablet).status_code == 401
    assert client.get(f"/api/patients/{pid}/devices", headers=care).json() == []


# --- export and delete ---------------------------------------------------------------------


def test_export_my_data(client: TestClient) -> None:
    care = invited(client, admin_headers(client), "priya@example.com")
    elder = add_elder(client, care, photos=True)
    client.post(f"/api/patients/{elder['id']}/photo", content=png(), headers={**care, "Content-Type": "image/png"})
    response = client.get("/api/me/export", headers=care)
    assert response.status_code == 200 and response.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(response.content))
    data = json.loads(z.read("khayal-data.json"))
    assert data["account"]["email"] == "priya@example.com" and "password_hash" not in data["account"]
    assert [c["kind"] for c in data["consents_given"]] == ["processing", "elder_on_behalf", "photos"]
    assert data["elders"][0]["elder"]["name"] == "Kamala Devi"
    assert f"elders/{elder['id']}/elder-photo.jpg" in z.namelist()


def test_delete_my_account_keeps_elders_someone_else_looks_after(client: TestClient, db: Session) -> None:
    admin = admin_headers(client)
    priya = invited(client, admin, "priya@example.com")
    alone = add_elder(client, priya, "Shanti Iyer", photos=True)
    shared = add_elder(client, priya, "Kamala Devi")
    client.post(f"/api/patients/{alone['id']}/photo", content=png(), headers={**priya, "Content-Type": "image/png"})
    token = client.post(f"/api/patients/{shared['id']}/shares", headers=priya).json()["token"]
    rahul = bearer(sign_up(client, "rahul@example.com", token).json())

    assert client.post("/api/me/delete", json={"confirm": "delete", "password": "a-long-password"}, headers=priya).status_code == 422
    assert client.post("/api/me/delete", json={"confirm": "DELETE", "password": "wrong-password"}, headers=priya).status_code == 403
    done = client.post("/api/me/delete", json={"confirm": "DELETE", "password": "a-long-password"}, headers=priya)
    assert done.status_code == 200 and done.json() == {"removed": 2}  # Priya and Shanti

    db.expire_all()
    names = sorted(u.name for u in db.scalars(select(User)))
    assert names == ["Admin", "Kamala Devi", "Rahul"]
    assert count(db, StoredFile) == 0
    assert db.scalars(select(CareLink)).one().caregiver_id == client.get("/api/auth/me", headers=rahul).json()["id"]
    assert client.get("/api/auth/me", headers=priya).status_code == 401


# --- demo mode off -------------------------------------------------------------------------


def test_demo_accounts_do_not_expire_with_demo_mode_off_and_admin_removes_them(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config, "DEMO_MODE", True)
    assert client.post("/api/demo/start").status_code == 201  # 1 caregiver + 3 elders
    monkeypatch.setattr(config, "DEMO_MODE", False)
    assert client.post("/api/demo/start").status_code == 404
    assert client.get("/api/config").json()["demo_mode"] is False

    from app.services import accounts
    from app.services.clock import utc_now

    assert accounts.delete_expired(db, utc_now() + timedelta(days=30)) == 0  # nothing expires on its own
    admin = admin_headers(client)
    assert client.get("/api/admin/demo-accounts", headers=admin).json() == {"count": 4}
    assert client.post("/api/admin/demo-accounts/remove", json={"confirm_count": 3}, headers=admin).status_code == 409
    removed = client.post("/api/admin/demo-accounts/remove", json={"confirm_count": 4}, headers=admin)
    assert removed.json() == {"removed": 4}
    db.expire_all()
    assert [u.email for u in db.scalars(select(User))] == [ADMIN]
    assert count(db, InviteRequest) == 0
