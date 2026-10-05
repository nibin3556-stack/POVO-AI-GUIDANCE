"""Generate the POVO AI Guidance bronze dummy data as CSV files.

One ``<TABLE>.csv`` per bronze table (ARCHITECTURE.md section 4.1), plus a
``_manifest.json``. The local DuckDB mode of the backend and
``scripts/load_seed_data.py`` both read these files, so the CSV format is a
contract too:

* header = the exact column names, in DDL order, UTF-8;
* dates ISO ``YYYY-MM-DD``, booleans ``true``/``false``, NULL = empty field.

Why a hand-rolled generator (no pandas, no faker): pandas is blocked on the
managed machines, and a fixed-seed standard-library generator gives the same
bytes on every machine, which the tests rely on.

The numbers are modelled on the POC (``POVO_AI_Guidance_Step3_63_Alt 2.html``):
decile split, writers by decile, monthly goal shape, tier call rates, reach and
attainment factors, the Portland named HCPs and the impersonation territories.

Data window: activity, calls and goals start on the first day of the month
three months before the as-of month (as of 10/05/2026: Jul 1 to Oct 5), so the
dashboard always shows the current month plus the three before it.

D1 is not part of the POVO target universe: the D1 HCPs are modelled (so the
HS ranking and the D2-D10 split stay realistic) and then left out of every table.

Usage
    python databricks/seed/generate_seed_data.py
    python databricks/seed/generate_seed_data.py --as-of 2026-10-13 --seed 42 --out databricks/seed/output

``--as-of`` defaults to today in America/New_York. On Windows the IANA zone
database comes from the ``tzdata`` package (see databricks/requirements.txt);
without it the generator falls back to the US Eastern DST rule and warns.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import random
import sys
from pathlib import Path
from typing import Any, Iterable

HERE = Path(__file__).resolve().parent
DEFAULT_OUT = HERE / "output"
DEFAULT_CONTENT = HERE / "content"
DEFAULT_SEED = 20260930
TARGETS_PER_TERRITORY = 142

# --------------------------------------------------------------------------
# Table columns (must match ddl/01_bronze_tables.sql; a test checks it)
# --------------------------------------------------------------------------
COLUMNS: dict[str, list[str]] = {
    "DIM_TERRITORY": ["TERRITORY_ID", "TERRITORY_NAME", "CITY", "STATE", "REGION", "TIME_ZONE"],
    "DIM_EMPLOYEE": ["EMPLOYEE_ID", "NETWORK_ID", "USERNAME", "EMAIL", "FIRST_NAME", "LAST_NAME",
                     "FULL_NAME", "INITIALS", "BUSINESS_UNIT", "ROLE_CODE", "ROLE_TITLE",
                     "ACCESS_LEVEL", "ACCESS_REGIONS", "HOME_TERRITORY_ID", "IS_ACTIVE"],
    "DIM_ACCOUNT": ["ACCOUNT_ID", "TERRITORY_ID", "ACCOUNT_NAME", "CITY", "STATE", "ZIP",
                    "CLAIMS_HS_PATIENTS", "CLAIMS_POVO_PATIENTS", "CLAIMS_MAIN_FOCUS", "IS_CLAIMS_ONLY"],
    "DIM_HCP": ["HCP_ID", "NPI", "FIRST_NAME", "LAST_NAME", "DEGREE", "ROLE_TYPE", "SPECIALTY",
                "ACCOUNT_ID", "PARENT_HCP_ID", "TERRITORY_ID", "CITY", "STATE", "ZIP"],
    "FCT_HCP_METRICS": ["HCP_ID", "AS_OF_DATE", "HS_PATIENTS_12M", "HS_VISITS_PER_MONTH",
                        "JAK_PATIENTS", "POVO_PATIENTS", "INCYTECARES_ENROLLED_PATIENTS"],
    "DIM_CALL_PLAN_TARGET": ["PLAN_YEAR", "TERRITORY_ID", "HCP_ID", "DECILE", "TIER_CODE",
                             "SEGMENT_CODE", "COMPETITIVE_FOCUS", "IS_IN_CALL_PLAN", "HS_RANK"],
    "REF_TIER": ["TIER_CODE", "TIER_NAME", "DECILE_MIN", "DECILE_MAX", "CALLS_PER_YEAR",
                 "REACH_GOAL_PCT", "SORT_ORDER"],
    "REF_SEGMENT": ["SEGMENT_CODE", "SHORT_NAME", "FULL_NAME", "DESCRIPTION", "COLOR_HEX",
                    "ARCHETYPE_NAME", "ARCHETYPE_DESC", "SORT_ORDER"],
    "REF_KPI_METRIC": ["METRIC_CODE", "EVENT_TYPE", "TITLE", "UNIT", "SORT_ORDER"],
    "REF_INTERACTION_CHANNEL": ["CHANNEL_CODE", "TYPE_LABEL", "TEAM_LABEL", "SORT_ORDER"],
    "REF_COMPETITIVE_FOCUS": ["FOCUS_CODE", "LABEL", "COLOR_HEX", "SORT_ORDER"],
    "FCT_INTERACTION": ["INTERACTION_ID", "HCP_ID", "TERRITORY_ID", "EMPLOYEE_ID", "INTERACTION_DATE",
                        "CHANNEL_CODE", "INTERACTION_TYPE", "POVO_DISCUSSED", "SUMMARY"],
    "FCT_POVO_ACTIVITY": ["ACTIVITY_ID", "TERRITORY_ID", "HCP_ID", "PATIENT_KEY", "EVENT_DATE", "EVENT_TYPE"],
    "FCT_TERRITORY_GOAL": ["TERRITORY_ID", "GOAL_YEAR", "GOAL_MONTH", "METRIC_CODE", "GOAL_VALUE"],
    "REF_US_HOLIDAY": ["HOLIDAY_DATE", "HOLIDAY_NAME"],
    "REF_TALKING_POINT": ["POINT_ID", "CONTENT_VERSION", "CATEGORY", "VARIANT", "PILLAR", "AUDIENCE",
                          "SEGMENT_CODE", "WRITER_STATE", "TEXT_TEMPLATE", "DETAIL_TEMPLATE",
                          "NEXT_CALL_TEMPLATE", "SORT_ORDER", "MLR_CODE", "IS_ACTIVE"],
    "REF_OBJECTION_RULE": ["RULE_ID", "AUDIENCE", "SEGMENT_CODE", "MIN_DECILE", "MAX_DECILE",
                           "WRITER_STATE", "OBJECTION_POINT_IDS", "PRIORITY"],
    "REF_COMPLIANCE_RULE": ["RULE_ID", "CHIP_LABEL", "TITLE", "SEVERITY", "DEDUCTION", "PATTERN",
                            "SUPPRESS_PATTERN", "WHY_TEXT", "FIX_TEXT", "SORT_ORDER", "IS_ACTIVE"],
    "REF_COMPLIANCE_TEXT": ["TEXT_ID", "CONTENT_VERSION", "KIND", "TEXT_KEY", "PATTERN", "TEXT_TEMPLATE",
                            "SORT_ORDER", "IS_ACTIVE"],
    "REF_KPI_PARAMETER": ["PARAM_CODE", "PARAM_VALUE", "DESCRIPTION", "SORT_ORDER"],
}

#: Content tables are owned by the backend as JSON; the seeder copies them.
CONTENT_FILES = {
    "REF_TALKING_POINT": "talking_points.json",
    "REF_OBJECTION_RULE": "objection_rules.json",
    "REF_COMPLIANCE_RULE": "compliance_rules.json",
    "REF_COMPLIANCE_TEXT": "compliance_texts.json",
}

# --------------------------------------------------------------------------
# POC business numbers (POC_FUNCTIONAL_SPEC.md section 8)
# --------------------------------------------------------------------------
DECILES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
POC_DECILE_TARGETS = [1, 2, 4, 5, 8, 10, 13, 19, 21, 59]   # D10 -> D1, 142 modelled (83 targets, D1 dropped)
POC_DECILE_WRITERS = [1, 2, 3, 3, 4, 4, 3, 2, 2, 0]         # D10 -> D1, total 24; D1 never writes
POC_DECILE_AVG_HS = [133, 64, 39, 31, 24, 19, 16, 12, 10, 6]
#: New-patient goal per month from the data-start month; later months add 1 each.
POC_GOAL_SHAPE = [8, 12, 15, 17, 18, 19]
#: The data window: the current month plus this many months before it.
DATA_WINDOW_MONTHS = 3
TARGET_MIN_DECILE = 2
PEF_GOAL_FACTOR, NRX_GOAL_FACTOR = 1.4, 1.25
PEF_ACTUAL_FACTOR, NRX_ACTUAL_FACTOR = 1.36, 1.2

# code, name, decile min, decile max, calls/yr, reach goal %, attainment factor, reach factor
TIERS = [
    ("SH", "Super High", 7, 10, 40, 95, 0.94, 0.92),
    ("MED", "Medium", 5, 6, 28, 95, 0.82, 0.83),
    ("LOW", "Low", 2, 4, 20, 75, 0.68, 0.64),
]

# HS treatment segments: 3 exclusive groups (any JAK inhibitor use first, then biologic use, then neither).
SEGMENTS = [
    ("imm", "Advanced without JAK", "Advanced without JAK Inhibitors",
     "Treating HS patients with a biologic (Humira, Cosentyx or Bimzelx) and no JAK inhibitor", "#156CB4",
     "Tara", "losing control on a biologic"),
    ("exp", "Advanced Biologics plus JAK", "Advanced Biologics plus JAK Inhibitors",
     "Treating HS patients with a JAK inhibitor (off label in HS), with or without a biologic", "#7C6BD6",
     "Tara", "now on an off-label JAK inhibitor"),
    ("conv", "Conventional", "Conventional",
     "Managing HS patients with conventional therapy only (no biologic or JAK inhibitor)", "#0E8A8A",
     "Marcus", "still cycling antibiotics"),
]

# KPI definitions shown on the Territory Performance cards (METRIC_CODE matches FCT_TERRITORY_GOAL).
# The patients card adds the Paid NRx / Bridge NRx / Free Trial NRx split on top of its goal.
KPI_METRICS = [
    ("PEF", "PEF", "Patient Enrollment Forms", "PEFs"),
    ("NEW_PATIENTS", "NEW_PATIENT", "Total Patients Receiving POVO", "new patients"),
]

# Rates behind the Total on POVO split (Paid / Bridge / Free Trial). Dummy business
# assumptions until the client supplies real ones; the backend reads them from the table.
KPI_PARAMETERS = [
    ("PAID_PERSISTENCE", 0.85, "Share of patients started before the period still on paid POVO"),
    ("PENDING_ON_THERAPY", 0.70, "Share of PEFs without a paid start that are on Bridge or Free Trial"),
    ("BRIDGE_SHARE", 0.55, "Share of those pending patients on Bridge (the rest are on Free Trial)"),
]

# Interaction channels: the card type and the team shown on the filter chips.
INTERACTION_CHANNELS = [
    ("rep", "Direct call", "POVO Sales"),
    ("adfa", "ADFA visit", "ADFA"),
    ("opz", "Opz Sales call", "Opz Sales"),
    ("msl", "MSL visit", "MSL"),
    ("spkr", "Speaker program", "Speaker"),
    ("pr", "PR visit", "PR"),
]

FOCUS = [
    ("cosentyx", "Cosentyx", "#0E8A8A"),
    ("bimzelx", "Bimzelx", "#8A6A12"),
    ("humira", "Humira", "#7C3AED"),
    ("jak", "JAK", "#156CB4"),
    ("conventional", "Conventional therapy", "#64748B"),
]

INTERACTION_TYPES = {code: type_label for code, type_label, _team in INTERACTION_CHANNELS}

# Short, realistic one-line summaries (POC XFV lists plus "POVO discussed" variants).
REP_SUMMARIES = [
    "POVO discussed", "POVO discussed: HiSCR50 at week 12", "Discussed HiSCR50 Week 12 results",
    "Reviewed the overall safety profile", "Discussed patients who may need a change",
    "Reviewed once-daily dosing options", "Left the POVO start checklist",
    "POVO discussed: STOP-HS1 and STOP-HS2 design", "Discussed lesion and pain outcomes",
    "POVO discussed: patients losing control on a biologic", "Reviewed IncyteCARES enrollment steps",
]
REP_NOT_DISCUSSED = [
    "Brief office visit; POVO not discussed", "Scheduled a follow-up; POVO not discussed",
    "Met office manager; HCP unavailable",
]
OTHER_SUMMARIES = {
    "adfa": ["Office submits by PEF; coordinator runs PAs", "Confirmed specialty pharmacy for HS starts",
             "Walked staff through IncyteCARES enrollment", "Mapped the prior authorization steps",
             "POVO discussed: benefits verification workflow"],
    "opz": ["Opzelura indications only; no HS", "Opzelura follow-up; HS not discussed",
            "Reviewed Opzelura access; no HS"],
    "msl": ["Answered lab monitoring questions (reactive)", "Answered a JAK1 selectivity question (reactive)",
            "Shared STOP-HS study design on request", "MSL clinical data review: STOP-HS efficacy",
            "MSL clinical data review: long-term safety (reactive)"],
    "pr": ["Left HSTruths.com patient resources", "Left patient education brochures",
           "Set up a staff education lunch", "PR visit: POVO discussed with office staff"],
}
SPEAKER_TOPICS = ["HS escalation criteria program", "STOP-HS data program", "HS patient journey program",
                  "POVO clinical data program"]
OTHER_DISCUSSED = {"adfa": True, "opz": False, "msl": True, "spkr": True, "pr": True}

# --------------------------------------------------------------------------
# Territories, accounts and named HCPs (POC names where they exist)
# --------------------------------------------------------------------------
CITY_ZIP = {
    "Portland, ME": "04101", "South Portland, ME": "04106", "Lewiston, ME": "04240",
    "Biddeford, ME": "04005", "Brunswick, ME": "04011", "Saco, ME": "04072",
    "Boston, MA": "02114", "Burlington, MA": "01805", "Newton, MA": "02462", "Cambridge, MA": "02138",
    "Quincy, MA": "02169", "Brookline, MA": "02445",
    "Hartford, CT": "06106", "Farmington, CT": "06030", "Danbury, CT": "06810", "New Britain, CT": "06051",
    "Manchester, CT": "06040", "Bristol, CT": "06010",
    "Providence, RI": "02903", "Warwick, RI": "02886", "Newport, RI": "02840", "Pawtucket, RI": "02860",
    "Cranston, RI": "02920", "Woonsocket, RI": "02895",
    "Manchester, NH": "03101", "Nashua, NH": "03060", "Concord, NH": "03301", "Portsmouth, NH": "03801",
    "Derry, NH": "03038", "Lebanon, NH": "03766",
    "Burlington, VT": "05401", "South Burlington, VT": "05403", "Rutland, VT": "05701",
    "Montpelier, VT": "05602", "St. Albans, VT": "05478", "Barre, VT": "05641",
    "Worcester, MA": "01605", "Framingham, MA": "01702", "Leominster, MA": "01453",
    "Marlborough, MA": "01752", "Fitchburg, MA": "01420", "Shrewsbury, MA": "01545",
    "Springfield, MA": "01199", "Holyoke, MA": "01040", "Northampton, MA": "01060",
    "Westfield, MA": "01085", "Chicopee, MA": "01013", "Pittsfield, MA": "01201",
}


def _np(first_last: str, role: str) -> tuple[str, str]:
    return (first_last, role)


# Named physicians: (last, first, degree, account index, strength, [(NP/PA name, role, strength)])
PORTLAND_NAMED = [
    ("Winters", "John", "MD", 0, 133, [("Kristen Casey", "PA", 38), ("Jamie Theriault", "NP", 24)]),
    ("Sprague", "Marcia", "MD", 1, 66, [("Dana Whitcomb", "NP", 31), ("Paul Renaud", "PA", 19)]),
    ("Berg", "Daniel", "DO", 2, 62, [("Alicia Moreno", "NP", 27), ("Grant Keller", "PA", 22)]),
    ("Pelletier", "Anne", "MD", 3, 42, [("Rachel Cote", "PA", 29), ("Ben Morin", "NP", 14)]),
    ("Boland", "Theresa", "MD", 4, 40, [("Rita Doyle", "PA", 21), ("Sam Ober", "NP", 16)]),
    ("Eisemann", "Paul", "MD", 0, 38, [("Lena Frost", "NP", 20), ("Owen Mackey", "PA", 18)]),
    ("Carver", "Michael", "MD", 5, 37, [("Molly Hart", "PA", 17), ("Evan Leblanc", "NP", 11)]),
    ("Bonnem", "Erin", "MD", 2, 33, [("Cara Lin", "PA", 15), ("Nate Shelby", "NP", 12)]),
    ("Ouellette", "Marc", "DO", 3, 32, [("Julie Roy", "NP", 13), ("Tom Gagnon", "PA", 9)]),
    ("Dunham", "Laura", "MD", 4, 31, [("Amy Pratt", "PA", 12), ("Luke Bragdon", "NP", 8)]),
    ("Morrow", "Karen", "MD", 1, 30, [("Erin Walsh", "NP", 11), ("Chris Dube", "PA", 7)]),
    ("Fisk", "Robert", "DO", 5, 29, [("Holly Ames", "PA", 10), ("Sean Poirier", "NP", 6)]),
    ("Lavoie", "Denise", "MD", 2, 26, [("Kara Libby", "NP", 9), ("Matt Currier", "PA", 6)]),
    ("Harmon", "Greg", "MD", 4, 25, [("Joan Theberge", "PA", 8), ("Ray Nadeau", "NP", 5)]),
    ("Baxter", "Nina", "MD", 3, 24, [("Tina Grover", "NP", 7), ("Will Soucy", "PA", 4)]),
]
PORTLAND_PAD = ["Abbott, Lisa", "Barnes, Tom", "Cole, Megan", "Dunn, Eric", "Ellis, Rachel", "Foster, Mark",
                "Gray, Helen", "Hale, Victor", "Irwin, Jill", "Jensen, Carl", "Kerr, Donna", "Lowe, Frank",
                "Mills, Tara", "Nash, Owen", "Olsen, Beth", "Page, Ryan", "Quint, Alice", "Rowe, Dennis"]

BOSTON_NAMED = [
    ("Okafor", "Grace", "MD", 0, 138, [("Maria Santos", "PA", 41), ("Tom Brennan", "NP", 26)]),
    ("Lindqvist", "Erik", "MD", 1, 128, [("Julie Park", "NP", 33), ("Chris Dolan", "PA", 21)]),
    ("Haddad", "Samir", "DO", 2, 68, [("Nadia Rahman", "PA", 30), ("Leo Carter", "NP", 18)]),
    ("Pereira", "Ana", "MD", 3, 63, [("Emma Ruiz", "NP", 25), ("Dev Patel", "PA", 20)]),
    ("Walsh", "Kevin", "MD", 0, 61, [("Holly Grant", "PA", 22), ("Ian Moore", "NP", 15)]),
    ("Nguyen", "Linh", "MD", 1, 41, [("Sara Kim", "NP", 21), ("Omar Aziz", "PA", 17)]),
    ("Murphy", "Sean", "MD", 2, 39, [("Kate Doherty", "PA", 16), ("Ryan Cole", "NP", 10)]),
    ("Feld", "Rachel", "MD", 3, 38, [("Nina Shah", "NP", 14), ("Joe Ricci", "PA", 12)]),
    ("Costa", "Luis", "DO", 0, 37, [("Lisa Tran", "PA", 12), ("Mark Bell", "NP", 9)]),
    ("Barrett", "Kim", "MD", 2, 36, [("Ella Burke", "NP", 10), ("Dan Kerr", "PA", 7)]),
]

# POC genDS NP/PA names, paired two per physician in order.
GENDS_NP = ["Avery Stone", "Jordan Blake", "Casey Reed", "Morgan Hale", "Taylor Quinn", "Riley Shaw",
            "Jamie Cross", "Drew Ellis", "Parker Lane", "Skyler Moss", "Reese Hart", "Kendall Fox",
            "Logan Pierce", "Rowan Gale", "Hayden Cole", "Quinn Avery", "Emerson Wade", "Finley Brooks",
            "Sage Holt", "Blair Kemp", "Harper Quill", "Dakota Reese", "Jesse Monroe", "Alex Rivera",
            "Cameron Voss", "Robin Sykes", "Shawn Pike", "Kerry Vale", "Devon Lark", "Toni Marsh"]


def _gends(names: list[str], hs: list[int], np_offset: int) -> list[tuple]:
    """Rebuild the POC genDS physicians: account round-robin, every 3rd is a DO."""
    out = []
    for i, (full, strength) in enumerate(zip(names, hs)):
        last, first = [p.strip() for p in full.split(",")]
        a = GENDS_NP[(np_offset + i * 2) % len(GENDS_NP)]
        b = GENDS_NP[(np_offset + i * 2 + 1) % len(GENDS_NP)]
        roles = ("NP", "PA") if i % 2 else ("PA", "NP")
        npa = [(a, roles[0], max(4, round(strength * 0.26))), (b, roles[1], max(3, round(strength * 0.16)))]
        out.append((last, first, "DO" if i % 4 == 2 else "MD", i % 4, strength, npa))
    return out


HARTFORD_NAMED = _gends(
    ["Russo, Anthony", "Kaplan, Miriam", "Mehta, Raj", "Brennan, Claire", "Castillo, Jorge", "Novak, Peter",
     "Hughes, Laura", "Lindgren, Eva", "Moreau, Paul", "Chen, Grace", "Doyle, Kevin", "Price, Janet",
     "Ward, Simon", "Farley, Nora", "Keene, Alan"],
    [131, 66, 60, 41, 39, 37, 33, 32, 30, 29, 28, 26, 25, 24, 23], 0)
PROVIDENCE_NAMED = _gends(
    ["Almeida, Sofia", "Fontaine, Marc", "Gallagher, Rose", "Iqbal, Samir", "Duarte, Lucia", "Maher, Colin",
     "Silva, Renata", "Tobin, Grant", "Ahern, Molly", "Vieira, Nuno", "Carr, Diane", "Lomax, Ben",
     "Pinto, Clara", "Rourke, Tom", "Esposito, Gina"],
    [128, 63, 42, 39, 37, 32, 31, 30, 29, 26, 25, 24, 24, 23, 22], 0)

# Per-territory model knobs:
#   scale  - goal size vs the POC Portland shape
#   perf   - actual new patients vs goal (>1 on track, <1 at risk)
#   shape  - POC MSHAPE, varies the month-by-month writer mix
#   writers / jak_share - writers target and share of them that are JAK users
TERRITORIES: list[dict[str, Any]] = [
    dict(id="NE-POR", city="Portland", state="ME", scale=1.00, perf=0.88, shape=0, writers=24, jak_share=15 / 24,
         keep_poc_deciles=True,
         accounts=[("Maine Medical Partners Dermatology", "Portland, ME"),
                   ("Northern Light Mercy Dermatology", "Portland, ME"),
                   ("InterMed Dermatology", "South Portland, ME"),
                   ("Central Maine Dermatology", "Lewiston, ME"),
                   ("Southern Maine Health Care Dermatology", "Biddeford, ME"),
                   ("Mid Coast Dermatology", "Brunswick, ME")],
         claims_only=[("Saco Bay Surgical Associates", "Saco, ME"),
                      ("Portland Wound and Skin Clinic", "Portland, ME")],
         named=PORTLAND_NAMED, pad=PORTLAND_PAD),
    dict(id="NE-BOS", city="Boston", state="MA", scale=1.12, perf=1.08, shape=1, writers=27, jak_share=16 / 27,
         accounts=[("Mass General Dermatology Associates", "Boston, MA"),
                   ("Brigham Dermatology Associates", "Boston, MA"),
                   ("Beth Israel Lahey Dermatology", "Burlington, MA"),
                   ("Newton-Wellesley Dermatology", "Newton, MA"),
                   ("Tufts Medical Center Dermatology", "Boston, MA"),
                   ("Cambridge Health Alliance Dermatology", "Cambridge, MA"),
                   ("South Shore Dermatology", "Quincy, MA")],
         claims_only=[("Brookline Surgical Associates", "Brookline, MA"),
                      ("Boston Wound and Skin Clinic", "Boston, MA")],
         named=BOSTON_NAMED, pad=[]),
    dict(id="NE-HFD", city="Hartford", state="CT", scale=0.92, perf=0.90, shape=2, writers=22, jak_share=13 / 22,
         accounts=[("Hartford HealthCare Dermatology", "Hartford, CT"),
                   ("UConn Health Dermatology", "Farmington, CT"),
                   ("Saint Francis Dermatology", "Hartford, CT"),
                   ("Danbury Dermatology Associates", "Danbury, CT"),
                   ("Connecticut Skin Institute", "New Britain, CT"),
                   ("Manchester Dermatology Group", "Manchester, CT")],
         claims_only=[("Bristol Surgical Associates", "Bristol, CT"),
                      ("Capitol Region Wound Center", "Hartford, CT")],
         named=HARTFORD_NAMED, pad=[]),
    dict(id="NE-PVD", city="Providence", state="RI", scale=0.86, perf=1.07, shape=3, writers=19, jak_share=11 / 19,
         accounts=[("Lifespan Dermatology", "Providence, RI"),
                   ("Rhode Island Dermatology Institute", "Warwick, RI"),
                   ("Newport Coastal Dermatology", "Newport, RI"),
                   ("Blackstone Valley Dermatology", "Pawtucket, RI"),
                   ("Cranston Skin Center", "Cranston, RI"),
                   ("Northern Rhode Island Dermatology", "Woonsocket, RI")],
         claims_only=[("Kent County Surgical Group", "Warwick, RI"),
                      ("Providence Wound Care Clinic", "Providence, RI")],
         named=PROVIDENCE_NAMED, pad=[]),
    dict(id="NE-MAN", city="Manchester", state="NH", scale=0.90, perf=1.10, shape=4, writers=23, jak_share=0.62,
         accounts=[("Granite State Dermatology", "Manchester, NH"),
                   ("Nashua Dermatology Associates", "Nashua, NH"),
                   ("Concord Skin and Laser", "Concord, NH"),
                   ("Seacoast Dermatology", "Portsmouth, NH"),
                   ("Derry Family Dermatology", "Derry, NH"),
                   ("Upper Valley Dermatology", "Lebanon, NH")],
         claims_only=[("Merrimack Valley Surgical Associates", "Nashua, NH"),
                      ("Queen City Wound Care", "Manchester, NH")],
         named=[], pad=[]),
    dict(id="NE-BTV", city="Burlington", state="VT", scale=0.85, perf=0.82, shape=5, writers=21, jak_share=0.60,
         accounts=[("Champlain Valley Dermatology", "Burlington, VT"),
                   ("Green Mountain Dermatology", "South Burlington, VT"),
                   ("Rutland Regional Dermatology", "Rutland, VT"),
                   ("Capital Dermatology", "Montpelier, VT"),
                   ("Northwest Vermont Dermatology", "St. Albans, VT"),
                   ("Barre Skin Center", "Barre, VT")],
         claims_only=[("Lake Champlain Surgical Group", "Burlington, VT"),
                      ("Central Vermont Wound Clinic", "Barre, VT")],
         named=[], pad=[]),
    dict(id="NE-WOR", city="Worcester", state="MA", scale=1.05, perf=1.07, shape=6, writers=25, jak_share=0.65,
         accounts=[("Worcester Dermatology Associates", "Worcester, MA"),
                   ("MetroWest Dermatology", "Framingham, MA"),
                   ("Nashoba Valley Dermatology", "Leominster, MA"),
                   ("Marlborough Skin Center", "Marlborough, MA"),
                   ("Montachusett Dermatology", "Fitchburg, MA"),
                   ("Shrewsbury Dermatology Group", "Shrewsbury, MA"),
                   ("Central Mass Skin Institute", "Worcester, MA")],
         claims_only=[("Wachusett Surgical Associates", "Leominster, MA"),
                      ("Worcester Wound Care Center", "Worcester, MA")],
         named=[], pad=[]),
    dict(id="NE-SPR", city="Springfield", state="MA", scale=0.95, perf=0.93, shape=7, writers=23, jak_share=0.64,
         accounts=[("Pioneer Valley Dermatology", "Springfield, MA"),
                   ("Holyoke Dermatology Associates", "Holyoke, MA"),
                   ("Northampton Skin Center", "Northampton, MA"),
                   ("Westfield Dermatology", "Westfield, MA"),
                   ("Chicopee Family Dermatology", "Chicopee, MA"),
                   ("Berkshire Dermatology", "Pittsfield, MA")],
         claims_only=[("Connecticut River Surgical Group", "Springfield, MA"),
                      ("Hampden Wound Clinic", "Chicopee, MA")],
         named=[], pad=[]),
]

# (employee id, network id, username, first, last, role, home territory)
EMPLOYEES = [
    ("p250488", "3297", "vturano", "Vince", "Turano", "REP", "NE-POR"),
    ("p250519", "3322", "mcastellano", "Megan", "Castellano", "REP", "NE-BOS"),
    ("p250611", "3418", "dwhitaker", "Dana", "Whitaker", "REP", "NE-HFD"),
    ("p250702", "3526", "lortega", "Luis", "Ortega", "REP", "NE-PVD"),
    ("p250733", "3561", "krobichaud", "Kyle", "Robichaud", "REP", "NE-MAN"),
    ("p250758", "3589", "hlefebvre", "Hannah", "Lefebvre", "REP", "NE-BTV"),
    ("p250776", "3604", "nbarros", "Nicole", "Barros", "REP", "NE-WOR"),
    ("p250791", "3617", "ekowalski", "Ethan", "Kowalski", "REP", "NE-SPR"),
    ("p250544", "3351", "bdrake", "Barbara", "Drake", "MANAGER", "NE-BOS"),
    ("p250563", "3372", "rsutherland", "Raymond", "Sutherland", "MANAGER", "NE-WOR"),
]
EMAIL_DOMAIN = "incyte.com"

# Name pools for modelled HCPs. Last names are kept unique within a territory
# so "Dr. Last" never collides on screen.
LAST_NAMES = """Adams Bishop Carter Dalton Emery Fields Gibbs Hayes Ingram Jordan Kemp Lamb Monroe Noble Oakes
Parker Quinn Reyes Sloan Tate Upton Vance Wade Young Zimmer Archer Bowen Crane Eaton Ives Joyce Knox Lyle
Marsh Nolan Orr Rhodes Sutton Thorne Underwood Valdez Webb York Bauer Chapman Dixon Evans Fowler Garner Holt
Isaacs Jennings Lawson Mercer Norris Owens Porter Ramsey Sawyer Tucker Vaughn Wheeler Yates Baird Conway
Delaney Fletcher Gordon Hensley Hurst Kirby Lambert Maddox Neal Osborne Payne Rollins Shepherd Stanton Tanner
Vargas Watts Barlow Dorsey Finch Goodwin Harper Jarvis Larson McCoy Nichols Patton Riggs Sherman Talbot
Whitman Burke Clayton Donovan Fuller Hobbs Kent Lang Pace Rush Spencer Todd Abrams Benson Callahan Dean
Emerson Fox Hudson Lowry Mathis Newman Pruitt Sampson Albright Beaulieu Bergeron Blanchard Boucher Brady
Cantor Caron Cavanaugh Chase Cloutier Cormier Crowley Cullen Daigle Desjardins Dubois Duffy Dwyer Egan
Farrell Fitzgerald Flynn Gallant Garrity Gauthier Gilman Hanlon Healey Hebert Hickey Hogan Keating Kearney
Lachance Landry Leary Levesque Lynch Madden Mahoney Marchand Mccarthy Mcdonough Mcgrath Moran Mulligan
Nadeau Nolin Obrien Ouimet Paquette Pelkey Perreault Plante Quigley Rafferty Reardon Rioux Roche Rourke
Savage Shea Sheehan Simard Sullivan Sweeney Theriot Thibault Tierney Trudeau Vachon Voss Wallace Ward
Aldrich Bancroft Carlisle Dunmore Ellsworth Fairbanks Gilbride Haskell Kimball Lathrop Merrill Norcross
Pickering Prescott Randall Sargent Thayer Whitney Winslow Alvarez Castro Delgado Flores Guerrero Herrera
Jimenez Medina Mendoza Navarro Ortiz Ramos Rios Salazar Soto Torres Vega Chandra Desai Gupta Iyer Joshi
Kapoor Malik Rao Sethi Varma Cho Huang Lee Lim Park Tanaka Wong Yamada Zhou Abbas Farah Haddock Khoury
Nasser Saleh Bianchi Colombo Ferraro Greco Marino Moretti Romano Russell Santoro Vitale Andersen Berglund
Dahl Eklund Holm Lund Nyberg Strand Wikstrom Kowal Nowak Sokol Wojcik Zielinski""".split()
FIRST_NAMES = """Ruth Neil Joy Ivan Kate Omar Laura Colin Paula Luke Alice Victor Sara Evan Diane Hugo Lena Tony
Maya Brian Clara Derek Fiona Glen Hope Paul Tess Owen Molly Scott Adam Beth Carl Dana Eli Faith Gavin Hanna
Isaac Jill Keith Leah Mark Nora Oscar Petra Quentin Rosa Seth Tara Uri Vera Wade Xena Yusuf Zoe Aaron Bianca
Caleb Delia Ethan Flora Graham Heidi Irene Jonah Kira Liam Mona Nathan Olive Priya Rafael Selena Theo Una
Vincent Wendy Anya Bruno Cecile Dmitri Elena Felix Greta Hector Ines Jasper Kenji Lucia Marcus Nadia Pablo
Rhea Sanjay Tomas Ursula Wes Yara Amir Bettina Cyrus Daria Emil Farid Gwen Hiro Ilse Joel""".split()


# --------------------------------------------------------------------------
# Dates: holidays and working days
# --------------------------------------------------------------------------
def _nth_weekday(year: int, month: int, weekday: int, n: int) -> dt.date:
    """n-th weekday (0=Mon) of a month; n=-1 means the last one."""
    if n > 0:
        d = dt.date(year, month, 1)
        d += dt.timedelta(days=(weekday - d.weekday()) % 7)
        return d + dt.timedelta(weeks=n - 1)
    nxt = dt.date(year + (month == 12), month % 12 + 1, 1)
    d = nxt - dt.timedelta(days=1)
    return d - dt.timedelta(days=(d.weekday() - weekday) % 7)


def _observed(d: dt.date) -> dt.date:
    """Saturday holidays are observed on Friday, Sunday ones on Monday."""
    if d.weekday() == 5:
        return d - dt.timedelta(days=1)
    if d.weekday() == 6:
        return d + dt.timedelta(days=1)
    return d


def us_holidays(year: int) -> list[tuple[dt.date, str]]:
    """The company holiday list the POC uses (8 days; no Juneteenth, Columbus or Veterans Day)."""
    return [
        (_observed(dt.date(year, 1, 1)), "New Year's Day"),
        (_nth_weekday(year, 1, 0, 3), "Martin Luther King Jr. Day"),
        (_nth_weekday(year, 2, 0, 3), "Presidents' Day"),
        (_nth_weekday(year, 5, 0, -1), "Memorial Day"),
        (_observed(dt.date(year, 7, 4)), "Independence Day"),
        (_nth_weekday(year, 9, 0, 1), "Labor Day"),
        (_nth_weekday(year, 11, 3, 4), "Thanksgiving Day"),
        (_observed(dt.date(year, 12, 25)), "Christmas Day"),
    ]


def working_days(start: dt.date, end: dt.date, holidays: set[dt.date]) -> list[dt.date]:
    """Weekdays minus holidays, inclusive of both ends."""
    out, d = [], start
    while d <= end:
        if d.weekday() < 5 and d not in holidays:
            out.append(d)
        d += dt.timedelta(days=1)
    return out


def data_start(as_of: dt.date) -> dt.date:
    """First day of the month DATA_WINDOW_MONTHS before the as-of month (Oct 5 -> Jul 1)."""
    k = as_of.year * 12 + as_of.month - 1 - DATA_WINDOW_MONTHS
    return dt.date(k // 12, k % 12 + 1, 1)


def month_list(start: dt.date, end: dt.date) -> list[tuple[int, int]]:
    """(year, month) from the month of start to the month of end, inclusive."""
    out, y, m = [], start.year, start.month
    while (y, m) <= (end.year, end.month):
        out.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def month_bounds(ym: tuple[int, int]) -> tuple[dt.date, dt.date]:
    y, m = ym
    nxt = dt.date(y + (m == 12), m % 12 + 1, 1)
    return dt.date(y, m, 1), nxt - dt.timedelta(days=1)


def goal_shape(k: int) -> int:
    """New-patient goal of the k-th month from the data start (POC shape, then +1 a month)."""
    return POC_GOAL_SHAPE[k] if k < len(POC_GOAL_SHAPE) else POC_GOAL_SHAPE[-1] + (k - len(POC_GOAL_SHAPE) + 1)


def today_new_york() -> dt.date:
    """Today in America/New_York, with a DST-rule fallback when tzdata is missing."""
    try:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        try:
            return dt.datetime.now(ZoneInfo("America/New_York")).date()
        except ZoneInfoNotFoundError:
            pass
    except ImportError:
        pass
    print("WARN  tzdata not installed; using the US Eastern DST rule for --as-of "
          "(pip install tzdata to silence this)", file=sys.stderr)
    now = dt.datetime.now(dt.timezone.utc)
    y = now.year
    dst_start = dt.datetime.combine(_nth_weekday(y, 3, 6, 2), dt.time(7), dt.timezone.utc)
    dst_end = dt.datetime.combine(_nth_weekday(y, 11, 6, 1), dt.time(6), dt.timezone.utc)
    offset = -4 if dst_start <= now < dst_end else -5
    return (now + dt.timedelta(hours=offset)).date()


# --------------------------------------------------------------------------
# Small numeric helpers
# --------------------------------------------------------------------------
def spread_lr(total: int, weights: list[float]) -> list[int]:
    """Split a whole-number total by weights with largest-remainder rounding (POC spreadLR).

    The parts always add up to the total, which keeps every chart reconciled.
    """
    s = sum(weights)
    if total <= 0 or s <= 0:
        return [0] * len(weights)
    raw = [total * w / s for w in weights]
    parts = [math.floor(x) for x in raw]
    order = sorted(range(len(raw)), key=lambda i: (-(raw[i] - parts[i]), i))
    for i in order[: total - sum(parts)]:
        parts[i] += 1
    return parts


def weighted_sample(rng: random.Random, items: list, weights: list[float], k: int) -> list:
    """k distinct items, drawn with probability proportional to weight (Efraimidis-Spirakis)."""
    if k <= 0:
        return []
    keyed = [(rng.random() ** (1.0 / max(w, 1e-9)), i) for i, w in enumerate(weights)]
    keyed.sort(reverse=True)
    return [items[i] for _, i in keyed[:k]]


def npi_with_check_digit(base9: str) -> str:
    """Luhn check digit over the 80840 prefix, as real NPIs use; keeps dummy NPIs format-valid."""
    digits = [int(c) for c in "80840" + base9]
    total = 0
    for i, dgt in enumerate(reversed(digits)):
        if i % 2 == 0:
            dgt *= 2
            if dgt > 9:
                dgt -= 9
        total += dgt
    return base9 + str((10 - total % 10) % 10)


# --------------------------------------------------------------------------
# Generator
# --------------------------------------------------------------------------
class SeedGenerator:
    """Builds every bronze table in memory, territory by territory."""

    def __init__(self, as_of: dt.date, seed: int):
        self.as_of = as_of
        self.seed = seed
        self.year = as_of.year
        self.data_start = data_start(as_of)
        self.holidays = {d for y in {self.data_start.year, self.year} for d, _ in us_holidays(y)}
        self.year_days = working_days(dt.date(self.year, 1, 1), dt.date(self.year, 12, 31), self.holidays)
        # Working days in the data window (data start to as-of); every event and call falls on one.
        self.elapsed_days = working_days(self.data_start, as_of, self.holidays)
        # Share of a working year the window covers: scales the yearly call rates.
        self.elapsed_frac = len(self.elapsed_days) / len(self.year_days)
        self.months = month_list(self.data_start, as_of)
        # Goals run from the data-start month to the end of the as-of year.
        self.goal_months = month_list(self.data_start, dt.date(self.year, 12, 31))
        self.tables: dict[str, list[dict]] = {t: [] for t in COLUMNS}
        self.summary: dict[str, dict] = {}
        self._hcp_seq = self._acct_seq = self._ix_seq = self._act_seq = 0
        self._used_full_names: set[str] = set()

    # ---- id helpers ----------------------------------------------------
    def _next_hcp_id(self) -> str:
        self._hcp_seq += 1
        return f"H{self._hcp_seq:06d}"

    def _next_account_id(self) -> str:
        self._acct_seq += 1
        return f"A{self._acct_seq:05d}"

    def _rng(self, *parts: Any) -> random.Random:
        """Independent stream per purpose, so e.g. the as-of date never reshuffles the HCP universe."""
        return random.Random(":".join(str(p) for p in (self.seed, *parts)))

    # ---- entry point -----------------------------------------------------
    def build(self) -> dict[str, list[dict]]:
        self._reference_tables()
        rep_by_territory = {e[6]: e[0] for e in EMPLOYEES if e[5] == "REP"}
        for cfg in TERRITORIES:
            self._territory(cfg, rep_by_territory[cfg["id"]])
        return self.tables

    def _reference_tables(self) -> None:
        for i, (code, name, dmin, dmax, calls, reach, _a, _r) in enumerate(TIERS, 1):
            self.tables["REF_TIER"].append(dict(TIER_CODE=code, TIER_NAME=name, DECILE_MIN=dmin, DECILE_MAX=dmax,
                                                CALLS_PER_YEAR=calls, REACH_GOAL_PCT=reach, SORT_ORDER=i))
        for i, (code, short, full, desc, color, arch, arch_desc) in enumerate(SEGMENTS, 1):
            self.tables["REF_SEGMENT"].append(dict(SEGMENT_CODE=code, SHORT_NAME=short, FULL_NAME=full,
                                                   DESCRIPTION=desc, COLOR_HEX=color, ARCHETYPE_NAME=arch,
                                                   ARCHETYPE_DESC=arch_desc, SORT_ORDER=i))
        for i, (code, event, title, unit) in enumerate(KPI_METRICS, 1):
            self.tables["REF_KPI_METRIC"].append(dict(METRIC_CODE=code, EVENT_TYPE=event, TITLE=title, UNIT=unit,
                                                      SORT_ORDER=i))
        for i, (code, value, desc) in enumerate(KPI_PARAMETERS, 1):
            self.tables["REF_KPI_PARAMETER"].append(dict(PARAM_CODE=code, PARAM_VALUE=value, DESCRIPTION=desc,
                                                         SORT_ORDER=i))
        for i, (code, type_label, team) in enumerate(INTERACTION_CHANNELS, 1):
            self.tables["REF_INTERACTION_CHANNEL"].append(dict(CHANNEL_CODE=code, TYPE_LABEL=type_label,
                                                               TEAM_LABEL=team, SORT_ORDER=i))
        for i, (code, label, color) in enumerate(FOCUS, 1):
            self.tables["REF_COMPETITIVE_FOCUS"].append(dict(FOCUS_CODE=code, LABEL=label, COLOR_HEX=color,
                                                             SORT_ORDER=i))
        for year in sorted({self.data_start.year, self.year, self.year + 1}):
            for d, name in us_holidays(year):
                self.tables["REF_US_HOLIDAY"].append(dict(HOLIDAY_DATE=d, HOLIDAY_NAME=name))
        for cfg in TERRITORIES:
            self.tables["DIM_TERRITORY"].append(dict(
                TERRITORY_ID=cfg["id"], TERRITORY_NAME=f"{cfg['city']}, {cfg['state']} territory",
                CITY=cfg["city"], STATE=cfg["state"], REGION="Northeast", TIME_ZONE="America/New_York"))
        for emp_id, net_id, user, first, last, role, home in EMPLOYEES:
            is_rep = role == "REP"
            self.tables["DIM_EMPLOYEE"].append(dict(
                EMPLOYEE_ID=emp_id, NETWORK_ID=net_id, USERNAME=user, EMAIL=f"{user}@{EMAIL_DOMAIN}",
                FIRST_NAME=first, LAST_NAME=last, FULL_NAME=f"{first} {last}", INITIALS=first[0] + last[0],
                BUSINESS_UNIT="COMMERCIAL", ROLE_CODE=role,
                ROLE_TITLE="POVO Sales Representative" if is_rep else "Manager, Field Sales Enablement",
                ACCESS_LEVEL="Rep level, 1 territory" if is_rep else
                f"Team level, POVO team, {len(TERRITORIES)} territories",
                ACCESS_REGIONS="Northeast", HOME_TERRITORY_ID=home, IS_ACTIVE=True))

    # ---- one territory ---------------------------------------------------
    def _territory(self, cfg: dict, rep_id: str) -> None:
        tid = cfg["id"]
        accounts = self._accounts(cfg)
        modelled = self._targets(cfg, accounts)
        self._assign_hs_and_deciles(cfg, modelled)
        # D1 is outside the POVO target universe; an NP/PA always ranks below its physician,
        # so dropping D1 never orphans a D2-D10 NP/PA.
        targets = [t for t in modelled if t["decile"] >= TARGET_MIN_DECILE]
        kept = {id(t) for t in targets}
        assert all(t["parent"] is None or id(t["parent"]) in kept for t in targets), cfg["id"]
        monthly_goal = [max(1, round(goal_shape(k) * cfg["scale"])) for k in range(len(self.goal_months))]
        actual = self._monthly_actuals(cfg, monthly_goal)
        writers = self._writers(cfg, targets, actual)
        self._segments(cfg, targets)
        self._rep_calls(cfg, targets, rep_id)
        events = self._povo_events(cfg, targets, actual)
        self._other_interactions(cfg, targets)
        self._finish_targets(cfg, targets, accounts, events)
        self._goals(tid, monthly_goal)
        self.summary[tid] = dict(
            targets=len(targets),
            physicians=sum(t["role"] == "HCP" for t in targets),
            np_pa=sum(t["role"] != "HCP" for t in targets),
            accounts=len(accounts),
            writers=len(writers),
            jak_writers=sum(t["jak"] > 0 for t in writers),
            data_start=self.data_start.isoformat(),
            new_patients_in_window=sum(actual),
            goal_new_patients_to_year_end=sum(monthly_goal),
        )

    def _accounts(self, cfg: dict) -> list[dict]:
        out = []
        for name, city_state in cfg["accounts"] + cfg["claims_only"]:
            city, state = city_state.rsplit(", ", 1)
            out.append(dict(id=self._next_account_id(), name=name, city=city, state=state,
                            zip=CITY_ZIP[city_state], claims_only=(name, city_state) in cfg["claims_only"]))
        return out

    def _pick_name(self, rng: random.Random, used_last: set[str]) -> tuple[str, str]:
        """A first/last pair whose last name is new to the territory and full name new globally."""
        for _ in range(10000):
            last, first = rng.choice(LAST_NAMES), rng.choice(FIRST_NAMES)
            if last not in used_last and f"{first} {last}" not in self._used_full_names:
                used_last.add(last)
                self._used_full_names.add(f"{first} {last}")
                return first, last
        raise RuntimeError("name pool exhausted")

    def _targets(self, cfg: dict, accounts: list[dict]) -> list[dict]:
        """About 50 physicians plus NP/PA (0-2 each) adding up to 142 targets."""
        rng = self._rng("universe", cfg["id"])
        real = [a for a in accounts if not a["claims_only"]]
        used_last: set[str] = set()
        physicians: list[dict] = []

        def add_physician(first, last, degree, account, strength, npa_named):
            used_last.add(last)
            self._used_full_names.add(f"{first} {last}")
            physicians.append(dict(first=first, last=last, degree=degree, role="HCP", account=account,
                                   strength=strength, npa_named=npa_named, parent=None))

        for last, first, degree, acc_idx, strength, npa in cfg["named"]:
            add_physician(first, last, degree, real[acc_idx % len(real)], strength, npa)
        n_phys = rng.randint(50, 54)
        pad = list(cfg["pad"])
        while len(physicians) < n_phys:
            if pad:
                last, first = [p.strip() for p in pad.pop(0).split(",")]
            else:
                first, last = self._pick_name(rng, used_last)
            # Account weights favour the first (larger) practices, like the POC.
            acc = rng.choices(real, weights=[len(real) - i + 2 for i in range(len(real))])[0]
            add_physician(first, last, "DO" if rng.random() < 0.2 else "MD", acc,
                          rng.lognormvariate(math.log(12), 0.55), [])

        # NP/PA counts: named physicians keep their two; a few others get none.
        need = TARGETS_PER_TERRITORY - len(physicians)
        named_count = sum(1 for p in physicians if p["npa_named"])
        others = [p for p in physicians if not p["npa_named"]]
        rng.shuffle(others)
        remaining = need - 2 * named_count
        n_zero = max(0, min(rng.randint(3, 6), len(others) - math.ceil(remaining / 2)))
        pool = others[n_zero:]
        n_two = max(0, min(len(pool), remaining - len(pool)))
        n_one = remaining - 2 * n_two
        if n_one > len(pool) - n_two or n_one < 0:
            raise RuntimeError(f"{cfg['id']}: cannot place {remaining} NP/PA over {len(pool)} physicians")
        slots = {id(p): 2 for p in pool[:n_two]}
        slots.update({id(p): 1 for p in pool[n_two:n_two + n_one]})

        targets: list[dict] = []
        for p in physicians:
            targets.append(p)
            if p["npa_named"]:
                for full, role, strength in p["npa_named"]:
                    first, last = full.split(" ", 1)
                    used_last.add(last)
                    self._used_full_names.add(full)
                    targets.append(self._npa(p, first, last, role, strength))
            else:
                for j in range(slots.get(id(p), 0)):
                    first, last = self._pick_name(rng, used_last)
                    role = rng.choice(["NP", "PA"]) if j == 0 else ("PA" if targets[-1]["role"] == "NP" else "NP")
                    targets.append(self._npa(p, first, last, role, p["strength"] * rng.uniform(0.12, 0.45)))
        for t in targets:
            t["hcp_id"] = self._next_hcp_id()
            t["npi"] = npi_with_check_digit(f"1{rng.randint(10_000_000, 99_999_999)}")
        for t in targets:
            if t["parent"] is not None:
                t["parent_id"] = t["parent"]["hcp_id"]
        assert len(targets) == TARGETS_PER_TERRITORY
        return targets

    @staticmethod
    def _npa(parent: dict, first: str, last: str, role: str, strength: float) -> dict:
        return dict(first=first, last=last, degree=role, role=role, account=parent["account"],
                    strength=strength, npa_named=[], parent=parent)

    def _decile_counts(self, cfg: dict, rng: random.Random) -> list[int]:
        """POC split D10 -> D1, varied within +/-15% per decile; D1 absorbs the difference."""
        if cfg.get("keep_poc_deciles"):
            return list(POC_DECILE_TARGETS)
        counts = []
        for p in POC_DECILE_TARGETS[:-1]:
            tol = math.floor(p * 0.15)
            counts.append(p + rng.randint(-tol, tol))
        counts.append(TARGETS_PER_TERRITORY - sum(counts))
        return counts

    def _assign_hs_and_deciles(self, cfg: dict, targets: list[dict]) -> None:
        """Order targets by modelled strength, then hand out HS volumes and deciles top-down.

        The HS values come from the POC decile averages (+/-15%), so every
        territory reproduces the POC's "avg HS patients per decile" row.
        """
        rng = self._rng("hs", cfg["id"])
        counts = self._decile_counts(cfg, rng)
        values = []
        for n, avg in zip(counts, POC_DECILE_AVG_HS):
            for _ in range(n):
                values.append(rng.randint(3, 9) if avg == 6 else max(1, round(avg * rng.uniform(0.85, 1.15))))
        values.sort(reverse=True)
        ordered = sorted(targets, key=lambda t: (-t["strength"], t["hcp_id"]))
        deciles = [d for d, n in zip(DECILES, counts) for _ in range(n)]
        for rank, (t, hs, dec) in enumerate(zip(ordered, values, deciles), 1):
            t.update(hs=hs, decile=dec, hs_rank=rank,
                     visits=max(1, round(hs * rng.uniform(0.12, 0.22))))
            t["tier"] = next((c for c, _n, lo, hi, *_ in TIERS if lo <= dec <= hi), None)
        self._decile_targets = counts

    def _month_frac(self, k: int) -> float:
        """Share of the k-th window month's working days that have passed by the as-of date."""
        month_days = working_days(*month_bounds(self.months[k]), self.holidays)
        done = [d for d in month_days if d <= self.as_of]
        return len(done) / len(month_days) if month_days else 0

    def _monthly_actuals(self, cfg: dict, goal: list[int]) -> list[int]:
        """New patients per window month; the current month is pro-rated by working days."""
        rng = self._rng("actuals", cfg["id"], self.as_of)
        return [max(0, round(goal[k] * cfg["perf"] * rng.uniform(0.93, 1.07) * self._month_frac(k)))
                for k in range(len(self.months))]

    def _writer_slots(self, cfg: dict, rng: random.Random, actual: list[int]) -> tuple[list[int], list[int]]:
        """JAK and non-JAK first-time writers per month, with the POC buildSeg weights."""
        total_w = min(round(cfg["writers"] * rng.uniform(0.96, 1.04)), sum(actual))
        total_j = round(total_w * cfg["jak_share"])
        s = cfg["shape"]
        wj, wn = [], []
        for k, (_y, month) in enumerate(self.months):
            f, m = self._month_frac(k), month - 1
            wj.append((1 + k * 0.12 + ((m + s) % 3) * 0.08) * f)
            wn.append((1.1 - ((m + s) % 2) * 0.15 + k * 0.05) * f)
        return self._fit_slots(spread_lr(total_j, wj), spread_lr(total_w - total_j, wn), actual)

    @staticmethod
    def _fit_slots(jak: list[int], non: list[int], actual: list[int]) -> tuple[list[int], list[int]]:
        """Each month's first-time writers must fit in its new patients (a writer's first patient is one).

        Overflow moves to later months, then back to earlier ones; what cannot fit
        is dropped. The first month with patients must have a writer by then.
        """
        cj = cn = 0
        for m in range(len(actual)):
            jak[m] += cj
            non[m] += cn
            cj = cn = 0
            while jak[m] + non[m] > actual[m]:
                if non[m] >= jak[m] and non[m] > 0:
                    non[m] -= 1
                    cn += 1
                else:
                    jak[m] -= 1
                    cj += 1
        for m in reversed(range(len(actual))):
            while (cj or cn) and jak[m] + non[m] < actual[m]:
                if cj:
                    jak[m] += 1
                    cj -= 1
                else:
                    non[m] += 1
                    cn -= 1
        first = next((m for m, a in enumerate(actual) if a > 0), None)
        if first is not None and sum(jak[:first + 1]) + sum(non[:first + 1]) == 0:
            for k in range(first + 1, len(actual)):
                if jak[k] or non[k]:
                    if jak[k]:
                        jak[k] -= 1
                        jak[first] += 1
                    else:
                        non[k] -= 1
                        non[first] += 1
                    break
        return jak, non

    def _writers(self, cfg: dict, targets: list[dict], actual: list[int]) -> list[dict]:
        """Pick who writes POVO: decile split like the POC, JAK users, and the month each first wrote."""
        rng = self._rng("writers", cfg["id"], self.as_of)
        jak_slots, non_slots = self._writer_slots(cfg, rng, actual)
        total_w, total_j = sum(jak_slots) + sum(non_slots), sum(jak_slots)
        per_decile = self._decile_writer_counts(total_w)
        writers: list[dict] = []
        for dec, n in zip(DECILES, per_decile):
            members = [t for t in targets if t["decile"] == dec]
            writers += weighted_sample(rng, members, [t["hs"] for t in members], n)
        for t in targets:
            t["jak"] = 0
            t["writer"] = False
            t["first_month"] = None
        for t in writers:
            t["writer"] = True
        for t in weighted_sample(rng, writers, [t["hs"] for t in writers], total_j):
            t["jak"] = max(1, round(t["hs"] * rng.uniform(0.04, 0.10)))
        # Some non-writers are JAK users too (Must-Wins "HS Volume & JAK" list, Immediate segment).
        for t in targets:
            if not t["writer"]:
                p = 0.25 if t["decile"] >= 5 else (0.12 if t["decile"] >= 2 else 0.05)
                if rng.random() < p:
                    t["jak"] = max(1, round(t["hs"] * rng.uniform(0.04, 0.10)))
        # First-write month: JAK writers fill the JAK slots, the others the non-JAK slots.
        for group, slots in (([t for t in writers if t["jak"] > 0], jak_slots),
                             ([t for t in writers if t["jak"] == 0], non_slots)):
            months = [m for m, n in enumerate(slots) for _ in range(n)]
            rng.shuffle(group)
            for t, m in zip(group, months):
                t["first_month"] = m
        return writers

    def _decile_writer_counts(self, total_w: int) -> list[int]:
        counts = spread_lr(total_w, [float(w) for w in POC_DECILE_WRITERS])
        caps = self._decile_targets
        overflow = 0
        for i, c in enumerate(counts):
            if c > caps[i]:
                overflow += c - caps[i]
                counts[i] = caps[i]
        order = sorted(range(len(counts)), key=lambda i: -POC_DECILE_WRITERS[i])
        while overflow:
            for i in order:
                if counts[i] < caps[i]:
                    counts[i] += 1
                    overflow -= 1
                    break
        return counts

    def _segments(self, cfg: dict, targets: list[dict]) -> None:
        """HS treatment segment, competitive focus and specialty (POC enrich(), Step 3_63).

        Three exclusive groups: any JAK inhibitor use -> exp (Advanced Biologics plus
        JAK Inhibitors), else biologic use -> imm (Advanced without JAK Inhibitors),
        else conv (Conventional).
        """
        rng = self._rng("segments", cfg["id"], self.as_of)
        for t in targets:
            bio_p = 0.55 if t["decile"] >= 7 else (0.35 if t["decile"] >= 5 else 0.18)
            if t["jak"] > 0:
                t["segment"], t["focus"] = "exp", "jak"
            elif rng.random() < bio_p:
                r = rng.random()
                t["segment"] = "imm"
                t["focus"] = "humira" if r < 0.5 else ("cosentyx" if r < 0.8 else "bimzelx")
            else:
                t["segment"], t["focus"] = "conv", "conventional"
            spec_rng = self._rng("specialty", t["hcp_id"])
            if t["role"] != "HCP":
                t["specialty"] = "Dermatology"
            elif t["segment"] == "conv" and spec_rng.random() < 1 / 9:
                t["specialty"] = "General Surgery"
            else:
                t["specialty"] = "Dermatology"

    # ---- POVO activity ---------------------------------------------------
    def _month_days(self, k: int) -> list[dt.date]:
        """Working days of the k-th window month, up to the as-of date."""
        return [d for d in self.elapsed_days if (d.year, d.month) == self.months[k]]

    def _povo_events(self, cfg: dict, targets: list[dict], actual: list[int]) -> list[dict]:
        """NEW_PATIENT events that reproduce the monthly actuals, plus their PEF and NRX.

        Every converted patient has a PEF (3-21 working days earlier, never before
        the data start) and an NRX on the paid date. Pending patients (PEF only,
        some with an NRX) bring the totals to PEF ~ 1.36x and NRx ~ 1.2x new
        patients; their PEFs go to writers and to called Super High and Medium
        targets, so the PEFs of all targets add up to the territory's PEFs.
        """
        tid = cfg["id"]
        rng = self._rng("events", tid, self.as_of)
        writers = [t for t in targets if t["writer"]]
        for t in targets:
            t["povo"] = 0
            t["first_date"] = None
        for t in writers:
            days = self._month_days(t["first_month"])
            t["first_date"] = rng.choice(days)
        patients: list[tuple[dict, dt.date]] = [(t, t["first_date"]) for t in writers]
        for t in writers:
            t["povo"] = 1
        for m, total in enumerate(actual):
            firsts = sum(1 for t in writers if t["first_month"] == m)
            for _ in range(max(0, total - firsts)):
                t = self._pick_writer_for_month(rng, writers, m)
                if t is None:
                    break
                days = [d for d in self._month_days(m) if d >= t["first_date"]]
                patients.append((t, rng.choice(days)))
                t["povo"] += 1

        events: list[dict] = []
        idx = {d: i for i, d in enumerate(self.elapsed_days)}
        for n, (t, paid) in enumerate(patients):
            key = self._patient_key(tid, n)
            pef = self.elapsed_days[max(0, idx[paid] - rng.randint(3, 21))]
            events += [self._event(tid, t, key, pef, "PEF"), self._event(tid, t, key, paid, "NRX"),
                       self._event(tid, t, key, paid, "NEW_PATIENT")]
        n_new = len(patients)
        n_pending = round(n_new * (PEF_ACTUAL_FACTOR - 1))
        n_pending_nrx = round(n_new * (NRX_ACTUAL_FACTOR - 1))
        in_plan_nonwriters = [t for t in targets if not t["writer"] and t["tier"] in ("SH", "MED") and t["calls"]]
        for k in range(n_pending):
            pool = writers if (rng.random() < 0.7 or not in_plan_nonwriters) and writers else in_plan_nonwriters
            if not pool or not self.elapsed_days:
                break
            t = rng.choices(pool, weights=[p["hs"] for p in pool])[0]
            key = self._patient_key(tid, n_new + k)
            pef_i = rng.randrange(len(self.elapsed_days))
            events.append(self._event(tid, t, key, self.elapsed_days[pef_i], "PEF"))
            if k < n_pending_nrx:
                nrx_i = min(len(self.elapsed_days) - 1, pef_i + rng.randint(2, 10))
                events.append(self._event(tid, t, key, self.elapsed_days[nrx_i], "NRX"))
        events.sort(key=lambda e: (e["EVENT_DATE"], e["HCP_ID"], e["PATIENT_KEY"], e["EVENT_TYPE"] != "PEF"))
        for e in events:
            self._act_seq += 1
            e["ACTIVITY_ID"] = f"E{self._act_seq:07d}"
        self.tables["FCT_POVO_ACTIVITY"] += events
        return events

    @staticmethod
    def _pick_writer_for_month(rng: random.Random, writers: list[dict], m: int) -> dict | None:
        """A writer who had started by month m, weighted by HS; POVO patients stay below half the HS volume."""
        started = [t for t in writers if t["first_month"] is not None and t["first_month"] <= m]
        open_ = [t for t in started if t["povo"] < max(1, t["hs"] // 2)] or started
        if not open_:
            return None
        return rng.choices(open_, weights=[t["hs"] for t in open_])[0]

    def _patient_key(self, tid: str, n: int) -> str:
        """Opaque, non-reversible token; never derived from anything patient-identifying."""
        return "PK" + hashlib.sha256(f"{self.seed}|{tid}|{n}".encode()).hexdigest()[:14].upper()

    @staticmethod
    def _event(tid: str, t: dict, key: str, day: dt.date, kind: str) -> dict:
        return dict(ACTIVITY_ID=None, TERRITORY_ID=tid, HCP_ID=t["hcp_id"], PATIENT_KEY=key,
                    EVENT_DATE=day, EVENT_TYPE=kind)

    # ---- interactions ----------------------------------------------------
    def _rep_calls(self, cfg: dict, targets: list[dict], rep_id: str) -> None:
        """Rep calls per tier = targets x calls/yr x share of the year in the window x attainment.

        Reach follows the tier reach factor; a new POVO writer has always been
        called, so reach is never below the writers. A few Super High / Medium
        targets are left without a call for 22-50 days (the "missed
        opportunities"), and the lowest-priority ones are never called.
        """
        rng = self._rng("calls", cfg["id"], self.as_of)
        for t in targets:
            t["calls"] = []
        if not self.elapsed_days:
            return
        plan: list[tuple[dict, int, str]] = []
        for code, _n, _lo, _hi, per_year, _goal, attain, reach in TIERS:
            # Never-called targets are mostly the lower-volume ones (noisy HS ordering, like the POC).
            members = sorted([t for t in targets if t["tier"] == code],
                             key=lambda t: (not t["writer"], -t["hs"] * rng.uniform(0.5, 1.5)))
            n_writers = sum(1 for t in members if t["writer"])
            total = round(len(members) * per_year * self.elapsed_frac * attain * rng.uniform(0.96, 1.04))
            n_reach = max(n_writers, min(round(len(members) * reach), total))
            total = max(total, n_reach)
            reached = members[:n_reach]
            extra = spread_lr(total - len(reached), [math.sqrt(t["hs"]) for t in reached])
            plan += [(t, 1 + e, code) for t, e in zip(reached, extra)]
        stale_ids = self._stale_targets(rng, [t for t, _n, code in plan])
        for t, n, code in plan:
            t["calls"] = self._call_dates(rng, n, t["hcp_id"] in stale_ids, code in ("SH", "MED"))
        for t in targets:
            for day in t["calls"]:
                discussed = rng.random() < 0.85
                summary = rng.choice(REP_SUMMARIES if discussed else REP_NOT_DISCUSSED)
                self._interaction(cfg["id"], t, rep_id, day, "rep", discussed, summary)

    def _stale_targets(self, rng: random.Random, targets: list[dict]) -> set[str]:
        pool = [t for t in targets if t["tier"] in ("SH", "MED")]
        return {t["hcp_id"] for t in rng.sample(pool, min(len(pool), rng.randint(3, 5)))}

    def _call_dates(self, rng: random.Random, n: int, stale: bool, keep_fresh: bool) -> list[dt.date]:
        """n distinct working days; the last one placed to make the target fresh or stale."""
        days = self.elapsed_days
        if stale:
            window = [d for d in days if 22 <= (self.as_of - d).days <= 50]
        elif keep_fresh:
            window = [d for d in days if (self.as_of - d).days <= 20]
        else:
            window = days
        if not window:
            window = days
        last = rng.choice(window)
        before = [d for d in days if d < last]
        picked = rng.sample(before, min(n - 1, len(before)))
        return sorted(picked + [last])

    def _other_interactions(self, cfg: dict, targets: list[dict]) -> None:
        """4-6 non-rep interactions per physician; everyone attends at least one speaker program."""
        rng = self._rng("other", cfg["id"], self.as_of)
        if not self.elapsed_days:
            return
        # Speaker programs are events: several physicians attend the same evening.
        programs = sorted(rng.sample(self.elapsed_days, min(8, len(self.elapsed_days))))
        topics = {d: rng.choice(SPEAKER_TOPICS) for d in programs}
        for t in (t for t in targets if t["role"] == "HCP"):
            n = rng.randint(4, 6)
            channels = ["spkr"] + rng.sample(["adfa", "opz", "msl", "pr"], min(4, n - 1))
            while len(channels) < n:
                channels.append(rng.choice(["adfa", "msl", "pr", "spkr"]))
            for ch in channels:
                if ch == "spkr":
                    day = rng.choice(programs)
                    summary = f"Attended {topics[day]}"
                else:
                    # Weighted toward recent months so the latest cards feel current.
                    day = self.elapsed_days[int(len(self.elapsed_days) * (1 - rng.random() ** 1.8))
                                            if len(self.elapsed_days) > 1 else 0]
                    day = min(day, self.elapsed_days[-1])
                    summary = rng.choice(OTHER_SUMMARIES[ch])
                self._interaction(cfg["id"], t, None, day, ch, OTHER_DISCUSSED[ch], summary)

    def _interaction(self, tid, t, emp_id, day, channel, discussed, summary) -> None:
        self._ix_seq += 1
        self.tables["FCT_INTERACTION"].append(dict(
            INTERACTION_ID=f"I{self._ix_seq:07d}", HCP_ID=t["hcp_id"], TERRITORY_ID=tid, EMPLOYEE_ID=emp_id,
            INTERACTION_DATE=day, CHANNEL_CODE=channel, INTERACTION_TYPE=INTERACTION_TYPES[channel],
            POVO_DISCUSSED=discussed, SUMMARY=summary))

    # ---- final rows ------------------------------------------------------
    def _finish_targets(self, cfg: dict, targets: list[dict], accounts: list[dict], events: list[dict]) -> None:
        tid = cfg["id"]
        pef_patients: dict[str, set[str]] = {}
        new_patients: dict[str, int] = {}
        for e in events:
            if e["EVENT_TYPE"] == "PEF":
                pef_patients.setdefault(e["HCP_ID"], set()).add(e["PATIENT_KEY"])
            elif e["EVENT_TYPE"] == "NEW_PATIENT":
                new_patients[e["HCP_ID"]] = new_patients.get(e["HCP_ID"], 0) + 1
        for t in targets:
            acc = t["account"]
            self.tables["DIM_HCP"].append(dict(
                HCP_ID=t["hcp_id"], NPI=t["npi"], FIRST_NAME=t["first"], LAST_NAME=t["last"],
                DEGREE=t["degree"], ROLE_TYPE=t["role"], SPECIALTY=t["specialty"], ACCOUNT_ID=acc["id"],
                PARENT_HCP_ID=t.get("parent_id"), TERRITORY_ID=tid, CITY=acc["city"], STATE=acc["state"],
                ZIP=acc["zip"]))
            self.tables["FCT_HCP_METRICS"].append(dict(
                HCP_ID=t["hcp_id"], AS_OF_DATE=self.as_of, HS_PATIENTS_12M=t["hs"],
                HS_VISITS_PER_MONTH=t["visits"], JAK_PATIENTS=t["jak"],
                POVO_PATIENTS=new_patients.get(t["hcp_id"], 0),
                INCYTECARES_ENROLLED_PATIENTS=len(pef_patients.get(t["hcp_id"], ()))))
            self.tables["DIM_CALL_PLAN_TARGET"].append(dict(
                PLAN_YEAR=self.year, TERRITORY_ID=tid, HCP_ID=t["hcp_id"], DECILE=t["decile"],
                TIER_CODE=t["tier"], SEGMENT_CODE=t["segment"], COMPETITIVE_FOCUS=t["focus"],
                IS_IN_CALL_PLAN=t["decile"] >= 2, HS_RANK=t["hs_rank"]))
        self._account_rows(cfg, targets, accounts, new_patients)

    def _account_rows(self, cfg, targets, accounts, new_patients) -> None:
        rng = self._rng("accounts", cfg["id"])
        for a in accounts:
            members = [t for t in targets if t["account"] is a]
            if a["claims_only"]:
                hs, povo, focus = rng.randint(18, 60), 0, rng.choice(["conventional", "humira", "cosentyx"])
            else:
                phys_hs = sum(t["hs"] for t in members if t["role"] == "HCP")
                hs = round(phys_hs * rng.uniform(1.05, 1.25))
                povo = sum(new_patients.get(t["hcp_id"], 0) for t in members)
                by_focus: dict[str, int] = {}
                for t in members:
                    by_focus[t["focus"]] = by_focus.get(t["focus"], 0) + t["hs"]
                focus = max(sorted(by_focus), key=lambda f: by_focus[f]) if by_focus else "conventional"
            self.tables["DIM_ACCOUNT"].append(dict(
                ACCOUNT_ID=a["id"], TERRITORY_ID=cfg["id"], ACCOUNT_NAME=a["name"], CITY=a["city"],
                STATE=a["state"], ZIP=a["zip"], CLAIMS_HS_PATIENTS=hs, CLAIMS_POVO_PATIENTS=povo,
                CLAIMS_MAIN_FOCUS=focus, IS_CLAIMS_ONLY=a["claims_only"]))

    def _goals(self, tid: str, monthly_goal: list[int]) -> None:
        """Monthly goals from the data-start month to December; no goal before the data start."""
        for (year, month), g in zip(self.goal_months, monthly_goal):
            for code, value in (("NEW_PATIENTS", g), ("PEF", round(g * PEF_GOAL_FACTOR)),
                                ("NRX", round(g * NRX_GOAL_FACTOR))):
                self.tables["FCT_TERRITORY_GOAL"].append(dict(
                    TERRITORY_ID=tid, GOAL_YEAR=year, GOAL_MONTH=month, METRIC_CODE=code, GOAL_VALUE=value))


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------
def csv_value(v: Any) -> str:
    """CSV contract: booleans true/false, dates ISO, NULL = empty, lists comma-joined."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (dt.date, dt.datetime)):
        return v.isoformat()
    if isinstance(v, (list, tuple)):
        return ",".join(str(x) for x in v)
    if isinstance(v, dict):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


def write_csv(path: Path, columns: list[str], rows: Iterable[dict]) -> int:
    n = 0
    with path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(columns)
        for row in rows:
            w.writerow([csv_value(row.get(c)) for c in columns])
            n += 1
    return n


def copy_content(content_dir: Path, out: Path) -> dict[str, Any]:
    """Copy the backend-owned content JSON into CSVs unchanged; warn and skip missing files."""
    result: dict[str, Any] = {}
    for table, filename in CONTENT_FILES.items():
        src = content_dir / filename
        if not src.exists():
            print(f"WARN  {src} not found; {table}.csv skipped (the backend owns this file)", file=sys.stderr)
            result[table] = "skipped: missing"
            continue
        rows = json.loads(src.read_text(encoding="utf-8"))
        if not isinstance(rows, list):
            raise ValueError(f"{src} must hold a JSON array of objects")
        cols = COLUMNS[table]
        missing = sorted({c for r in rows for c in cols if c not in r})
        extra = sorted({k for r in rows for k in r if k not in cols})
        if missing:
            print(f"WARN  {filename}: columns missing in some rows (written as NULL): {', '.join(missing)}",
                  file=sys.stderr)
        if extra:
            print(f"WARN  {filename}: keys not in {table} ignored: {', '.join(extra)}", file=sys.stderr)
        result[table] = write_csv(out / f"{table}.csv", cols, rows)
    return result


def generate(out: Path, as_of: dt.date, seed: int = DEFAULT_SEED,
             content_dir: Path = DEFAULT_CONTENT) -> dict[str, Any]:
    """Generate every CSV and the manifest; returns the manifest."""
    out.mkdir(parents=True, exist_ok=True)
    gen = SeedGenerator(as_of, seed)
    tables = gen.build()
    counts: dict[str, int] = {}
    for table, rows in tables.items():
        if table in CONTENT_FILES:
            continue
        counts[table] = write_csv(out / f"{table}.csv", COLUMNS[table], rows)
    content = copy_content(content_dir, out)
    counts.update({t: n for t, n in content.items() if isinstance(n, int)})
    manifest = dict(
        as_of=as_of.isoformat(), data_start=gen.data_start.isoformat(), seed=seed, plan_year=as_of.year,
        generated_at=dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        row_counts=dict(sorted(counts.items())), content=content, territories=gen.summary)
    (out / "_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Generate POVO AI Guidance bronze seed CSVs.")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT, help=f"output folder (default {DEFAULT_OUT})")
    p.add_argument("--as-of", type=dt.date.fromisoformat, default=None,
                   help="data as-of date YYYY-MM-DD (default today in America/New_York)")
    p.add_argument("--seed", type=int, default=DEFAULT_SEED, help=f"random seed (default {DEFAULT_SEED})")
    p.add_argument("--content-dir", type=Path, default=DEFAULT_CONTENT, help="folder with the content JSON files")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    as_of = args.as_of or today_new_york()
    manifest = generate(args.out, as_of, args.seed, args.content_dir)
    print(f"as_of {manifest['as_of']}  seed {manifest['seed']}  ->  {args.out}")
    for table, n in manifest["row_counts"].items():
        print(f"  {table:<24} {n:>7,}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
