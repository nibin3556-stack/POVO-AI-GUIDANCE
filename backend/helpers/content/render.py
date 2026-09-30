"""Template rendering for the content library.

Templates use `{snake_case}` placeholders rendered with `str.format_map` over a
safe dict (an unknown placeholder is left visible, never raises).

Some POC lines depend on the data ("3 of 12 HS patients are not on POVO yet"
vs "No POVO patients yet"). To keep EVERY word in the content JSON rather than
in code, a template may hold alternatives separated by ` || `, each optionally
prefixed by a condition `[flag]` or `[!flag]`. The first alternative whose
condition holds (or that has none) is used. The flags are documented in
databricks/seed/content/README.md.
"""
from __future__ import annotations

import re
from typing import Optional

_COND = re.compile(r"^\[(!?)([a-z_]+)\]\s*")


class _SafeDict(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def render(template: Optional[str], values: dict, flags: set[str]) -> Optional[str]:
    if template is None or template == "":
        return None
    chosen = None
    for alt in str(template).split("||"):
        alt = alt.strip()
        m = _COND.match(alt)
        if not m:
            chosen = alt
            break
        negate, flag = m.group(1) == "!", m.group(2)
        if (flag in flags) != negate:
            chosen = alt[m.end():]
            break
    if chosen is None:
        return None
    return chosen.format_map(_SafeDict(values)).strip()
