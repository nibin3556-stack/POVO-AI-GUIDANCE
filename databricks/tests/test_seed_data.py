"""Consistency rules of the seed data (ARCHITECTURE.md section 4.1).

The generator runs in-process into a temp folder with a fixed as-of date and
seed, and every assertion reads the CSVs back, exactly as the backend and the
loader will. Standard library + pytest only.

    python -m pytest databricks/tests -q
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import importlib.util
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pytest

DATABRICKS = Path(__file__).resolve().parents[1]
AS_OF = dt.date(2026, 10, 13)   # the POC demo date
SEED = 42


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


gen = _load("generate_seed_data", DATABRICKS / "seed" / "generate_seed_data.py")
sys.path.insert(0, str(DATABRICKS / "scripts"))
common = _load("_common", DATABRICKS / "scripts" / "_common.py")
loader = _load("load_seed_data", DATABRICKS / "scripts" / "load_seed_data.py")


def read(out: Path, table: str) -> list[dict]:
    with (out / f"{table}.csv").open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


@pytest.fixture(scope="module")
def out(tmp_path_factory) -> Path:
    path = tmp_path_factory.mktemp("seed")
    gen.generate(path, AS_OF, SEED, content_dir=path / "no-content")
    return path


@pytest.fixture(scope="module")
def data(out) -> dict[str, list[dict]]:
    return {t: read(out, t) for t in gen.COLUMNS if (out / f"{t}.csv").exists()}


def date(s: str) -> dt.date:
    return dt.date.fromisoformat(s)


# ---- files and contract ---------------------------------------------------
def test_csv_headers_match_ddl(out):
    ddl = common.bronze_tables()
    assert set(gen.COLUMNS) == set(ddl)
    for table, cols in gen.COLUMNS.items():
        assert cols == [c for c, _ in ddl[table]], table
        if (out / f"{table}.csv").exists():
            with (out / f"{table}.csv").open(encoding="utf-8") as fh:
                assert next(csv.reader(fh)) == cols


def test_every_csv_casts_to_ddl_types(out):
    """The loader must be able to read every generated file with the DDL types."""
    for table, cols in common.bronze_tables().items():
        if (out / f"{table}.csv").exists():
            loader.read_csv(out / f"{table}.csv", cols)


def test_manifest_counts(out, data):
    m = json.loads((out / "_manifest.json").read_text(encoding="utf-8"))
    assert m["as_of"] == AS_OF.isoformat() and m["seed"] == SEED
    for table, n in m["row_counts"].items():
        assert len(data[table]) == n
    assert m["content"]["REF_TALKING_POINT"].startswith("skipped")


def test_deterministic(out, tmp_path):
    gen.generate(tmp_path, AS_OF, SEED, content_dir=tmp_path / "none")
    for table in gen.COLUMNS:
        a, b = out / f"{table}.csv", tmp_path / f"{table}.csv"
        if a.exists():
            assert hashlib.sha256(a.read_bytes()).digest() == hashlib.sha256(b.read_bytes()).digest(), table


def test_booleans_and_dates_format(data):
    for row in data["DIM_EMPLOYEE"]:
        assert row["IS_ACTIVE"] in ("true", "false")
    for row in data["FCT_INTERACTION"][:200]:
        assert row["POVO_DISCUSSED"] in ("true", "false")
        date(row["INTERACTION_DATE"])


# ---- territories and employees -------------------------------------------
def test_eight_territories(data):
    ids = [r["TERRITORY_ID"] for r in data["DIM_TERRITORY"]]
    assert len(ids) == 8 and len(set(ids)) == 8
    assert "NE-POR" in ids
    names = {r["TERRITORY_NAME"] for r in data["DIM_TERRITORY"]}
    for city in ("Portland, ME", "Boston, MA", "Hartford, CT", "Providence, RI", "Manchester, NH",
                 "Burlington, VT", "Worcester, MA", "Springfield, MA"):
        assert f"{city} territory" in names


def test_named_employees(data):
    emp = {r["EMPLOYEE_ID"]: r for r in data["DIM_EMPLOYEE"]}
    by_user = {r["USERNAME"]: r for r in data["DIM_EMPLOYEE"]}
    assert by_user["vturano"]["FULL_NAME"] == "Vince Turano"
    assert by_user["vturano"]["HOME_TERRITORY_ID"] == "NE-POR" and by_user["vturano"]["ROLE_CODE"] == "REP"
    dana, luis, barb = emp["p250611"], emp["p250702"], emp["p250544"]
    assert (dana["FULL_NAME"], dana["NETWORK_ID"], dana["HOME_TERRITORY_ID"]) == ("Dana Whitaker", "3418", "NE-HFD")
    assert (luis["FULL_NAME"], luis["NETWORK_ID"], luis["HOME_TERRITORY_ID"]) == ("Luis Ortega", "3526", "NE-PVD")
    assert (barb["FULL_NAME"], barb["NETWORK_ID"], barb["USERNAME"]) == ("Barbara Drake", "3351", "bdrake")
    assert barb["ROLE_CODE"] == "MANAGER" and barb["HOME_TERRITORY_ID"] == "NE-BOS"
    assert barb["ROLE_TITLE"] == "Manager, Field Sales Enablement"


def test_employee_ids_unique_and_one_rep_per_territory(data):
    rows = data["DIM_EMPLOYEE"]
    for col in ("EMPLOYEE_ID", "NETWORK_ID", "USERNAME", "EMAIL"):
        assert len({r[col] for r in rows}) == len(rows), col
    reps = Counter(r["HOME_TERRITORY_ID"] for r in rows if r["ROLE_CODE"] == "REP")
    assert len(reps) == 8 and set(reps.values()) == {1}
    assert sum(r["ROLE_CODE"] == "MANAGER" for r in rows) == 2
    territories = {r["TERRITORY_ID"] for r in data["DIM_TERRITORY"]}
    assert all(r["HOME_TERRITORY_ID"] in territories for r in rows)


# ---- HCPs, accounts, targets ---------------------------------------------
def test_targets_per_territory_and_decile_split(data):
    by_t = defaultdict(Counter)
    for r in data["DIM_CALL_PLAN_TARGET"]:
        by_t[r["TERRITORY_ID"]][int(r["DECILE"])] += 1
    assert len(by_t) == 8
    for tid, counts in by_t.items():
        assert sum(counts.values()) == 142, tid
        for dec, poc in zip(gen.DECILES, gen.POC_DECILE_TARGETS):
            assert abs(counts[dec] - poc) <= 0.15 * poc, (tid, dec, counts[dec], poc)


def test_tiers_and_call_plan(data):
    for r in data["DIM_CALL_PLAN_TARGET"]:
        d = int(r["DECILE"])
        expected = "SH" if d >= 7 else "MED" if d >= 5 else "LOW" if d >= 2 else ""
        assert r["TIER_CODE"] == expected
        assert r["IS_IN_CALL_PLAN"] == ("true" if d >= 2 else "false")
        assert r["SEGMENT_CODE"] in ("imm", "conv", "exp")
        assert r["COMPETITIVE_FOCUS"] in ("cosentyx", "bimzelx", "humira", "jak", "conventional")
        assert int(r["PLAN_YEAR"]) == AS_OF.year


def test_hcp_foreign_keys(data):
    accounts = {r["ACCOUNT_ID"]: r for r in data["DIM_ACCOUNT"]}
    hcps = {r["HCP_ID"]: r for r in data["DIM_HCP"]}
    assert len(hcps) == len(data["DIM_HCP"])
    territories = {r["TERRITORY_ID"] for r in data["DIM_TERRITORY"]}
    for h in hcps.values():
        acc = accounts[h["ACCOUNT_ID"]]
        assert h["TERRITORY_ID"] in territories
        assert acc["TERRITORY_ID"] == h["TERRITORY_ID"]
        assert acc["IS_CLAIMS_ONLY"] == "false"
        assert (h["CITY"], h["STATE"], h["ZIP"]) == (acc["CITY"], acc["STATE"], acc["ZIP"])
        assert len(h["ZIP"]) == 5 and len(h["NPI"]) == 10
    for table in ("DIM_CALL_PLAN_TARGET", "FCT_HCP_METRICS", "FCT_INTERACTION", "FCT_POVO_ACTIVITY"):
        for r in data[table]:
            assert r["HCP_ID"] in hcps, table
            if "TERRITORY_ID" in r:
                assert r["TERRITORY_ID"] == hcps[r["HCP_ID"]]["TERRITORY_ID"], table


def test_np_pa_have_physician_parent(data):
    hcps = {r["HCP_ID"]: r for r in data["DIM_HCP"]}
    children = Counter()
    for h in hcps.values():
        if h["ROLE_TYPE"] == "HCP":
            assert h["PARENT_HCP_ID"] == "" and h["DEGREE"] in ("MD", "DO")
        else:
            assert h["ROLE_TYPE"] in ("NP", "PA") and h["DEGREE"] == h["ROLE_TYPE"]
            parent = hcps[h["PARENT_HCP_ID"]]
            assert parent["ROLE_TYPE"] == "HCP"
            assert parent["TERRITORY_ID"] == h["TERRITORY_ID"] and parent["ACCOUNT_ID"] == h["ACCOUNT_ID"]
            children[h["PARENT_HCP_ID"]] += 1
    assert max(children.values()) <= 2
    per_t = Counter(h["TERRITORY_ID"] for h in hcps.values() if h["ROLE_TYPE"] == "HCP")
    assert all(48 <= n <= 56 for n in per_t.values()), per_t


def test_accounts_per_territory(data):
    by_t = defaultdict(list)
    for a in data["DIM_ACCOUNT"]:
        by_t[a["TERRITORY_ID"]].append(a)
    hcp_accounts = {h["ACCOUNT_ID"] for h in data["DIM_HCP"]}
    for tid, rows in by_t.items():
        claims_only = [a for a in rows if a["IS_CLAIMS_ONLY"] == "true"]
        assert len(claims_only) == 2, tid
        assert 6 <= len(rows) - 2 <= 8, tid
        assert not any(a["ACCOUNT_ID"] in hcp_accounts for a in claims_only)
        assert all(int(a["CLAIMS_HS_PATIENTS"]) > 0 for a in claims_only)


def test_portland_uses_poc_names(data):
    por = {(h["LAST_NAME"], h["FIRST_NAME"]) for h in data["DIM_HCP"] if h["TERRITORY_ID"] == "NE-POR"}
    for name in (("Winters", "John"), ("Sprague", "Marcia"), ("Berg", "Daniel"), ("Casey", "Kristen")):
        assert name in por
    winters = next(h for h in data["DIM_HCP"] if h["LAST_NAME"] == "Winters")
    target = next(t for t in data["DIM_CALL_PLAN_TARGET"] if t["HCP_ID"] == winters["HCP_ID"])
    assert target["DECILE"] == "10" and target["HS_RANK"] == "1"


def test_hs_rank_orders_hs_volume(data):
    hs = {m["HCP_ID"]: int(m["HS_PATIENTS_12M"]) for m in data["FCT_HCP_METRICS"]}
    by_t = defaultdict(list)
    for t in data["DIM_CALL_PLAN_TARGET"]:
        by_t[t["TERRITORY_ID"]].append(t)
    for tid, rows in by_t.items():
        rows.sort(key=lambda r: int(r["HS_RANK"]))
        assert [int(r["HS_RANK"]) for r in rows] == list(range(1, 143)), tid
        vols = [hs[r["HCP_ID"]] for r in rows]
        assert vols == sorted(vols, reverse=True), tid
        decs = [int(r["DECILE"]) for r in rows]
        assert decs == sorted(decs, reverse=True), tid


# ---- POVO activity ---------------------------------------------------------
def test_povo_patients_equal_new_patient_events(data):
    new = Counter(e["HCP_ID"] for e in data["FCT_POVO_ACTIVITY"] if e["EVENT_TYPE"] == "NEW_PATIENT")
    for m in data["FCT_HCP_METRICS"]:
        assert int(m["POVO_PATIENTS"]) == new.get(m["HCP_ID"], 0), m["HCP_ID"]
        assert int(m["POVO_PATIENTS"]) <= int(m["INCYTECARES_ENROLLED_PATIENTS"])
        assert int(m["JAK_PATIENTS"]) <= int(m["HS_PATIENTS_12M"])
        assert m["AS_OF_DATE"] == AS_OF.isoformat()


def test_funnel_ratios(data):
    for tid in {t["TERRITORY_ID"] for t in data["DIM_TERRITORY"]}:
        ev = Counter(e["EVENT_TYPE"] for e in data["FCT_POVO_ACTIVITY"] if e["TERRITORY_ID"] == tid)
        n = ev["NEW_PATIENT"]
        assert n > 0
        assert abs(ev["NRX"] / n - 1.2) < 0.03, (tid, ev)
        assert abs(ev["PEF"] / n - 1.36) < 0.03, (tid, ev)


def test_patient_funnel_order_and_opaque_keys(data):
    by_patient = defaultdict(dict)
    for e in data["FCT_POVO_ACTIVITY"]:
        by_patient[e["PATIENT_KEY"]].setdefault(e["EVENT_TYPE"], []).append(date(e["EVENT_DATE"]))
        assert e["PATIENT_KEY"].startswith("PK") and len(e["PATIENT_KEY"]) == 16
    for key, ev in by_patient.items():
        assert all(len(v) == 1 for v in ev.values()), key
        if "NEW_PATIENT" in ev:
            assert ev["PEF"][0] <= ev["NRX"][0] <= ev["NEW_PATIENT"][0]


def test_writers_about_44_and_jak_share(data):
    metrics = {m["HCP_ID"]: m for m in data["FCT_HCP_METRICS"]}
    by_t = defaultdict(list)
    for h in data["DIM_HCP"]:
        by_t[h["TERRITORY_ID"]].append(metrics[h["HCP_ID"]])
    for tid, rows in by_t.items():
        writers = [m for m in rows if int(m["POVO_PATIENTS"]) > 0]
        jak = [m for m in writers if int(m["JAK_PATIENTS"]) > 0]
        assert 34 <= len(writers) <= 54, (tid, len(writers))
        assert 0.5 <= len(jak) / len(writers) <= 0.72, (tid, len(jak), len(writers))


def test_new_writers_spread_through_the_year(data):
    first = {}
    for e in data["FCT_POVO_ACTIVITY"]:
        if e["EVENT_TYPE"] == "NEW_PATIENT" and e["TERRITORY_ID"] == "NE-POR":
            d = date(e["EVENT_DATE"])
            first[e["HCP_ID"]] = min(first.get(e["HCP_ID"], d), d)
    per_month = Counter(d.month for d in first.values())
    assert all(per_month[m] >= 1 for m in range(1, AS_OF.month)), per_month
    assert max(per_month.values()) <= 10


def test_goals_full_year_poc_shape(data):
    goals = defaultdict(dict)
    for g in data["FCT_TERRITORY_GOAL"]:
        goals[(g["TERRITORY_ID"], g["METRIC_CODE"])][int(g["GOAL_MONTH"])] = int(g["GOAL_VALUE"])
    assert len(goals) == 8 * 3
    por = goals[("NE-POR", "NEW_PATIENTS")]
    assert [por[m] for m in range(1, 13)] == gen.POC_GOAL_SHAPE
    for (tid, code), months in goals.items():
        assert sorted(months) == list(range(1, 13))
        if code != "NEW_PATIENTS":
            base = goals[(tid, "NEW_PATIENTS")]
            factor = 1.4 if code == "PEF" else 1.25
            assert all(months[m] == round(base[m] * factor) for m in months)


def _working_days(start, end, holidays):
    return gen.working_days(start, end, holidays)


def test_some_territories_on_track_and_some_at_risk(data):
    """POC rule: on track when YTD actual >= goals of elapsed months + pro-rated current month."""
    holidays = {date(h["HOLIDAY_DATE"]) for h in data["REF_US_HOLIDAY"]}
    goal = defaultdict(dict)
    for g in data["FCT_TERRITORY_GOAL"]:
        if g["METRIC_CODE"] == "NEW_PATIENTS":
            goal[g["TERRITORY_ID"]][int(g["GOAL_MONTH"])] = int(g["GOAL_VALUE"])
    month_start = AS_OF.replace(day=1)
    month_end = dt.date(AS_OF.year, AS_OF.month + 1, 1) - dt.timedelta(days=1)
    frac = len(_working_days(month_start, AS_OF, holidays)) / len(_working_days(month_start, month_end, holidays))
    status = {}
    for tid, g in goal.items():
        due = round(sum(g[m] for m in range(1, AS_OF.month)) + g[AS_OF.month] * frac)
        actual = sum(1 for e in data["FCT_POVO_ACTIVITY"]
                     if e["TERRITORY_ID"] == tid and e["EVENT_TYPE"] == "NEW_PATIENT")
        status[tid] = actual >= due
    assert any(status.values()) and not all(status.values()), status


# ---- interactions ----------------------------------------------------------
def test_no_future_dates(data):
    for e in data["FCT_POVO_ACTIVITY"]:
        assert dt.date(AS_OF.year, 1, 1) <= date(e["EVENT_DATE"]) <= AS_OF
    for i in data["FCT_INTERACTION"]:
        assert dt.date(AS_OF.year, 1, 1) <= date(i["INTERACTION_DATE"]) <= AS_OF


def test_interaction_channels(data):
    types = {"rep": "Direct call", "adfa": "ADFA visit", "opz": "Opz Sales call",
             "msl": "MSL visit", "spkr": "Speaker program", "pr": "PR visit"}
    reps = {r["HOME_TERRITORY_ID"]: r["EMPLOYEE_ID"] for r in data["DIM_EMPLOYEE"] if r["ROLE_CODE"] == "REP"}
    for i in data["FCT_INTERACTION"]:
        assert types[i["CHANNEL_CODE"]] == i["INTERACTION_TYPE"]
        assert i["SUMMARY"]
        if i["CHANNEL_CODE"] == "rep":
            assert i["EMPLOYEE_ID"] == reps[i["TERRITORY_ID"]]
        else:
            assert i["EMPLOYEE_ID"] == ""
    assert len({i["INTERACTION_ID"] for i in data["FCT_INTERACTION"]}) == len(data["FCT_INTERACTION"])


def test_non_rep_interactions_per_physician(data):
    counts = Counter(i["HCP_ID"] for i in data["FCT_INTERACTION"] if i["CHANNEL_CODE"] != "rep")
    speaker = {i["HCP_ID"] for i in data["FCT_INTERACTION"] if i["CHANNEL_CODE"] == "spkr"}
    for h in data["DIM_HCP"]:
        if h["ROLE_TYPE"] == "HCP":
            assert 4 <= counts[h["HCP_ID"]] <= 6, h["HCP_ID"]
            assert h["HCP_ID"] in speaker


def _last_rep_call(data):
    last = {}
    for i in data["FCT_INTERACTION"]:
        if i["CHANNEL_CODE"] == "rep":
            d = date(i["INTERACTION_DATE"])
            last[i["HCP_ID"]] = max(last.get(i["HCP_ID"], d), d)
    return last


def test_missed_opportunities_and_never_called(data):
    last = _last_rep_call(data)
    by_t = defaultdict(list)
    for t in data["DIM_CALL_PLAN_TARGET"]:
        by_t[t["TERRITORY_ID"]].append(t)
    for tid, rows in by_t.items():
        stale = [t for t in rows if t["TIER_CODE"] in ("SH", "MED") and t["HCP_ID"] in last
                 and (AS_OF - last[t["HCP_ID"]]).days > 21]
        never = [t for t in rows if t["IS_IN_CALL_PLAN"] == "true" and t["HCP_ID"] not in last]
        assert len(stale) >= 2, tid
        assert len(never) >= 1, tid
        assert all(t["HCP_ID"] not in last for t in rows if t["DECILE"] == "1"), tid


def test_calls_follow_tier_rates_and_reach(data):
    holidays = {date(h["HOLIDAY_DATE"]) for h in data["REF_US_HOLIDAY"]}
    year = _working_days(dt.date(AS_OF.year, 1, 1), dt.date(AS_OF.year, 12, 31), holidays)
    elapsed = sum(d <= AS_OF for d in year) / len(year)
    calls = Counter(i["HCP_ID"] for i in data["FCT_INTERACTION"] if i["CHANNEL_CODE"] == "rep")
    for code, _n, _lo, _hi, per_year, _goal, attain, reach in gen.TIERS:
        for tid in {t["TERRITORY_ID"] for t in data["DIM_TERRITORY"]}:
            members = [t["HCP_ID"] for t in data["DIM_CALL_PLAN_TARGET"]
                       if t["TERRITORY_ID"] == tid and t["TIER_CODE"] == code]
            planned = len(members) * per_year * elapsed
            execution = sum(calls[h] for h in members) / planned
            reached = sum(1 for h in members if calls[h]) / len(members)
            assert abs(execution - attain) < 0.08, (tid, code, execution)
            assert abs(reached - reach) < 0.12, (tid, code, reached)


# ---- reference tables ------------------------------------------------------
def test_reference_tables(data):
    tiers = {t["TIER_CODE"]: t for t in data["REF_TIER"]}
    assert tiers["SH"]["CALLS_PER_YEAR"] == "40" and tiers["LOW"]["REACH_GOAL_PCT"] == "75"
    assert {s["SEGMENT_CODE"] for s in data["REF_SEGMENT"]} == {"imm", "conv", "exp"}
    assert len(data["REF_COMPETITIVE_FOCUS"]) == 5
    years = {date(h["HOLIDAY_DATE"]).year for h in data["REF_US_HOLIDAY"]}
    assert {AS_OF.year, AS_OF.year + 1} <= years
    assert date("2026-07-03") in {date(h["HOLIDAY_DATE"]) for h in data["REF_US_HOLIDAY"]}


# ---- edge cases -------------------------------------------------------------
@pytest.mark.parametrize("as_of", [dt.date(2026, 1, 2), dt.date(2026, 2, 16), dt.date(2027, 6, 30)])
def test_other_as_of_dates(tmp_path, as_of):
    gen.generate(tmp_path, as_of, SEED, content_dir=tmp_path / "none")
    targets = read(tmp_path, "DIM_CALL_PLAN_TARGET")
    assert len(targets) == 8 * 142
    for e in read(tmp_path, "FCT_POVO_ACTIVITY"):
        assert date(e["EVENT_DATE"]) <= as_of
    for i in read(tmp_path, "FCT_INTERACTION"):
        assert date(i["INTERACTION_DATE"]) <= as_of
    new = Counter(e["HCP_ID"] for e in read(tmp_path, "FCT_POVO_ACTIVITY") if e["EVENT_TYPE"] == "NEW_PATIENT")
    for m in read(tmp_path, "FCT_HCP_METRICS"):
        assert int(m["POVO_PATIENTS"]) == new.get(m["HCP_ID"], 0)


def test_content_files_are_copied(tmp_path):
    content = tmp_path / "content"
    content.mkdir()
    rule = {c: None for c in gen.COLUMNS["REF_COMPLIANCE_RULE"]}
    rule.update(RULE_ID="off", CHIP_LABEL="Off-label", SEVERITY="high", DEDUCTION=35,
                PATTERN=r"\boff[- ]label\b, \"quoted\"", IS_ACTIVE=True, SORT_ORDER=1)
    (content / "compliance_rules.json").write_text(json.dumps([rule]), encoding="utf-8")
    out = tmp_path / "out"
    gen.generate(out, AS_OF, SEED, content_dir=content)
    rows = read(out, "REF_COMPLIANCE_RULE")
    assert rows[0]["RULE_ID"] == "off" and rows[0]["IS_ACTIVE"] == "true"
    assert rows[0]["PATTERN"] == rule["PATTERN"] and rows[0]["SUPPRESS_PATTERN"] == ""
    assert not (out / "REF_TALKING_POINT.csv").exists()


def test_loader_batches_respect_param_cap(out):
    cols = common.bronze_tables()["FCT_INTERACTION"]
    rows = loader.read_csv(out / "FCT_INTERACTION.csv", cols)
    batches = loader.insert_batches("c.s.FCT_INTERACTION", cols, rows)
    assert sum(len(p) for _, p in batches) == len(rows) * len(cols)
    assert all(len(p) <= 250 for _, p in batches)


def test_deploy_skip_catalog():
    deploy = _load("deploy_schema", DATABRICKS / "scripts" / "deploy_schema.py")
    s = common.Settings("h", "t", "w", "cat", "bronze", "app", "sp")
    full = deploy.planned_statements(s, skip_catalog=False, with_grants=True)
    skipped = deploy.planned_statements(s, skip_catalog=True, with_grants=False)
    assert any("CREATE CATALOG IF NOT EXISTS cat" in st for _, st in full)
    assert not any("CREATE CATALOG" in st for _, st in skipped)
    assert all("${" not in st for _, st in full)
    assert sum("CREATE TABLE" in st for _, st in skipped) == len(common.bronze_tables()) + len(common.app_tables())
