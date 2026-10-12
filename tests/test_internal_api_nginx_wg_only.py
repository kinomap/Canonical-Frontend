"""Regression: /api/v1/internal/* must only be reachable from the WireGuard
subnet at the Control Plane Nginx (defence in depth on top of HMAC). Before,
only /api/v1/internal/acme/ was restricted and heartbeat/session-sync were
reachable through the host reverse proxy (LAN/:80/:8080/trycloudflare)."""
import re
from pathlib import Path

CONF = (Path(__file__).resolve().parents[1] / "nginx.conf").read_text(encoding="utf-8")


def _block(prefix: str) -> str:
    m = re.search(r"location\s+\^~\s+" + re.escape(prefix) + r"\s*\{(.*?)\n    \}", CONF, re.S)
    assert m, f"location ^~ {prefix} missing"
    return m.group(1)


def test_internal_api_restricted_to_wg_subnet():
    body = _block("/api/v1/internal/")
    assert "allow 10.8.0.0/24;" in body
    assert "deny all;" in body
    assert body.index("allow 10.8.0.0/24;") < body.index("deny all;")


def test_acme_stays_restricted():
    body = _block("/api/v1/internal/acme/")
    assert "allow 10.8.0.0/24;" in body and "deny all;" in body


def test_internal_block_precedes_generic_api():
    assert CONF.index("location ^~ /api/v1/internal/ ") < CONF.index("location /api/ ")
