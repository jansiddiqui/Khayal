import sys
from pathlib import Path

# The backend imports the plain-Python `ml` package from the repo root (CLAUDE.md section 2).
_REPO_ROOT = str(Path(__file__).resolve().parents[2])
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
