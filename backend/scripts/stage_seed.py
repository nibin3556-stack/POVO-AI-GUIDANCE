"""Copy the seed data into backend/seed/ so a Posit deploy of backend/ carries it.

Posit Connect receives only the backend folder, but with DATA_SOURCE=sqlite the
backend fills its empty tables at the first start from databricks/seed/output
(CSVs) and reads databricks/seed/content (JSON). core/config.py falls back to
backend/seed/<name> when the repo copy is not there. Run before every deploy:

    .venv\\Scripts\\python scripts\\stage_seed.py

backend/seed/ is gitignored.
"""
from __future__ import annotations

import shutil
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
SEED = BACKEND.parent / "databricks" / "seed"


def main() -> None:
    for name in ("output", "content"):
        src, dst = SEED / name, BACKEND / "seed" / name
        if not any(src.glob("*.csv" if name == "output" else "*.json")):
            raise SystemExit(f"{src} is empty: run databricks/seed/generate_seed_data.py first")
        shutil.rmtree(dst, ignore_errors=True)
        shutil.copytree(src, dst)
        print(f"{src} -> {dst} ({sum(1 for _ in dst.iterdir())} files)")


if __name__ == "__main__":
    main()
