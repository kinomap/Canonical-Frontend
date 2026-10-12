"""
Frontend Nginx DNS Re-resolution Regression Tests — TZ §3

Root cause: When nginx uses a literal hostname in proxy_pass, it resolves
DNS once at startup and caches the IP. On backend container recreate, the
backend gets a new Docker IP while nginx still sends to the stale one → 502.

Fix: resolver 127.0.0.11 + $variable in proxy_pass forces per-request
DNS re-resolution through Docker's embedded DNS server.

Tests:
  1. Docker DNS resolver present (resolver 127.0.0.11)
  2. Backend hostname used (backend:8000 in $variable, not hardcoded IP)
  3. API proxy contract preserved (/api/ passes through unchanged)
  4. nginx -t config validity (via subprocess)
  5. Regression guard: no static IP in proxy_pass, resolver required
"""
import os
import re
import subprocess

import pytest

# ─────────────────────────────────────────────────────────────────────────────
# Fixture: load the production nginx.conf
# ─────────────────────────────────────────────────────────────────────────────

NGINX_CONF_PATH = os.path.join(
    os.path.dirname(__file__), "..", "nginx.conf"
)


@pytest.fixture(scope="module")
def nginx_conf() -> str:
    with open(NGINX_CONF_PATH) as f:
        return f.read()


# ─────────────────────────────────────────────────────────────────────────────
# Test 1 — Docker DNS resolver
# ─────────────────────────────────────────────────────────────────────────────

class TestDockerDNSResolver:
    """TZ §3 Test 1: resolver 127.0.0.11 must be present."""

    def test_docker_resolver_present(self, nginx_conf):
        """resolver directive must use Docker's embedded DNS (127.0.0.11)."""
        assert "resolver 127.0.0.11" in nginx_conf, (
            "nginx.conf must contain 'resolver 127.0.0.11' (Docker DNS). "
            "Without it, Nginx caches the backend IP at startup and breaks "
            "on backend container recreate."
        )

    def test_resolver_has_valid_ttl(self, nginx_conf):
        """resolver must have a valid= TTL to limit the cache duration."""
        match = re.search(r"resolver\s+127\.0\.0\.11\s+valid=(\d+)s", nginx_conf)
        assert match is not None, (
            "resolver 127.0.0.11 must include 'valid=<N>s' to cap the DNS "
            "cache TTL. Without it, cached IPs may persist too long."
        )
        ttl = int(match.group(1))
        assert ttl <= 30, (
            f"resolver valid TTL is {ttl}s — should be ≤30s so stale IPs "
            "are discarded quickly after backend recreate."
        )

    def test_ipv6_disabled(self, nginx_conf):
        """ipv6=off prevents Docker DNS from returning IPv6 addresses."""
        assert "ipv6=off" in nginx_conf, (
            "resolver must have 'ipv6=off' to prevent Docker DNS from "
            "returning IPv6 addresses that the backend doesn't listen on."
        )


# ─────────────────────────────────────────────────────────────────────────────
# Test 2 — Backend hostname (not hardcoded IP)
# ─────────────────────────────────────────────────────────────────────────────

class TestBackendHostname:
    """TZ §3 Test 2: backend must be addressed via hostname, not IP."""

    def test_backend_hostname_used_in_variable(self, nginx_conf):
        """A $variable must reference 'backend:8000' (Docker service name)."""
        # The variable declaration: set $xxx backend:8000;
        match = re.search(r"set\s+\$\w+\s+backend:8000", nginx_conf)
        assert match is not None, (
            "nginx.conf must declare a variable containing 'backend:8000' "
            "(e.g. 'set $backend_upstream backend:8000;'). "
            "The variable forces DNS re-resolution per request."
        )

    def test_no_hardcoded_docker_ip_in_proxy_pass(self, nginx_conf):
        """No hardcoded Docker IP (172.x.x.x or 10.x.x.x) in proxy_pass."""
        # Match proxy_pass lines containing a raw IP
        hardcoded_ip = re.findall(
            r"proxy_pass\s+https?://(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})",
            nginx_conf,
        )
        assert not hardcoded_ip, (
            f"Found hardcoded IP(s) in proxy_pass: {hardcoded_ip}. "
            "Docker assigns new IPs on container recreate — hardcoded IPs "
            "cause 502 after the backend container is recreated."
        )

    def test_api_proxy_uses_variable(self, nginx_conf):
        """The /api/ location must use $variable in proxy_pass, not literal hostname."""
        # Find the /api/ location block
        api_block = re.search(
            r"location\s+/api/\s*\{(.+?)\}",
            nginx_conf,
            re.DOTALL,
        )
        assert api_block is not None, "location /api/ block not found in nginx.conf"
        block = api_block.group(1)

        # Must use $variable, not literal http://backend:
        literal_backend = re.search(r"proxy_pass\s+https?://backend:", block)
        assert literal_backend is None, (
            "location /api/ uses a literal 'proxy_pass http://backend:...' — "
            "this caches the IP at startup. Use a $variable instead."
        )

        variable_proxy = re.search(r"proxy_pass\s+https?://\$\w+", block)
        assert variable_proxy is not None, (
            "location /api/ must use 'proxy_pass http://$variable' to enable "
            "Docker DNS re-resolution on each request."
        )

    def test_media_proxy_uses_variable(self, nginx_conf):
        """The /media/ location must use $variable in proxy_pass."""
        media_block = re.search(
            r"location\s+/media/\s*\{(.+?)\}",
            nginx_conf,
            re.DOTALL,
        )
        assert media_block is not None, "location /media/ block not found in nginx.conf"
        block = media_block.group(1)

        literal_backend = re.search(r"proxy_pass\s+https?://backend:", block)
        assert literal_backend is None, (
            "location /media/ uses a literal 'proxy_pass http://backend:...' — "
            "use a $variable to force DNS re-resolution."
        )


# ─────────────────────────────────────────────────────────────────────────────
# Test 3 — API proxy contract (URI semantics preserved)
# ─────────────────────────────────────────────────────────────────────────────

class TestAPIProxyContract:
    """TZ §3 Test 3: /api/ proxy must pass URI through unchanged."""

    def test_api_location_present(self, nginx_conf):
        """/api/ location must be present."""
        assert "location /api/" in nginx_conf, (
            "nginx.conf must have a 'location /api/' block."
        )

    def test_api_proxy_pass_no_path_suffix(self, nginx_conf):
        """proxy_pass in /api/ must NOT add a path suffix.

        With a $variable, proxy_pass http://$var/api/ would prepend /api/
        to the already-present /api/ prefix → backend receives /api/api/v1/...
        The correct form is proxy_pass http://$var; (no path suffix).
        """
        api_block = re.search(
            r"location\s+/api/\s*\{(.+?)\}",
            nginx_conf,
            re.DOTALL,
        )
        assert api_block, "location /api/ block not found"
        block = api_block.group(1)

        # Detect path suffix after the variable (e.g. http://$var/api/)
        double_path = re.search(
            r"proxy_pass\s+https?://\$\w+/",
            block,
        )
        assert double_path is None, (
            "proxy_pass http://$var/<path> in /api/ location causes path "
            "doubling: browser sends /api/v1/x → backend receives /<path>/api/v1/x. "
            "Use proxy_pass http://$var; (no path suffix) to pass URI unchanged."
        )

    def test_required_proxy_headers_present(self, nginx_conf):
        """Standard proxy headers must be forwarded in /api/ block."""
        api_block = re.search(
            r"location\s+/api/\s*\{(.+?)\}",
            nginx_conf,
            re.DOTALL,
        )
        assert api_block, "location /api/ block not found"
        block = api_block.group(1)

        for header in [
            "Host $host",
            "X-Real-IP $remote_addr",
            "X-Forwarded-For $proxy_add_x_forwarded_for",
        ]:
            assert header in block, (
                f"Required header '{header}' missing from /api/ proxy block."
            )

    def test_no_path_rewrite(self, nginx_conf):
        """No rewrite rules that could alter /api/ paths."""
        # rewrite directives inside the server block would change URI semantics
        api_block = re.search(
            r"location\s+/api/\s*\{(.+?)\}",
            nginx_conf,
            re.DOTALL,
        )
        if api_block:
            assert "rewrite" not in api_block.group(1), (
                "A rewrite rule inside location /api/ would alter URI semantics."
            )


# ─────────────────────────────────────────────────────────────────────────────
# Test 4 — nginx config validity
# ─────────────────────────────────────────────────────────────────────────────

class TestNginxConfigValidity:
    """TZ §3 Test 4: Production nginx config must pass nginx -t."""

    def test_nginx_t_passes(self):
        """nginx -t must succeed on the production nginx.conf."""
        conf_abs = os.path.abspath(NGINX_CONF_PATH)
        result = subprocess.run(
            [
                "docker", "run", "--rm",
                "-v", f"{conf_abs}:/etc/nginx/conf.d/default.conf:ro",
                "nginx:alpine",
                "nginx", "-t",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        assert result.returncode == 0, (
            f"nginx -t failed:\n{result.stderr}\n{result.stdout}"
        )
        combined = result.stdout + result.stderr
        assert "syntax is ok" in combined, (
            f"nginx -t did not report 'syntax is ok':\n{combined}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# Test 5 — Regression guard against stale upstream regression
# ─────────────────────────────────────────────────────────────────────────────

class TestStaleUpstreamRegressionGuard:
    """TZ §3 Test 5: Prevent re-introduction of static backend upstream."""

    def test_resolver_required_when_variable_used(self, nginx_conf):
        """If a $variable is used in proxy_pass, resolver must be present.

        Without resolver, nginx falls back to system DNS which doesn't
        support runtime re-resolution — stale IPs return.
        """
        uses_variable = bool(re.search(r"proxy_pass\s+https?://\$\w+", nginx_conf))
        has_resolver = "resolver 127.0.0.11" in nginx_conf

        if uses_variable:
            assert has_resolver, (
                "nginx.conf uses a $variable in proxy_pass but has no "
                "'resolver 127.0.0.11' directive. Without a resolver, "
                "variable-based proxy_pass cannot resolve hostnames at "
                "request time — add 'resolver 127.0.0.11 valid=10s ipv6=off;'."
            )

    def test_no_upstream_block_with_static_backend(self, nginx_conf):
        """No upstream{} block that hard-codes backend IP.

        A static upstream block like:
            upstream backend { server 172.21.0.3:8000; }
        pins the IP and causes the same stale upstream problem.
        """
        # Look for upstream blocks containing a raw IP pointing at port 8000
        upstream_with_ip = re.search(
            r"upstream\s+\w+\s*\{[^}]*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+",
            nginx_conf,
            re.DOTALL,
        )
        assert upstream_with_ip is None, (
            "Found an upstream{} block with a hardcoded IP. This causes the "
            "same stale upstream problem as a literal proxy_pass hostname. "
            "Use resolver + $variable instead."
        )

    def test_static_ip_not_in_set_variable(self, nginx_conf):
        """The $backend_upstream variable must not be set to a raw IP."""
        # set $var 172.x.x.x:8000 — wrong, must be backend:8000
        static_ip_var = re.findall(
            r"set\s+\$\w+\s+\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+",
            nginx_conf,
        )
        assert not static_ip_var, (
            f"Found set $var with static IP: {static_ip_var}. "
            "The variable must use the Docker service hostname (e.g. backend:8000), "
            "not a raw IP that becomes stale on container recreate."
        )

    def test_backend_variable_uses_service_name(self, nginx_conf):
        """$backend_upstream (or equivalent) must use a Docker service name."""
        # Matches: set $var backend:8000 or set $var backend:port
        service_name_var = re.search(
            r"set\s+\$\w+\s+[a-z][a-z0-9_-]*:\d+",
            nginx_conf,
        )
        assert service_name_var is not None, (
            "No 'set $var <service>:<port>' found in nginx.conf. "
            "The backend upstream variable must use a Docker service name "
            "(e.g. 'set $backend_upstream backend:8000;') for DNS re-resolution."
        )
