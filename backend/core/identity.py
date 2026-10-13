"""Resolve who is calling from the trusted Posit-provided header.

Sign-in is Okta SSO, handled upstream by Posit Connect on the VM: the app has
no login page and never issues or verifies tokens. After Okta signs the user
in, Posit injects `RStudio-Connect-Credentials` on every request, either as
JSON `{"user": "<username>", "email": "...", "groups": [...]}` or as a plain
username/email (e.g. p250048@incyte.com). This module only parses it;
helpers/directory.py checks the value against the employee master
(Trinity DIM_EMPLOYEE, then DIM_SALES_FORCE_CURR for the territory).

The browser is never trusted to say who the user is: no email, id or token it
sends is read for identity.

The header must never be honoured from a direct client connection in
production: deploy the API behind the Posit proxy only.
"""
import json
from typing import Optional

from fastapi import Request

from core.config import get_settings


def resolve_upstream_identity(request: Request) -> Optional[str]:
    """The caller's username or email, or None when nobody is identified.

    Outside production a missing header falls back to DEV_FALLBACK_USERNAME, so
    the API is usable on a laptop without the Posit proxy. In production there
    is no fallback: no header means no identity.
    """
    settings = get_settings()
    raw = (request.headers.get(settings.posit_identity_header) or "").strip()
    if raw:
        try:
            payload = json.loads(raw)
        except ValueError:
            payload = None
        if isinstance(payload, dict):
            for key in ("user", "username", "email"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            return None
        if isinstance(payload, str) and payload.strip():
            return payload.strip()
        return raw
    if settings.environment != "production" and settings.dev_fallback_username:
        return settings.dev_fallback_username
    return None


def identity_via(request: Request) -> str:
    """How the identity was established, for the access log: okta-header or dev-fallback."""
    return "okta-header" if request.headers.get(get_settings().posit_identity_header) else "dev-fallback"
