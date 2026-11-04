import io
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image

from app.services import family
from tests.conftest import Register, bearer


def image_bytes(fmt: str = "JPEG", size: tuple[int, int] = (1600, 1200), mode: str = "RGB") -> bytes:
    out = io.BytesIO()
    Image.new(mode, size, (200, 100, 50) if mode == "RGB" else (200, 100, 50, 128)).save(out, format=fmt)
    return out.getvalue()


class Setup:
    def __init__(self, client: TestClient, register: Register) -> None:
        self.client = client
        self.cg = bearer(register("Priya", "p@example.com", "caregiver"))
        payload = register("Kamala", "k@example.com", "patient")
        self.patient = bearer(payload)
        self.pid: int = payload["user"]["id"]  # type: ignore[index]
        client.post("/api/patients/link", json={"patient_email": "k@example.com"}, headers=self.cg)
        self.base = f"/api/patients/{self.pid}/family"

    def add(self, name: str = "Rahul", relation: str = "Grandson", note: str | None = "Lives in Pune") -> dict[str, Any]:
        response = self.client.post(self.base, json={"name": name, "relation": relation, "note": note}, headers=self.cg)
        assert response.status_code == 201, response.text
        return dict(response.json())

    def upload(self, member_id: int, data: bytes, content_type: str = "image/jpeg") -> Any:
        return self.client.post(
            f"{self.base}/{member_id}/photos", content=data, headers={**self.cg, "Content-Type": content_type}
        )


def test_caregiver_adds_edits_and_deletes_people(client: TestClient, register: Register) -> None:
    s = Setup(client, register)
    rahul = s.add(name="  Rahul ", note="  ")
    assert (rahul["name"], rahul["relation"], rahul["note"], rahul["photos"]) == ("Rahul", "Grandson", None, [])
    s.add("Meena", "Neighbour", None)  # custom relation

    edited = client.put(
        f"{s.base}/{rahul['id']}", json={"name": "Rahul", "relation": "Grandson", "note": "Visits on Sundays"}, headers=s.cg
    ).json()
    assert edited["note"] == "Visits on Sundays"
    assert [m["name"] for m in client.get(s.base, headers=s.patient).json()] == ["Rahul", "Meena"]

    assert client.delete(f"{s.base}/{rahul['id']}", headers=s.cg).status_code == 204
    assert [m["name"] for m in client.get(s.base, headers=s.cg).json()] == ["Meena"]


def test_member_validation(client: TestClient, register: Register) -> None:
    s = Setup(client, register)
    for bad in ({"name": "", "relation": "Son"}, {"name": "A", "relation": " "}, {"name": "A", "relation": "x" * 41},
                {"name": "A", "relation": "Son", "note": "n" * 301}):
        assert client.post(s.base, json=bad, headers=s.cg).status_code == 422, bad


def test_upload_resizes_and_serves_privately(client: TestClient, register: Register, upload_dir: Path) -> None:
    s = Setup(client, register)
    member = s.add()
    response = s.upload(member["id"], image_bytes("JPEG", (1600, 1200)))
    assert response.status_code == 201, response.text
    photo = response.json()["photos"][0]
    assert photo["url"] == f"/patients/{s.pid}/family/{member['id']}/photos/{photo['id']}"

    stored = upload_dir / "family" / str(s.pid) / f"{photo['id']}.jpg"
    with Image.open(stored) as img:
        assert img.format == "JPEG"
        assert max(img.size) == 800
        assert img.size == (800, 600)

    url = f"/api{photo['url']}"
    for headers in (s.patient, s.cg):
        got = client.get(url, headers=headers)
        assert got.status_code == 200
        assert got.headers["content-type"] == "image/jpeg"
        assert got.headers["cache-control"] == "private, max-age=86400"
        assert got.content == stored.read_bytes()


def test_photos_need_auth_and_the_care_link(client: TestClient, register: Register) -> None:
    s = Setup(client, register)
    member = s.add()
    photo = s.upload(member["id"], image_bytes()).json()["photos"][0]
    url = f"/api{photo['url']}"
    stranger = bearer(register("Sam", "s@example.com", "caregiver"))
    other_patient = bearer(register("Rahim", "r@example.com", "patient"))

    assert client.get(url).status_code == 401
    assert client.get(url, headers=stranger).status_code == 403
    assert client.get(url, headers=other_patient).status_code == 403
    assert client.get(s.base, headers=stranger).status_code == 403
    assert s.client.post(s.base, json={"name": "X", "relation": "Son"}, headers=s.patient).status_code == 403
    assert client.post(f"{s.base}/{member['id']}/photos", content=image_bytes(),
                       headers={**s.patient, "Content-Type": "image/jpeg"}).status_code == 403


def test_png_with_transparency_becomes_jpeg(client: TestClient, register: Register) -> None:
    s = Setup(client, register)
    member = s.add()
    response = s.upload(member["id"], image_bytes("PNG", (300, 200), "RGBA"), "image/png")
    assert response.status_code == 201
    got = client.get(f"/api{response.json()['photos'][0]['url']}", headers=s.cg)
    with Image.open(io.BytesIO(got.content)) as img:
        assert (img.format, img.mode, img.size) == ("JPEG", "RGB", (300, 200))  # small photos are not enlarged


def test_rejects_bad_uploads(client: TestClient, register: Register) -> None:
    s = Setup(client, register)
    member_id = s.add()["id"]
    assert s.upload(member_id, image_bytes("GIF", (50, 50), "RGB"), "image/gif").status_code == 415
    # Says JPEG, but the bytes are a GIF.
    assert s.upload(member_id, image_bytes("GIF", (50, 50), "RGB"), "image/jpeg").status_code == 422
    assert s.upload(member_id, b"not an image at all", "image/png").status_code == 422
    too_big = b"\xff\xd8" + b"0" * (family.MAX_PHOTO_BYTES + 1)
    assert s.upload(member_id, too_big).status_code == 413
    assert client.get(s.base, headers=s.cg).json()[0]["photos"] == []


def test_at_most_five_photos_per_person(client: TestClient, register: Register) -> None:
    s = Setup(client, register)
    member_id = s.add()["id"]
    for _ in range(5):
        assert s.upload(member_id, image_bytes(size=(100, 100))).status_code == 201
    sixth = s.upload(member_id, image_bytes(size=(100, 100)))
    assert sixth.status_code == 409
    assert "up to 5" in sixth.json()["detail"]


def test_removing_photos_and_people_deletes_files(client: TestClient, register: Register, upload_dir: Path) -> None:
    s = Setup(client, register)
    member_id = s.add()["id"]
    first = s.upload(member_id, image_bytes(size=(100, 100))).json()["photos"][0]["id"]
    second = s.upload(member_id, image_bytes(size=(100, 100))).json()["photos"][1]["id"]
    folder = upload_dir / "family" / str(s.pid)

    after = client.delete(f"{s.base}/{member_id}/photos/{first}", headers=s.cg).json()
    assert [p["id"] for p in after["photos"]] == [second]
    assert not (folder / f"{first}.jpg").exists()
    assert client.get(f"{s.base}/{member_id}/photos/{first}", headers=s.cg).status_code == 404

    client.delete(f"{s.base}/{member_id}", headers=s.cg)
    assert list(folder.iterdir()) == []


def test_photo_ids_cannot_escape_the_folder(client: TestClient, register: Register) -> None:
    s = Setup(client, register)
    member_id = s.add()["id"]
    s.upload(member_id, image_bytes(size=(100, 100)))
    for bad in ("..%2F..%2Fkhayal.db", "abc", "0" * 32):
        assert client.get(f"{s.base}/{member_id}/photos/{bad}", headers=s.cg).status_code == 404
    # An unknown member id is simply not found.
    assert client.get(f"/api/patients/{s.pid}/family/999/photos/{'0' * 32}", headers=s.cg).status_code == 404
