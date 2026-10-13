"""The content library: talking points, objection rules, compliance rules and
the compliance rewrite wording.

Read from the REF_ tables through the warehouse (Databricks, or the local
DuckDB loaded from the seeder's CSVs). The backend OWNS the source JSON in
databricks/seed/content/, and the seeder copies it unchanged; if the REF_
tables are empty (the seeder has not run yet), the JSON files are read
directly, so a fresh checkout and the pure-logic tests still work.

Cached in-process per brand like the bronze data: content changes only on a re-seed.
Every read filters on BRAND_CODE; JSON rows without BRAND_CODE belong to the
default brand (the JSON files are the POVO content).
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from dataclasses import dataclass
from typing import Optional

from core.config import get_settings
from database.tables import bronze
from database.warehouse import get_warehouse

logger = logging.getLogger("povo.content")

FILES = {"REF_TALKING_POINT": "talking_points.json", "REF_OBJECTION_RULE": "objection_rules.json",
         "REF_COMPLIANCE_RULE": "compliance_rules.json", "REF_COMPLIANCE_TEXT": "compliance_texts.json"}


@dataclass
class ComplianceTexts:
    """REF_COMPLIANCE_TEXT, by kind. Every word of the rewrite comes from here."""
    #: category -> fallback template ({who} = participant); placeholders only, never claim text.
    templates: dict[str, str]
    #: rule id -> the approved line that replaces a clause that rule flagged.
    replacements: dict[str, str]
    #: (regex, replacement) applied to the rep's words before cleaning.
    rewords: list[tuple[str, str]]
    #: why / fix / placeholder for a note cut off mid-sentence.
    cut_off: dict[str, str]


@dataclass
class Library:
    points: dict[str, dict]
    objection_rules: list[dict]
    compliance_rules: list[dict]
    compliance_texts: ComplianceTexts
    content_version: str
    source: str

    def point(self, point_id: str) -> Optional[dict]:
        return self.points.get(point_id)


_lock = threading.Lock()
_cache: dict[str, tuple[float, Library]] = {}


def _is_active(row: dict) -> bool:
    v = row.get("IS_ACTIVE")
    return v is None or v is True or str(v).lower() in ("true", "1", "t", "yes")


def _from_json(table: str) -> list[dict]:
    path = os.path.join(get_settings().content_dir, FILES[table])
    if not os.path.isfile(path):  # e.g. only backend/ deployed with DATA_SOURCE=none: no content yet
        logger.warning("No content file %s; %s is empty", path, table)
        return []
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _read(table: str, brand_code: str) -> tuple[list[dict], str]:
    try:
        rows = get_warehouse().query(f"SELECT * FROM {bronze(table)} WHERE BRAND_CODE = :b", {"b": brand_code})
    except Exception:  # noqa: BLE001 - a missing table falls back to the JSON the backend owns
        logger.warning("Could not read %s from the warehouse; using the content JSON", table, exc_info=True)
        rows = []
    if rows:
        return rows, "warehouse"
    default = get_settings().default_brand_code
    return [r for r in _from_json(table) if (r.get("BRAND_CODE") or default) == brand_code], "json"


def get_library(brand_code: Optional[str] = None) -> Library:
    brand_code = brand_code or get_settings().default_brand_code
    hit = _cache.get(brand_code)
    if hit is not None and time.time() - hit[0] < get_settings().bronze_cache_seconds:
        return hit[1]
    tp, src1 = _read("REF_TALKING_POINT", brand_code)
    obj, _ = _read("REF_OBJECTION_RULE", brand_code)
    comp, _ = _read("REF_COMPLIANCE_RULE", brand_code)
    texts = sorted((r for r in _read("REF_COMPLIANCE_TEXT", brand_code)[0] if _is_active(r)),
                   key=lambda r: int(r.get("SORT_ORDER") or 0))
    by_kind: dict[str, list[dict]] = {}
    for r in texts:
        by_kind.setdefault(str(r.get("KIND") or ""), []).append(r)
    ctexts = ComplianceTexts(
        templates={r["TEXT_KEY"]: r["TEXT_TEMPLATE"] for r in by_kind.get("template", [])},
        replacements={r["TEXT_KEY"]: r["TEXT_TEMPLATE"] for r in by_kind.get("replacement", [])},
        rewords=[(r["PATTERN"], r["TEXT_TEMPLATE"]) for r in by_kind.get("reword", []) if r.get("PATTERN")],
        cut_off={r["TEXT_KEY"]: r["TEXT_TEMPLATE"] for r in by_kind.get("cut_off", [])})
    points = {r["POINT_ID"]: r for r in tp if _is_active(r)}
    versions = sorted({str(r.get("CONTENT_VERSION") or "") for r in points.values()} - {""})
    lib = Library(points=points,
                  objection_rules=sorted(obj, key=lambda r: int(r.get("PRIORITY") or 0)),
                  compliance_rules=sorted([r for r in comp if _is_active(r)],
                                          key=lambda r: int(r.get("SORT_ORDER") or 0)),
                  compliance_texts=ctexts,
                  content_version=versions[-1] if versions else "2026.1", source=src1)
    with _lock:
        _cache[brand_code] = (time.time(), lib)
    return lib


def clear_library_cache() -> None:
    with _lock:
        _cache.clear()
