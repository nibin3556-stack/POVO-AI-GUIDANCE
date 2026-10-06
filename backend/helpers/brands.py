"""Brands, their enabled features, and the admin users who configure them.

  * CFG_BRAND          - one row per brand (name, active, order).
  * CFG_BRAND_FEATURE  - one row per brand and feature (registry/features.py).
  * ADMIN_USERS_FILE   - JSON {"admins": ["username", ...]}; only these users
                         can change brands or features. Checked against the
                         REAL signed-in user, never the impersonated one.

`sync_brands()` runs at start and before every admin listing: a brand that
appears in DIM_SALES_ASSIGNMENT but not in CFG_BRAND is registered (active,
no features), so a brand loaded by the data pipeline shows up for the admins
to configure. The default brand gets every feature on while it has no
feature rows at all (its first start).

CFG_BRAND is the brand master: every table's BRAND_CODE is a foreign key to it.

Reads are cached for a short time; every write clears the cache.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Optional

from core.config import get_settings
from database.tables import app, bronze, key_id
from database.warehouse import get_warehouse
from helpers.dates import now_utc
from registry import features as F

logger = logging.getLogger("povo.brands")

CACHE_SECONDS = 30
_lock = threading.Lock()
_cache: dict[str, tuple[float, object]] = {}
_admins: tuple[float, frozenset[str]] = (-1.0, frozenset())


def _truthy(v) -> bool:
    return v is True or str(v).lower() in ("true", "1", "t")


def clear_cache() -> None:
    with _lock:
        _cache.clear()


def _cached(key: str, load):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    value = load()
    with _lock:
        _cache[key] = (time.time(), value)
    return value


# --- admins -------------------------------------------------------------------
def admin_usernames() -> frozenset[str]:
    """Usernames in ADMIN_USERS_FILE, lower-cased; re-read when the file changes."""
    global _admins
    path = get_settings().admin_users_file
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        logger.warning("Admin users file not found: %s (nobody can configure features)", path)
        return frozenset()
    if mtime != _admins[0]:
        try:
            with open(path, encoding="utf-8") as fh:
                raw = json.load(fh)
            names = raw.get("admins", []) if isinstance(raw, dict) else raw
            value = frozenset(str(n).strip().lower() for n in names if str(n).strip())
        except (OSError, ValueError, AttributeError):
            logger.exception("Admin users file is not valid JSON: %s", path)
            value = frozenset()
        _admins = (mtime, value)
    return _admins[1]


def is_admin(identity: Optional[str]) -> bool:
    """identity = the Posit username or email of the real signed-in user."""
    if not identity:
        return False
    v = identity.strip().lower()
    admins = admin_usernames()
    return v in admins or ("@" in v and v.split("@", 1)[0] in admins)


# --- brands -------------------------------------------------------------------
def brands(active_only: bool = True) -> list[dict]:
    rows = _cached("brands", lambda: sorted(
        get_warehouse().query(f"SELECT * FROM {app('CFG_BRAND')}"),
        key=lambda r: (r.get("SORT_ORDER") or 0, r["BRAND_CODE"])))
    return [r for r in rows if _truthy(r.get("IS_ACTIVE"))] if active_only else list(rows)


def brand(code: str) -> Optional[dict]:
    return next((b for b in brands(active_only=False) if b["BRAND_CODE"] == code), None)


def is_active_brand(code: Optional[str]) -> bool:
    return bool(code) and any(b["BRAND_CODE"] == code for b in brands())


def enabled_features(code: str) -> set[str]:
    """Features switched on for the brand (parents included, see features.effective)."""
    def load():
        rows = get_warehouse().query(f"SELECT FEATURE_CODE, IS_ENABLED FROM {app('CFG_BRAND_FEATURE')} "
                                     f"WHERE BRAND_CODE = :b", {"b": code})
        return F.effective({r["FEATURE_CODE"] for r in rows if _truthy(r.get("IS_ENABLED"))})
    return set(_cached(f"features:{code}", load))


def has_feature(code: str, feature: str) -> bool:
    return feature in enabled_features(code)


def feature_rows(code: str) -> list[dict]:
    """Every catalog feature with its stored switch for the brand (admin screen)."""
    stored = {r["FEATURE_CODE"]: r for r in get_warehouse().query(
        f"SELECT * FROM {app('CFG_BRAND_FEATURE')} WHERE BRAND_CODE = :b", {"b": code})}
    out = []
    for f in F.FEATURES:
        r = stored.get(f.code, {})
        out.append({"code": f.code, "name": f.name, "description": f.description, "group": f.group,
                    "requires": f.requires, "is_enabled": _truthy(r.get("IS_ENABLED")),
                    "updated_at": r.get("UPDATED_AT"), "updated_by": r.get("UPDATED_BY")})
    return out


def save_brand(code: str, name: str, description: Optional[str], is_active: bool, sort_order: int,
               by: str) -> None:
    get_warehouse().merge("CFG_BRAND", ["BRAND_CODE"], [{
        "BRAND_CODE": code, "BRAND_NAME": name, "DESCRIPTION": description, "IS_ACTIVE": is_active,
        "SORT_ORDER": sort_order, "UPDATED_AT": now_utc(), "UPDATED_BY": by}])
    clear_cache()


def save_features(code: str, switches: dict[str, bool], by: str) -> None:
    now = now_utc()
    get_warehouse().merge("CFG_BRAND_FEATURE", ["BRAND_FEATURE_ID"], [
        {"BRAND_FEATURE_ID": key_id(code, f), "BRAND_CODE": code, "FEATURE_CODE": f, "IS_ENABLED": bool(on), "UPDATED_AT": now, "UPDATED_BY": by}
        for f, on in switches.items()])
    clear_cache()


def sync_brands() -> list[str]:
    """Register brands seen in DIM_SALES_ASSIGNMENT (and the default brand); returns the codes added."""
    wh = get_warehouse()
    known = {r["BRAND_CODE"] for r in wh.query(f"SELECT BRAND_CODE FROM {app('CFG_BRAND')}")}
    seen = {r["BRAND_CODE"] for r in wh.query(f"SELECT DISTINCT BRAND_CODE FROM {bronze('DIM_SALES_ASSIGNMENT')}")
            if r.get("BRAND_CODE")}
    default = get_settings().default_brand_code
    added = []
    for i, code in enumerate(sorted(({default} | seen) - known, key=lambda c: (c != default, c))):
        save_brand(code, code, None, True, len(known) + i + 1, "system")
        added.append(code)
    if not wh.query(f"SELECT 1 AS X FROM {app('CFG_BRAND_FEATURE')} WHERE BRAND_CODE = :b LIMIT 1", {"b": default}):
        save_features(default, {f: True for f in F.ALL_CODES}, "system")
    if added:
        logger.info("Registered brands: %s", ", ".join(added))
    return added
