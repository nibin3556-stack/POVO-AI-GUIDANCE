"""The POVO Target universe of one territory, as the screens see it.

A target is an HCP with a DIM_CALL_PLAN_TARGET row for the plan year in
deciles 2 to 10 (about 83 per territory). D1 is not part of the POVO target
universe and never appears, even if the plan feed carries D1 rows. Each target carries the contract `Target`
fields plus a few private keys (prefixed `_`) that the metric modules use.

Assessed calls in APP_CALL are overlaid on the bronze rep interactions: once a
rep assesses a call, that date is a rep call for every participant, so the Last
Call column, reach, missed opportunities and the profile all move with it
without waiting for the warehouse feed.

The POC keeps targets in one list sorted by HS volume (highest first, a
physician before an NP/PA on a tie); `ordered()` reproduces that order, which
decides the Must-Wins and every "first in the list" tie-break.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import date
from typing import Optional

from database.tables import app
from database.warehouse import get_warehouse, to_date
from helpers.territory_data import TerritoryData, as_int, get_refs, get_territory

TARGET_FIELDS = ["hcp_id", "name", "display_name", "role_type", "degree", "specialty", "account_id",
                 "account_name", "city", "state", "zip", "competitive_focus", "segment_code", "decile",
                 "tier_code", "is_in_call_plan", "hs_patients", "jak_patients", "povo_patients", "pef",
                 "last_call_date", "parent_hcp_id", "is_must_win"]
#: Lowest decile in the POVO target universe (D10 to D2).
MIN_DECILE = 2


def display_name(h: dict) -> str:
    """"Dr. Last" for a physician, "First Last" for an NP or PA (POC tgName)."""
    if (h.get("ROLE_TYPE") or "HCP") == "HCP":
        return f"Dr. {h.get('LAST_NAME') or ''}".strip()
    return f"{h.get('FIRST_NAME') or ''} {h.get('LAST_NAME') or ''}".strip()


def assessed_calls(brand_code: str, territory_id: str) -> list[dict]:
    rows = get_warehouse().query(
        f"SELECT CALL_ID, HCP_ID, CALL_DATE, PARTICIPANT_IDS FROM {app('APP_CALL')} "
        f"WHERE BRAND_CODE = :brand AND TERRITORY_ID = :tid AND STATUS = 'assessed'",
        {"brand": brand_code, "tid": territory_id})
    for r in rows:
        r["CALL_DATE"] = to_date(r["CALL_DATE"])
        try:
            r["PARTICIPANTS"] = list(json.loads(r.get("PARTICIPANT_IDS") or "[]"))
        except ValueError:
            r["PARTICIPANTS"] = []
        if r["HCP_ID"] not in r["PARTICIPANTS"]:
            r["PARTICIPANTS"].insert(0, r["HCP_ID"])
    return rows


class Universe:
    """Targets of one territory with the assessed-call overlay applied."""

    def __init__(self, td: TerritoryData, calls: list[dict]) -> None:
        self.td = td
        self.brand = td.brand_code
        self.refs = get_refs(td.brand_code)
        self.calls = calls
        self.app_calls_by_hcp: dict[str, list[dict]] = defaultdict(list)
        for c in calls:
            for pid in c["PARTICIPANTS"]:
                self.app_calls_by_hcp[pid].append(c)
        self.rep_dates: dict[str, list[date]] = defaultdict(list)
        self.discussions: dict[str, int] = defaultdict(int)
        for i in td.interactions:
            if i.get("CHANNEL_CODE") == "rep" and i.get("INTERACTION_DATE"):
                self.rep_dates[i["HCP_ID"]].append(i["INTERACTION_DATE"])
                if i.get("BRAND_DISCUSSED"):
                    self.discussions[i["HCP_ID"]] += 1
        for pid, cs in self.app_calls_by_hcp.items():
            for c in cs:
                if c["CALL_DATE"]:
                    self.rep_dates[pid].append(c["CALL_DATE"])
                self.discussions[pid] += 1
        for k in self.rep_dates:
            self.rep_dates[k].sort()
        self.targets: dict[str, dict] = {}
        for hid, p in td.plan.items():
            h = td.hcps.get(hid)
            if h is not None and as_int(p.get("DECILE")) >= MIN_DECILE:
                self.targets[hid] = self._target(h, p)
        self.list = sorted(self.targets.values(),
                           key=lambda t: (-t["hs_patients"], 0 if t["role_type"] == "HCP" else 1, t["hcp_id"]))
        self.must_hs = [t for t in self.list if not t["jak_patients"]][:5]
        self.must_jak = [t for t in self.list if t["jak_patients"] > 0][:5]
        for t in self.must_hs + self.must_jak:
            t["is_must_win"] = True

    def _target(self, h: dict, p: dict) -> dict:
        td = self.td
        m = td.metrics.get(h["HCP_ID"], {})
        acc = td.accounts.get(h.get("ACCOUNT_ID") or "", {})
        dates = self.rep_dates.get(h["HCP_ID"], [])
        tier_code = p.get("TIER_CODE") or None
        return {
            "hcp_id": h["HCP_ID"],
            "name": f"{h.get('LAST_NAME') or ''}, {h.get('FIRST_NAME') or ''}",
            "display_name": display_name(h),
            "role_type": h.get("ROLE_TYPE") or "HCP",
            "degree": h.get("DEGREE"),
            "specialty": h.get("SPECIALTY"),
            "account_id": h.get("ACCOUNT_ID"),
            "account_name": acc.get("ACCOUNT_NAME"),
            "city": h.get("CITY") or acc.get("CITY"),
            "state": h.get("STATE") or acc.get("STATE"),
            "zip": h.get("ZIP") or acc.get("ZIP"),
            "competitive_focus": p.get("COMPETITIVE_FOCUS"),
            "segment_code": p.get("SEGMENT_CODE"),
            "decile": as_int(p.get("DECILE")),
            "tier_code": tier_code,
            "is_in_call_plan": bool(p.get("IS_IN_CALL_PLAN")) if p.get("IS_IN_CALL_PLAN") is not None
            else tier_code is not None,
            # API field names stay as the screens know them; the columns are brand-neutral.
            "hs_patients": as_int(m.get("INDICATION_PATIENTS_12M")),
            "jak_patients": as_int(m.get("COMPETITOR_PATIENTS")),
            "povo_patients": as_int(m.get("BRAND_PATIENTS")),
            # Enrollment forms received through the patient program; every brand patient has one,
            # so pef >= povo_patients.
            "pef": as_int(m.get("PROGRAM_ENROLLED_PATIENTS")),
            "last_call_date": dates[-1] if dates else None,
            "parent_hcp_id": h.get("PARENT_HCP_ID") or None,
            "is_must_win": False,
            "_hs_rank": as_int(p.get("VOLUME_RANK")),
            "_visits": m.get("INDICATION_VISITS_PER_MONTH"),
            "_incyte": as_int(m.get("PROGRAM_ENROLLED_PATIENTS")),
            "_rep_dates": dates,
            "_discussions": self.discussions.get(h["HCP_ID"], 0),
        }

    # -- views -----------------------------------------------------------------
    def get(self, hcp_id: str) -> Optional[dict]:
        return self.targets.get(hcp_id)

    def plan_targets(self) -> list[dict]:
        """Full Call Plan: in-plan targets (D10-D2) that are not Must-Wins (POC planTg)."""
        return [t for t in self.list if t["is_in_call_plan"] and not t["is_must_win"]]

    def in_territory(self, hcp_id: str) -> bool:
        return hcp_id in self.td.hcps


def public(t: dict) -> dict:
    """The contract `Target` shape, without the private working keys."""
    return {k: t[k] for k in TARGET_FIELDS}


def universe(brand_code: str, territory_id: str) -> Universe:
    return Universe(get_territory(brand_code, territory_id), assessed_calls(brand_code, territory_id))
