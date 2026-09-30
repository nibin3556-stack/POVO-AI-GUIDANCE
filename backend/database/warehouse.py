"""One data-access interface over two engines: Databricks SQL and local DuckDB.

    query(sql, params)   -> list[dict]     (column name -> Python value)
    execute(sql, params) -> None
    insert(table, rows)                    (app tables, short name)
    merge(table, keys, rows)               (upsert on the logical key)

SQL is written ONCE, portable, with Databricks-style `:name` parameters and
fully qualified `catalog.schema.TABLE` names (database/tables.py):

  * DatabricksWarehouse passes `:name` straight through: databricks-sql-connector
    4.x binds them natively on the warehouse, so values never touch the SQL text.
  * LocalWarehouse rewrites `:name` to DuckDB's `$name` and runs the same text
    against a DuckDB file ATTACHed under the catalog name. Bronze tables are
    (re)loaded from the seeder's CSVs at startup; app tables are created if
    missing and persist between restarts.

A list/tuple parameter is expanded (`IN (:ids)` -> `IN (:ids_0, :ids_1)`) so
both engines see scalars only. No ORM: the tables are Delta, keys are logical,
and every write is a plain INSERT, UPDATE, DELETE or MERGE.
"""
from __future__ import annotations

import csv
import logging
import os
import queue
import re
import threading
from datetime import date, datetime
from typing import Any, Iterable, Optional

from core.config import Settings, get_settings
from database import tables

logger = logging.getLogger("povo.warehouse")

_PARAM_RE = re.compile(r"(?<![:\w$]):([A-Za-z_]\w*)")


def _expand_lists(sql: str, params: Optional[dict]) -> tuple[str, dict]:
    """Turn list parameters into numbered scalars; an empty list matches nothing."""
    params = dict(params or {})
    for name, value in list(params.items()):
        if isinstance(value, (list, tuple, set)):
            values = list(value)
            del params[name]
            if not values:
                replacement = "NULL"
            else:
                names = [f"{name}_{i}" for i in range(len(values))]
                params.update(zip(names, values))
                replacement = ", ".join(f":{n}" for n in names)
            sql = re.sub(rf"(?<![:\w]):{name}\b", replacement, sql)
    return sql, params


class Warehouse:
    """Shared behaviour; engines implement _run(sql, params, fetch)."""

    name = "base"

    def query(self, sql: str, params: Optional[dict] = None) -> list[dict]:
        sql, params = _expand_lists(sql, params)
        return self._run(sql, params, fetch=True) or []

    def execute(self, sql: str, params: Optional[dict] = None) -> None:
        sql, params = _expand_lists(sql, params)
        self._run(sql, params, fetch=False)

    def ping(self) -> bool:
        try:
            return bool(self.query("SELECT 1 AS OK"))
        except Exception:  # noqa: BLE001 - health must answer, never raise
            logger.warning("Warehouse ping failed", exc_info=True)
            return False

    def insert(self, table: str, rows: Iterable[dict]) -> None:
        """Insert rows into an app table (short name, e.g. "APP_AUDIT_LOG")."""
        rows = list(rows)
        if not rows:
            return
        types = tables.column_types(table)
        cols = [c for c in types if c in rows[0]]
        values, params = [], {}
        for i, row in enumerate(rows):
            values.append("(" + ", ".join(f"CAST(:{c}_{i} AS {types[c]})" for c in cols) + ")")
            params.update({f"{c}_{i}": row.get(c) for c in cols})
        self.execute(f"INSERT INTO {tables.app(table)} ({', '.join(cols)}) VALUES {', '.join(values)}", params)

    def merge(self, table: str, keys: list[str], rows: Iterable[dict]) -> None:
        raise NotImplementedError

    def close(self) -> None:  # pragma: no cover - engine specific
        pass

    def _run(self, sql: str, params: dict, fetch: bool):  # pragma: no cover
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Databricks
# ---------------------------------------------------------------------------
class DatabricksWarehouse(Warehouse):
    """databricks-sql-connector with a small pool of open connections.

    Opening a warehouse connection costs about a second, and one page load
    fires several requests, so a handful are kept open and reused. The
    connector is imported lazily: local mode and the tests never load it.
    """

    name = "databricks"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._pool: "queue.LifoQueue" = queue.LifoQueue(maxsize=max(1, settings.databricks_pool_size))

    def _connect(self):
        from databricks import sql as dbsql  # lazy: heavy import, prod only

        return dbsql.connect(
            server_hostname=self.settings.databricks_hostname,
            http_path=self.settings.databricks_http_path,
            access_token=self.settings.databricks_token,
        )

    def _run(self, sql: str, params: dict, fetch: bool):
        try:
            conn = self._pool.get_nowait()
        except queue.Empty:
            conn = self._connect()
        broken = False
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params or None)
                if not fetch:
                    return None
                names = [d[0] for d in (cur.description or [])]
                return [dict(zip(names, row)) for row in cur.fetchall()]
        except Exception:
            broken = True
            raise
        finally:
            if broken:
                try:
                    conn.close()
                except Exception:  # noqa: BLE001
                    pass
            else:
                try:
                    self._pool.put_nowait(conn)
                except queue.Full:
                    conn.close()

    def merge(self, table: str, keys: list[str], rows: Iterable[dict]) -> None:
        rows = list(rows)
        if not rows:
            return
        types = tables.column_types(table)
        cols = [c for c in types if c in rows[0]]
        selects, params = [], {}
        for i, row in enumerate(rows):
            selects.append("SELECT " + ", ".join(f"CAST(:{c}_{i} AS {types[c]}) AS {c}" for c in cols))
            params.update({f"{c}_{i}": row.get(c) for c in cols})
        on = " AND ".join(f"tgt.{k} = src.{k}" for k in keys)
        update = ", ".join(f"tgt.{c} = src.{c}" for c in cols if c not in keys)
        sql = (f"MERGE INTO {tables.app(table)} AS tgt USING ({' UNION ALL '.join(selects)}) AS src ON {on} "
               + (f"WHEN MATCHED THEN UPDATE SET {update} " if update else "")
               + f"WHEN NOT MATCHED THEN INSERT ({', '.join(cols)}) VALUES ({', '.join('src.' + c for c in cols)})")
        self.execute(sql, params)

    def close(self) -> None:
        while True:
            try:
                self._pool.get_nowait().close()
            except queue.Empty:
                break
            except Exception:  # noqa: BLE001
                pass


# ---------------------------------------------------------------------------
# Local DuckDB
# ---------------------------------------------------------------------------
class LocalWarehouse(Warehouse):
    """A DuckDB file attached AS the catalog, so production SQL runs unchanged.

    One connection behind a lock: DuckDB connections are not safe for
    concurrent use from FastAPI's thread pool, and local traffic is one person.
    """

    name = "local"

    def __init__(self, settings: Settings) -> None:
        import duckdb

        self.settings = settings
        self._lock = threading.RLock()
        os.makedirs(os.path.dirname(os.path.abspath(settings.local_duckdb_path)), exist_ok=True)
        self._con = duckdb.connect()
        cat = settings.databricks_catalog
        path = os.path.abspath(settings.local_duckdb_path).replace("'", "''")
        self._con.execute(f"ATTACH '{path}' AS {cat}")
        self._con.execute(f"CREATE SCHEMA IF NOT EXISTS {cat}.{settings.databricks_schema}")
        self._con.execute(f"CREATE SCHEMA IF NOT EXISTS {cat}.{settings.databricks_app_schema}")
        self.loaded_tables: list[str] = []
        self._load_bronze()
        self._create_app_tables()

    # -- setup ---------------------------------------------------------------
    def _load_bronze(self) -> None:
        """(Re)load every bronze table from SEED_OUTPUT_DIR/<TABLE>.csv.

        Everything is read as text and CAST column by column from the declared
        types, so ZIP "04101", NPI and NETWORK_ID keep their leading zeros and a
        column order change in the seeder cannot silently shift values. A
        missing CSV leaves an EMPTY table, so queries still run (the content
        loader then falls back to the JSON files it owns).
        """
        folder = self.settings.seed_output_dir
        for table, cols in tables.BRONZE_COLUMNS.items():
            fqn = tables.bronze(table)
            csv_path = os.path.join(folder, f"{table}.csv")
            if os.path.isfile(csv_path):
                with open(csv_path, newline="", encoding="utf-8-sig") as fh:
                    header = next(csv.reader(fh), [])
                present = {h.strip().upper(): h for h in header}
                exprs = []
                for col, typ in cols:
                    src = present.get(col)
                    if src is None:
                        exprs.append(f"CAST(NULL AS {typ}) AS {col}")
                    elif typ == "STRING":
                        exprs.append(f'NULLIF("{src}", \'\') AS {col}')
                    else:
                        exprs.append(f'CAST(NULLIF(TRIM("{src}"), \'\') AS {typ}) AS {col}')
                p = csv_path.replace("'", "''")
                self._con.execute(
                    f"CREATE OR REPLACE TABLE {fqn} AS SELECT {', '.join(exprs)} "
                    f"FROM read_csv('{p}', header=true, all_varchar=true, quote='\"', escape='\"')")
                self.loaded_tables.append(table)
            else:
                ddl = ", ".join(f"{c} {t}" for c, t in cols)
                self._con.execute(f"CREATE OR REPLACE TABLE {fqn} ({ddl})")
        missing = [t for t in tables.BRONZE_COLUMNS if t not in self.loaded_tables]
        if missing:
            logger.warning("Local mode: no seed CSV for %s in %s (tables left empty)",
                           ", ".join(missing), folder)
        logger.info("Local mode: loaded %d bronze tables from %s", len(self.loaded_tables), folder)

    def _create_app_tables(self) -> None:
        for table, cols in tables.APP_COLUMNS.items():
            ddl = ", ".join(f"{c} {t}" for c, t in cols)
            self._con.execute(f"CREATE TABLE IF NOT EXISTS {tables.app(table)} ({ddl})")

    # -- engine ----------------------------------------------------------------
    def _run(self, sql: str, params: dict, fetch: bool):
        duck_sql = _PARAM_RE.sub(r"$\1", sql)
        with self._lock:
            cur = self._con.execute(duck_sql, params or {})
            if not fetch:
                return None
            names = [d[0] for d in (cur.description or [])]
            return [dict(zip(names, row)) for row in cur.fetchall()]

    def merge(self, table: str, keys: list[str], rows: Iterable[dict]) -> None:
        """Delete-then-insert in one transaction: the same end state as MERGE,
        and it works on every DuckDB release the requirements floor allows."""
        rows = list(rows)
        if not rows:
            return
        with self._lock:
            self._con.execute("BEGIN TRANSACTION")
            try:
                for row in rows:
                    where = " AND ".join(f"{k} = :{k}" for k in keys)
                    self.execute(f"DELETE FROM {tables.app(table)} WHERE {where}", {k: row[k] for k in keys})
                self.insert(table, rows)
                self._con.execute("COMMIT")
            except Exception:
                self._con.execute("ROLLBACK")
                raise

    def close(self) -> None:
        with self._lock:
            try:
                self._con.close()
            except Exception:  # noqa: BLE001
                pass


# ---------------------------------------------------------------------------
_instance: Optional[Warehouse] = None
_instance_lock = threading.Lock()


def get_warehouse() -> Warehouse:
    """The process-wide warehouse, created on first use (or at startup)."""
    global _instance
    if _instance is None:
        with _instance_lock:
            if _instance is None:
                s = get_settings()
                _instance = DatabricksWarehouse(s) if s.data_source == "databricks" else LocalWarehouse(s)
    return _instance


def reset_warehouse() -> None:
    """Close and forget the warehouse (tests, and app shutdown)."""
    global _instance
    with _instance_lock:
        if _instance is not None:
            _instance.close()
        _instance = None


def to_date(value: Any) -> Optional[date]:
    """Normalise a DATE value from either engine (or a CSV string) to date."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])
