"""Single-use secret links (sign-up invites, family share links, password resets).

The token is 32 random bytes, shown once; only its SHA-256 is stored, so a copy of the
database cannot be used to sign up or take over an account.
"""

import hashlib
import secrets


def new_token() -> tuple[str, str]:
    """(token to put in the link, hash to store)."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
