"""Logging setup: one format for the whole app, with the request id on every line.

Log lines never carry note text, identity header values, tokens or SQL
parameters. Code logs ids, counts and timings only.
"""
import logging

from core.request_id import current_request_id


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = current_request_id.get() or "-"
        return True


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    if getattr(root, "_povo_configured", False):
        root.setLevel(level.upper())
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s"))
    handler.addFilter(_RequestIdFilter())
    root.addHandler(handler)
    root.setLevel(level.upper())
    root._povo_configured = True  # type: ignore[attr-defined]
