"""Frontend Nginx SPA contract (nginx.conf is baked into the frontend image).

Regressions covered:
* after a redeploy, browsers holding the previous build requested a removed hashed
  chunk (/assets/SeriesCatalogView-<old>.js); the SPA fallback answered with
  index.html (200 text/html), the module import failed and the "Series" tab click
  silently did nothing;
* /genres?genre=... hit the static genres/ artwork directory and was answered with
  an absolute 301 that dropped the public port.
"""
import re
from pathlib import Path

CONF = (Path(__file__).resolve().parents[1] / "nginx.conf").read_text(encoding="utf-8")


def _block(prefix: str) -> str:
    m = re.search(r"location\s+" + re.escape(prefix) + r"\s*\{(.*?)\n    \}", CONF, re.S)
    assert m, f"missing location {prefix}"
    return m.group(1)


def test_hashed_assets_never_fall_back_to_index_html():
    for loc in ("^~ /assets/", "^~ /admin/assets/"):
        body = _block(loc)
        assert re.search(r"try_files\s+\$uri\s+=404;", body), loc
        assert "index.html" not in body, loc
        assert "immutable" in body, loc


def test_index_html_is_revalidated():
    for loc in ("= /index.html", "= /admin/index.html"):
        assert 'Cache-Control "no-cache"' in _block(loc), loc


def test_spa_fallback_does_not_redirect_into_static_directories():
    body = _block("/")
    assert re.search(r"try_files\s+\$uri\s+/index.html;", body)
    assert "$uri/" not in body


def test_redirects_are_relative_behind_reverse_proxy():
    assert re.search(r"^\s*absolute_redirect\s+off;", CONF, re.M)


def test_backend_still_only_reached_through_proxy_locations():
    # No direct exposure changes: the backend is only a proxy_pass upstream.
    assert "listen 80;" in CONF and ":8000;" in CONF
    assert not re.search(r"listen\s+.*8000", CONF)
