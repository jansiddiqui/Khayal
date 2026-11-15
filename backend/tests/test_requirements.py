"""The root requirements.txt (what hosts install) must match backend/requirements.txt."""

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
_PIN = re.compile(r"^[A-Za-z0-9_.\-]+(\[[A-Za-z0-9_,\-]+\])?==[A-Za-z0-9_.\-]+$")


def requirements(path: Path) -> list[str]:
    """The requirement lines, without comments or blank lines."""
    lines = [line.split("#", 1)[0].strip() for line in path.read_text(encoding="utf-8").splitlines()]
    return [line for line in lines if line]


def test_root_requirements_are_self_contained_and_pinned() -> None:
    root = requirements(REPO / "requirements.txt")
    assert root, "root requirements.txt is empty"
    assert not [line for line in root if line.startswith("-")], "no -r / -c includes: hosts may copy only this file"
    assert [line for line in root if not _PIN.match(line)] == [], "every package pinned with =="


def test_root_requirements_match_backend() -> None:
    root = requirements(REPO / "requirements.txt")
    backend = requirements(REPO / "backend" / "requirements.txt")
    assert sorted(root, key=str.lower) == sorted(backend, key=str.lower)
